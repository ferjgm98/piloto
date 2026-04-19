import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb, initializeDatabase } from "../../db/database";
import { activeWorktrees, agentSessions, workspaceRepos, workspaces } from "../../db/schema";
import {
  UncommittedChangesError,
  WorktreeAlreadyHasWatcherError,
  WorktreeInUseError,
} from "../../utils/errors";
import { resetTestDb } from "../../utils/test-setup";
import {
  computeWorktreePath,
  createWatcher,
  createWorktree,
  destroyWatcher,
  getWorktreeStatus,
  listWorkspaceWorktrees,
  listWorktrees,
  refreshWorktreeStatus,
  removeTrackedWorktree,
  removeWorktree,
  setWorktreeStatusNotifier,
} from "./worktree.service";

function git(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function initGitRepo(repoPath: string) {
  mkdirSync(repoPath, { recursive: true });
  git(["init"], repoPath);
  git(["config", "user.name", "Piloto Tests"], repoPath);
  git(["config", "user.email", "piloto@example.com"], repoPath);
  writeFileSync(join(repoPath, "README.md"), "# Piloto\n");
  git(["add", "README.md"], repoPath);
  git(["commit", "-m", "initial commit"], repoPath);
  git(["branch", "-m", "main"], repoPath);
}

function initBareGitRepo(repoPath: string) {
  mkdirSync(repoPath, { recursive: true });
  git(["init", "--bare"], repoPath);
}

type TrackedInsert = {
  id: string;
  repoId: string;
  branch: string;
  featureName: string;
  path: string;
  agentSessionId?: string | null;
};

function insertActiveWorktree(db: ReturnType<typeof getDb>, input: TrackedInsert) {
  const now = new Date().toISOString();
  db.insert(activeWorktrees)
    .values({
      id: input.id,
      repoId: input.repoId,
      featureName: input.featureName,
      branch: input.branch,
      path: input.path,
      agentSessionId: input.agentSessionId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

describe("worktree.service", () => {
  let rootDir: string;
  let repoPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "piloto-worktree-test-"));
    repoPath = join(rootDir, "repo");
    initGitRepo(repoPath);
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
    setWorktreeStatusNotifier(null);
  });

  test("listWorktrees includes the main worktree", async () => {
    const worktrees = await listWorktrees(repoPath);
    const canonicalRepoPath = realpathSync(repoPath);

    expect(worktrees.some((worktree) => worktree.path === canonicalRepoPath)).toBe(true);
    expect(
      worktrees.some((worktree) => worktree.path === canonicalRepoPath && worktree.isMain),
    ).toBe(true);
  });

  test("createWorktree adds a new branch and removeWorktree removes it", async () => {
    const worktreePath = join(rootDir, "feature-worktree");

    const created = await createWorktree({
      repoPath,
      branch: "feature/pil-31",
      path: worktreePath,
    });

    expect(created.branch).toBe("feature/pil-31");
    expect(created.path).toBe(worktreePath);

    const afterCreate = await listWorktrees(repoPath);
    expect(afterCreate.some((worktree) => worktree.branch === "feature/pil-31")).toBe(true);

    await removeWorktree({ repoPath, path: worktreePath });

    const afterRemove = await listWorktrees(repoPath);
    expect(afterRemove.some((worktree) => worktree.path === worktreePath)).toBe(false);
  });

  test("computeWorktreePath replaces slashes in branch names with dashes", () => {
    const result = computeWorktreePath("/tmp/my-repo", "feature/pil-19");
    expect(result.endsWith("/my-repo-worktrees/feature-pil-19")).toBe(true);
  });
});

