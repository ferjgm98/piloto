import { randomUUID } from "node:crypto";
import { watch as watchFs } from "node:fs";
import { createRequire } from "node:module";
import { basename, relative, resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db/database";
import { activeWorktrees, workspaceRepos } from "../../db/schema";
import {
  NotFoundError,
  UncommittedChangesError,
  ValidationError,
  WorktreeAlreadyHasWatcherError,
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
import { createLogger } from "../../utils/logger";
import type {
  ActiveWorktree,
  FileChangeEvent,
  Watcher,
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  WorktreeResult,
  WorktreeStatus,
  WorktreeWithStatus,
} from "./worktree.types";

const FEATURE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATH_TEMPLATE = "../{repo-name}-worktrees/{branch}";
const WATCH_DEBOUNCE_MS = 100;
const log = createLogger("worktree");
const require = createRequire(import.meta.url);

type WorktreeStatusListener = (payload: {
  worktreeId: string;
  status: WorktreeStatus;
}) => void;

type WatcherEntry = Watcher & {
  timeoutId: ReturnType<typeof setTimeout> | null;
};

const watcherRegistry = new Map<string, WatcherEntry>();
const WATCHER_IGNORE_PATTERNS = [
  ".git",
  ".git/**",
  "**/.git/**",
  "node_modules",
  "node_modules/**",
  "**/node_modules/**",
  ".DS_Store",
  "**/.DS_Store",
  "build",
  "build/**",
  "**/build/**",
  "dist",
  "dist/**",
  "**/dist/**",
];

let worktreeStatusListener: WorktreeStatusListener | null = null;

type ParcelWatcherModule = {
  subscribe: (
    dir: string,
    fn: (
      error: Error | null,
      events: { path: string; type: "create" | "update" | "delete" }[],
    ) => void,
    opts?: { ignore?: string[] },
  ) => Promise<{ unsubscribe: () => Promise<void> }>;
};

type ParcelWatcherBinding = {
  subscribe: (
    dir: string,
    fn: (
      error: Error | null,
      events: { path: string; type: "create" | "update" | "delete" }[],
    ) => void,
    opts?: Record<string, unknown>,
  ) => Promise<void>;
  unsubscribe: (
    dir: string,
    fn: (
      error: Error | null,
      events: { path: string; type: "create" | "update" | "delete" }[],
    ) => void,
    opts?: Record<string, unknown>,
  ) => Promise<void>;
};

function wrapParcelWatcherBinding(moduleName: string): ParcelWatcherModule {
  const binding = require(moduleName) as ParcelWatcherBinding;

  return {
    async subscribe(dir, fn) {
      const resolvedDir = resolve(dir);
      await binding.subscribe(resolvedDir, fn, {});

      return {
        unsubscribe() {
          return binding.unsubscribe(resolvedDir, fn, {});
        },
      };
    },
  };
}

function createFsWatcherFallback(): ParcelWatcherModule {
  return {
    async subscribe(dir, fn) {
      const resolvedDir = resolve(dir);
      const fallbackWatcher = watchFs(
        resolvedDir,
        {
          persistent: false,
          recursive: process.platform === "darwin" || process.platform === "win32",
        },
        (_eventType, filename) => {
          const filePath =
            typeof filename === "string" && filename.length > 0
              ? resolve(resolvedDir, filename)
              : resolvedDir;

          fn(null, [{ path: filePath, type: "update" }]);
        },
      );

      return {
        async unsubscribe() {
          fallbackWatcher.close();
        },
      };
    },
  };
}

function loadParcelWatcher(): ParcelWatcherModule {
  try {
    if (process.platform === "darwin") {
      if (process.arch === "arm64") {
        return wrapParcelWatcherBinding("@parcel/watcher-darwin-arm64");
      }
      if (process.arch === "x64") {
        return wrapParcelWatcherBinding("@parcel/watcher-darwin-x64");
      }
    }

    if (process.platform === "win32") {
      if (process.arch === "arm64") {
        return wrapParcelWatcherBinding("@parcel/watcher-win32-arm64");
      }
      if (process.arch === "ia32") {
        return wrapParcelWatcherBinding("@parcel/watcher-win32-ia32");
      }
      if (process.arch === "x64") {
        return wrapParcelWatcherBinding("@parcel/watcher-win32-x64");
      }
    }

    if (process.platform === "linux") {
      const { familySync, MUSL } = require("detect-libc") as {
        familySync: () => string | null;
        MUSL: string;
      };
      const libc = familySync();
      const suffix = libc === MUSL ? "musl" : "glibc";

      if (process.arch === "arm") {
        return wrapParcelWatcherBinding(`@parcel/watcher-linux-arm-${suffix}`);
      }
      if (process.arch === "arm64") {
        return wrapParcelWatcherBinding(`@parcel/watcher-linux-arm64-${suffix}`);
      }
      if (process.arch === "x64") {
        return wrapParcelWatcherBinding(`@parcel/watcher-linux-x64-${suffix}`);
      }
    }

    if (process.platform === "android" && process.arch === "arm64") {
      return wrapParcelWatcherBinding("@parcel/watcher-android-arm64");
    }

    if (process.platform === "freebsd" && process.arch === "x64") {
      return wrapParcelWatcherBinding("@parcel/watcher-freebsd-x64");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`parcel watcher unavailable, falling back to fs.watch: ${message}`);
  }

  return createFsWatcherFallback();
}

const watcher = loadParcelWatcher();

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

export function setWorktreeStatusNotifier(listener: WorktreeStatusListener | null): void {
  worktreeStatusListener = listener;
}

function shouldIgnoreFileEvent(worktreePath: string, eventPath: string): boolean {
  const relativePath = relative(worktreePath, eventPath);
  if (relativePath.startsWith("..")) return true;

  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized === ".DS_Store" || normalized.endsWith("/.DS_Store")) return true;

  const parts = normalized.split("/").filter(Boolean);
  return (
    parts.includes(".git") ||
    parts.includes("node_modules") ||
    parts.includes("build") ||
    parts.includes("dist")
  );
}

function notifyStatusChanged(worktreeId: string, status: WorktreeStatus): void {
  worktreeStatusListener?.({ worktreeId, status });
}

function getActiveWorktreeRow(worktreeId: string) {
  const db = getDb();
  const row = db.select().from(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).get();
  if (!row) throw new NotFoundError("ActiveWorktree", worktreeId);
  return row;
}

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

function queueStatusRefresh(worktreeId: string): void {
  const entry = watcherRegistry.get(worktreeId);
  if (!entry) return;

  if (entry.timeoutId !== null) {
    clearTimeout(entry.timeoutId);
  }

  entry.timeoutId = setTimeout(() => {
    entry.timeoutId = null;
    void refreshWorktreeStatus(worktreeId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`failed to refresh status for ${worktreeId}: ${message}`);
    });
  }, WATCH_DEBOUNCE_MS);
}

