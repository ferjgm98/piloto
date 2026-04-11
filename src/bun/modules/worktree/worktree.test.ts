import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorktree, listWorktrees, removeWorktree } from "./worktree.service";

function git(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

describe("worktree.service", () => {
  let rootDir: string;
  let repoPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "piloto-worktree-test-"));
    repoPath = join(rootDir, "repo");
    mkdirSync(repoPath, { recursive: true });

    git(["init"], repoPath);
    git(["config", "user.name", "Piloto Tests"], repoPath);
    git(["config", "user.email", "piloto@example.com"], repoPath);

    writeFileSync(join(repoPath, "README.md"), "# Piloto\n");
    git(["add", "README.md"], repoPath);
    git(["commit", "-m", "initial commit"], repoPath);
    git(["branch", "-m", "main"], repoPath);
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
});
