import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb, initializeDatabase } from "../../db/database";
import { activeWorktrees, agentSessions, workspaceRepos, workspaces } from "../../db/schema";
import { UncommittedChangesError, WorktreeInUseError } from "../../utils/errors";
import { resetTestDb } from "../../utils/test-setup";
import {
  computeWorktreePath,
  createWorktree,
  listWorktrees,
  removeTrackedWorktree,
  removeWorktree,
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
});
