import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/database";
import { activeWorktrees, workspaceRepos } from "../../db/schema";
import {
  NotFoundError,
  UncommittedChangesError,
  ValidationError,
  WorktreeInUseError,
} from "../../utils/errors";
import {
  getAheadBehind,
  getChangedFilesCount,
  getCurrentBranchName,
  getLastFetchTime,
  hasUncommittedChanges,
  runGit,
} from "../../utils/git";
import { createStatusWatcher } from "./status-watcher/status-watcher.service";
import type {
  StatusWatcherSubscriber,
  StatusWatcher as WorktreeStatusWatcher,
} from "./status-watcher/status-watcher.types";
import type {
  ActiveWorktree,
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  WorktreeResult,
  WorktreeStatus,
  WorktreeWithStatus,
} from "./worktree.types";

const FEATURE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATH_TEMPLATE = "../{repo-name}-worktrees/{branch}";

async function computeStatusForPath(worktreePath: string): Promise<WorktreeStatus> {
  const [changedFiles, branchName, aheadBehind, lastFetch] = await Promise.all([
    getChangedFilesCount(worktreePath),
    getCurrentBranchName(worktreePath),
    getAheadBehind(worktreePath),
    getLastFetchTime(worktreePath),
  ]);

  return {
    hasChanges: changedFiles > 0,
    changedFiles,
    branchName,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
    lastFetch,
  };
}

const statusWatcher: WorktreeStatusWatcher = createStatusWatcher({
  computeStatus: computeStatusForPath,
});

export function subscribeWorktreeStatus(listener: StatusWatcherSubscriber): () => void {
  return statusWatcher.subscribe(listener);
}

export async function shutdownWorktreeStatusWatcher(): Promise<void> {
  await statusWatcher.shutdown();
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const output = await runGit(["worktree", "list", "--porcelain"], repoPath);
  if (!output) return [];

  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length);
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace("refs/heads/", "");
    } else if (line === "bare") {
      current.isMain = true;
    } else if (line === "") {
      if (current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch ?? "",
          head: current.head ?? "",
          isMain: current.isMain ?? worktrees.length === 0,
        });
      }
      current = {};
    }
  }

  if (current.path) {
    worktrees.push({
      path: current.path,
      branch: current.branch ?? "",
      head: current.head ?? "",
      isMain: current.isMain ?? worktrees.length === 0,
    });
  }

  return worktrees;
}

export async function createWorktree(input: WorktreeCreateInput): Promise<Worktree> {
  await runGit(["worktree", "add", "-b", input.branch, input.path], input.repoPath);
  const head = await runGit(["rev-parse", "HEAD"], input.path);
  return { path: input.path, branch: input.branch, head, isMain: false };
}

export async function removeWorktree(input: WorktreeRemoveInput): Promise<void> {
  const args = ["worktree", "remove", input.path];
  if (input.force) args.push("--force");
  await runGit(args, input.repoPath);
}