function toFileChangeEvent(
  worktreePath: string,
  event: { path: string; type: "create" | "update" | "delete" },
): FileChangeEvent | null {
  if (shouldIgnoreFileEvent(worktreePath, event.path)) return null;

  return {
    path: event.path,
    type: event.type === "create" ? "created" : event.type === "update" ? "modified" : "deleted",
  };
}

export async function createWatcher(worktreeId: string, worktreePath: string): Promise<Watcher> {
  if (watcherRegistry.has(worktreeId)) {
    throw new WorktreeAlreadyHasWatcherError(worktreeId);
  }

  const subscription = await watcher.subscribe(
    worktreePath,
    (error, events) => {
      if (error) {
        log.error(`watcher error for ${worktreeId}: ${error.message}`);
        return;
      }

      const hasRelevantEvents = events.some((event) => {
        return toFileChangeEvent(worktreePath, event) !== null;
      });

      if (!hasRelevantEvents) return;
      queueStatusRefresh(worktreeId);
    },
    { ignore: WATCHER_IGNORE_PATTERNS },
  );

  const handle: WatcherEntry = {
    worktreeId,
    timeoutId: null,
    unsubscribe: async () => {
      if (handle.timeoutId !== null) {
        clearTimeout(handle.timeoutId);
        handle.timeoutId = null;
      }
      await subscription.unsubscribe();
    },
  };

  watcherRegistry.set(worktreeId, handle);
  return handle;
}

export async function destroyWatcher(worktreeId: string): Promise<void> {
  const existing = watcherRegistry.get(worktreeId);
  if (!existing) return;

  watcherRegistry.delete(worktreeId);
  await existing.unsubscribe();
}

async function ensureWatcher(worktreeId: string, worktreePath: string): Promise<void> {
  if (watcherRegistry.has(worktreeId)) return;

  try {
    await createWatcher(worktreeId, worktreePath);
  } catch (error) {
    if (error instanceof WorktreeAlreadyHasWatcherError) return;
    throw error;
  }
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
        await ensureWatcher(id, path);
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
      await ensureWatcher(worktree.id, worktree.path);
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

  await destroyWatcher(worktreeId);
  await removeWorktree({ repoPath: repo.path, path: row.path, force });
  db.delete(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).run();
}

export async function getWorktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
  const row = getActiveWorktreeRow(worktreeId);
  return computeStatusForPath(row.path);
}

export async function refreshWorktreeStatus(worktreeId: string): Promise<WorktreeStatus> {
  const status = await getWorktreeStatus(worktreeId);
  notifyStatusChanged(worktreeId, status);
  return status;
}
