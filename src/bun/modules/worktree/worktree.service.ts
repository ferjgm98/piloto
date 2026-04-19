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
import { hasUncommittedChanges, runGit } from "../../utils/git";
import type {
  ActiveWorktree,
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  WorktreeResult,
  WorktreeStatus,
} from "./worktree.types";

const FEATURE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATH_TEMPLATE = "../{repo-name}-worktrees/{branch}";

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
    repos.map(async (repo) => {
      const path = computeWorktreePath(repo.path, branchName);
      await createWorktree({ repoPath: repo.path, branch: branchName, path });
      const id = randomUUID();
      const now = new Date().toISOString();
      db.insert(activeWorktrees)
        .values({
          id,
          repoId: repo.id,
          featureName,
          branch: branchName,
          path,
          agentSessionId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const row = db.select().from(activeWorktrees).where(eq(activeWorktrees.id, id)).get();
      if (!row) throw new NotFoundError("ActiveWorktree", id);
      const worktree: ActiveWorktree = { ...row, repo };
      return worktree;
    }),
  );

  return settled.map((result, idx): WorktreeResult => {
    const repo = repos[idx];
    if (!repo) {
      return { repoId: "", ok: false, error: "missing repo for result" };
    }
    if (result.status === "fulfilled") {
      return { repoId: repo.id, ok: true, worktree: result.value };
    }
    const reason = result.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    return { repoId: repo.id, ok: false, error: message };
  });
}

export function listWorkspaceWorktrees(workspaceId: string): ActiveWorktree[] {
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

  await removeWorktree({ repoPath: repo.path, path: row.path, force });
  db.delete(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).run();
}

export async function getWorktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
  const db = getDb();
  const row = db.select().from(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).get();
  if (!row) throw new NotFoundError("ActiveWorktree", worktreeId);

  return {
    path: row.path,
    branch: row.branch,
    hasUncommittedChanges: await hasUncommittedChanges(row.path),
    hasRunningAgents: row.agentSessionId !== null,
  };
}