export function computeWorktreePath(repoPath: string, branch: string): string {
  const repoName = basename(repoPath);
  const safeBranch = branch.replace(/\//g, "-");
  const rendered = PATH_TEMPLATE.replace("{repo-name}", repoName).replace("{branch}", safeBranch);
  return resolve(repoPath, rendered);
}

function getActiveWorktreeRow(worktreeId: string) {
  const db = getDb();
  const row = db.select().from(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).get();
  if (!row) throw new NotFoundError("ActiveWorktree", worktreeId);
  return row;
}

export async function createWorktreesForFeature(
  workspaceId: string,
  featureName: string,
  branchName: string,
): Promise<WorktreeResult[]> {
  if (!FEATURE_NAME_RE.test(featureName)) {
    throw new ValidationError(
      `featureName "${featureName}" must match /^[a-z0-9][a-z0-9-]{0,63}$/`,
    );
  }

  const db = getDb();
  const repos = db
    .select()
    .from(workspaceRepos)
    .where(eq(workspaceRepos.workspaceId, workspaceId))
    .all();

  if (repos.length === 0) {
    throw new NotFoundError("Workspace repos", workspaceId);
  }

  const settled = await Promise.allSettled(
    repos.map(async (repo): Promise<ActiveWorktree> => {
      const path = computeWorktreePath(repo.path, branchName);
      await createWorktree({ repoPath: repo.path, branch: branchName, path });
      const id = randomUUID();
      const now = new Date().toISOString();
      const row = {
        id,
        repoId: repo.id,
        featureName,
        branch: branchName,
        path,
        agentSessionId: null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(activeWorktrees).values(row).run();
      try {
        statusWatcher.startWatching(id, path);
        return { ...row, repo };
      } catch (error) {
        db.delete(activeWorktrees).where(eq(activeWorktrees.id, id)).run();
        await removeWorktree({ repoPath: repo.path, path, force: true });
        throw error;
      }
    }),
  );

  return settled.map((result, idx): WorktreeResult => {
    const { id: repoId } = repos[idx] as (typeof repos)[number];
    if (result.status === "fulfilled") {
      return { repoId, ok: true, worktree: result.value };
    }
    const reason = result.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    return { repoId, ok: false, error: message };
  });
}

async function loadWorkspaceWorktrees(workspaceId: string): Promise<ActiveWorktree[]> {
  const db = getDb();
  const repos = db
    .select()
    .from(workspaceRepos)
    .where(eq(workspaceRepos.workspaceId, workspaceId))
    .all();

  if (repos.length === 0) return [];

  const repoById = new Map(repos.map((r) => [r.id, r]));
  const rows = db
    .select()
    .from(activeWorktrees)
    .where(
      inArray(
        activeWorktrees.repoId,
        repos.map((r) => r.id),
      ),
    )
    .all();

  const flat: ActiveWorktree[] = [];
  for (const row of rows) {
    const parent = repoById.get(row.repoId);
    if (!parent) continue;
    flat.push({ ...row, repo: parent });
  }
  return flat;
}

export async function computeAllStatuses(
  workspaceId: string,
): Promise<Record<string, WorktreeStatus>> {
  const worktrees = await loadWorkspaceWorktrees(workspaceId);
  const statuses = await Promise.all(
    worktrees.map(async (worktree) => {
      const status = await getWorktreeStatus(worktree.id);
      return [worktree.id, status] as const;
    }),
  );
  return Object.fromEntries(statuses);
}

export async function listWorkspaceWorktrees(workspaceId: string): Promise<WorktreeWithStatus[]> {
  const worktrees = await loadWorkspaceWorktrees(workspaceId);

  const withStatus = await Promise.all(
    worktrees.map(async (worktree) => {
      statusWatcher.startWatching(worktree.id, worktree.path);
      const status = await getWorktreeStatus(worktree.id);
      return { ...worktree, status };
    }),
  );

  return withStatus;
}

export async function removeTrackedWorktree(worktreeId: string, force = false): Promise<void> {
  const db = getDb();
  const row = db.select().from(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).get();
  if (!row) throw new NotFoundError("ActiveWorktree", worktreeId);

  const repo = db.select().from(workspaceRepos).where(eq(workspaceRepos.id, row.repoId)).get();
  if (!repo) throw new NotFoundError("WorkspaceRepo", row.repoId);

  if (!force) {
    if (row.agentSessionId !== null) {
      throw new WorktreeInUseError(worktreeId);
    }
    if (await hasUncommittedChanges(row.path)) {
      throw new UncommittedChangesError(row.path);
    }
  }

  await statusWatcher.stopWatching(worktreeId);
  await removeWorktree({ repoPath: repo.path, path: row.path, force });
  db.delete(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).run();
}

export async function getWorktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
  const row = getActiveWorktreeRow(worktreeId);
  return computeStatusForPath(row.path);
}

export async function refreshWorktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
  const status = await getWorktreeStatus(worktreeId);
  statusWatcher.notify(worktreeId, status);
  return status;
}