describe("worktree.service (tracked)", () => {
  let rootDir: string;
  let repoPath: string;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    await initializeDatabase({ path: ":memory:" });
  });

  beforeEach(() => {
    resetTestDb(getDb());

    rootDir = mkdtempSync(join(tmpdir(), "piloto-tracked-test-"));
    repoPath = join(rootDir, "repo");
    initGitRepo(repoPath);

    const db = getDb();
    workspaceId = randomUUID();
    repoId = randomUUID();
    db.insert(workspaces).values({ id: workspaceId, name: "ws" }).run();
    db.insert(workspaceRepos)
      .values({ id: repoId, workspaceId, path: realpathSync(repoPath) })
      .run();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("removeTrackedWorktree throws WorktreeInUseError when agent attached and not forced", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-inuse");
    await createWorktree({ repoPath: canonical, branch: "feature/inuse", path: wtPath });

    const db = getDb();
    const sessionId = randomUUID();
    db.insert(agentSessions)
      .values({ id: sessionId, workspaceId, backend: "codex", status: "idle" })
      .run();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/inuse",
      featureName: "inuse",
      path: wtPath,
      agentSessionId: sessionId,
    });

    await expect(removeTrackedWorktree(worktreeId, false)).rejects.toBeInstanceOf(
      WorktreeInUseError,
    );

    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });

  test("removeTrackedWorktree throws UncommittedChangesError when dirty and not forced", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-dirty");
    await createWorktree({ repoPath: canonical, branch: "feature/dirty", path: wtPath });
    writeFileSync(join(wtPath, "dirty.txt"), "dirty\n");

    const db = getDb();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/dirty",
      featureName: "dirty",
      path: wtPath,
    });

    await expect(removeTrackedWorktree(worktreeId, false)).rejects.toBeInstanceOf(
      UncommittedChangesError,
    );

    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });

  test("removeTrackedWorktree with force=true succeeds and deletes the row", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-force");
    await createWorktree({ repoPath: canonical, branch: "feature/force", path: wtPath });
    writeFileSync(join(wtPath, "dirty.txt"), "dirty\n");

    const db = getDb();
    const sessionId = randomUUID();
    db.insert(agentSessions)
      .values({ id: sessionId, workspaceId, backend: "codex", status: "idle" })
      .run();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/force",
      featureName: "force",
      path: wtPath,
      agentSessionId: sessionId,
    });

    await removeTrackedWorktree(worktreeId, true);

    const after = db.select().from(activeWorktrees).where(eq(activeWorktrees.id, worktreeId)).get();
    expect(after).toBeUndefined();
  });

  test("getWorktreeStatus returns dirty state and changed file count", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-status");
    await createWorktree({ repoPath: canonical, branch: "feature/status", path: wtPath });
    writeFileSync(join(wtPath, "dirty.txt"), "dirty\n");

    const db = getDb();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/status",
      featureName: "status",
      path: wtPath,
    });

    const status = await getWorktreeStatus(worktreeId);

    expect(status.hasChanges).toBe(true);
    expect(status.changedFiles).toBe(1);
    expect(status.branchName).toBe("feature/status");
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.lastFetch).toBeNull();

    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });

  test("getWorktreeStatus returns ahead, behind, and lastFetch when upstream exists", async () => {
    const canonical = realpathSync(repoPath);
    const remotePath = join(rootDir, "remote.git");
    initBareGitRepo(remotePath);

    git(["remote", "add", "origin", remotePath], canonical);
    git(["push", "-u", "origin", "main"], canonical);

    const wtPath = join(rootDir, "wt-sync");
    await createWorktree({ repoPath: canonical, branch: "feature/sync", path: wtPath });
    git(["push", "-u", "origin", "feature/sync"], wtPath);

    const db = getDb();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/sync",
      featureName: "sync",
      path: wtPath,
    });

    writeFileSync(join(wtPath, "local.txt"), "local\n");
    git(["add", "local.txt"], wtPath);
    git(["commit", "-m", "local change"], wtPath);

    const clonePath = join(rootDir, "remote-clone");
    git(["clone", remotePath, clonePath], rootDir);
    git(["config", "user.name", "Piloto Tests"], clonePath);
    git(["config", "user.email", "piloto@example.com"], clonePath);
    git(["checkout", "feature/sync"], clonePath);
    writeFileSync(join(clonePath, "remote.txt"), "remote\n");
    git(["add", "remote.txt"], clonePath);
    git(["commit", "-m", "remote change"], clonePath);
    git(["push", "origin", "feature/sync"], clonePath);

    git(["fetch", "origin"], wtPath);

    const status = await getWorktreeStatus(worktreeId);

    expect(status.hasChanges).toBe(false);
    expect(status.changedFiles).toBe(0);
    expect(status.branchName).toBe("feature/sync");
    expect(status.ahead).toBe(1);
    expect(status.behind).toBe(1);
    expect(status.lastFetch).toBeInstanceOf(Date);

    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });

  test("refreshWorktreeStatus emits through the notifier", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-refresh");
    await createWorktree({ repoPath: canonical, branch: "feature/refresh", path: wtPath });

    const db = getDb();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/refresh",
      featureName: "refresh",
      path: wtPath,
    });

    let payload:
      | {
          worktreeId: string;
          statusChanged: boolean;
        }
      | undefined;

    setWorktreeStatusNotifier(({ worktreeId: changedId, status }) => {
      payload = {
        worktreeId: changedId,
        statusChanged: status.hasChanges,
      };
    });

    writeFileSync(join(wtPath, "dirty.txt"), "dirty\n");
    const status = await refreshWorktreeStatus(worktreeId);

    expect(status.hasChanges).toBe(true);
    expect(payload).toEqual({
      worktreeId,
      statusChanged: true,
    });

    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });

  test("createWatcher rejects duplicate watchers and destroyWatcher allows re-creation", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-watch");
    await createWorktree({ repoPath: canonical, branch: "feature/watch", path: wtPath });

    const worktreeId = randomUUID();
    await createWatcher(worktreeId, wtPath);

    await expect(createWatcher(worktreeId, wtPath)).rejects.toBeInstanceOf(
      WorktreeAlreadyHasWatcherError,
    );

    await destroyWatcher(worktreeId);
    await createWatcher(worktreeId, wtPath);
    await destroyWatcher(worktreeId);

    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });

  test("listWorkspaceWorktrees returns tracked worktrees with embedded status", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-list");
    await createWorktree({ repoPath: canonical, branch: "feature/list", path: wtPath });
    writeFileSync(join(wtPath, "dirty.txt"), "dirty\n");

    const db = getDb();
    const worktreeId = randomUUID();
    insertActiveWorktree(db, {
      id: worktreeId,
      repoId,
      branch: "feature/list",
      featureName: "list",
      path: wtPath,
    });

    const worktrees = await listWorkspaceWorktrees(workspaceId);

    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]?.status.hasChanges).toBe(true);
    expect(worktrees[0]?.status.changedFiles).toBe(1);
    expect(worktrees[0]?.repo.id).toBe(repoId);

    await removeTrackedWorktree(worktreeId, true);
  });

  test("watcher ignores changes under node_modules", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-ignore");
    await createWorktree({ repoPath: canonical, branch: "feature/ignore", path: wtPath });

    const resolvedPath = realpathSync(wtPath);
    const worktreeId = randomUUID();
    insertActiveWorktree(getDb(), {
      id: worktreeId,
      repoId,
      branch: "feature/ignore",
      featureName: "ignore",
      path: resolvedPath,
    });

    let notifyCount = 0;
    setWorktreeStatusNotifier(() => {
      notifyCount += 1;
    });

    await createWatcher(worktreeId, resolvedPath);

    mkdirSync(join(resolvedPath, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(resolvedPath, "node_modules", "pkg", "index.js"), "noop\n");

    await new Promise((r) => setTimeout(r, 400));
    expect(notifyCount).toBe(0);

    writeFileSync(join(resolvedPath, "tracked.txt"), "hi\n");
    await new Promise((r) => setTimeout(r, 400));
    expect(notifyCount).toBeGreaterThan(0);

    await destroyWatcher(worktreeId);
    await removeWorktree({ repoPath: canonical, path: resolvedPath, force: true });
  });

  test("concurrent createWatcher calls for the same id reject all but one", async () => {
    const canonical = realpathSync(repoPath);
    const wtPath = join(rootDir, "wt-concurrent");
    await createWorktree({ repoPath: canonical, branch: "feature/concurrent", path: wtPath });

    const worktreeId = randomUUID();
    const results = await Promise.allSettled([
      createWatcher(worktreeId, wtPath),
      createWatcher(worktreeId, wtPath),
      createWatcher(worktreeId, wtPath),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(WorktreeAlreadyHasWatcherError);
    }

    await destroyWatcher(worktreeId);
    await removeWorktree({ repoPath: canonical, path: wtPath, force: true });
  });
});
