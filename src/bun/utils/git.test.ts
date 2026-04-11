import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitError } from "./errors";
import { runGit } from "./git";

describe("runGit", () => {
  let rootDir: string;
  let repoPath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "piloto-git-test-"));
    repoPath = join(rootDir, "repo");
    mkdirSync(repoPath, { recursive: true });

    execFileSync("git", ["init"], { cwd: repoPath, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Piloto Tests"], { cwd: repoPath, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "piloto@example.com"], {
      cwd: repoPath,
      stdio: "pipe",
    });
    writeFileSync(join(repoPath, "README.md"), "# Piloto\n");
    execFileSync("git", ["add", "README.md"], { cwd: repoPath, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoPath, stdio: "pipe" });
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  test("returns trimmed stdout on success", async () => {
    const output = await runGit(["rev-parse", "--show-toplevel"], repoPath);
    expect(output).toBe(realpathSync(repoPath));
  });

  test("throws GitError on non-zero exit", async () => {
    await expect(
      runGit(["rev-parse", "--verify", "missing-branch"], repoPath),
    ).rejects.toBeInstanceOf(GitError);
  });

  test("sets GIT_TERMINAL_PROMPT=0 in the child process environment", async () => {
    execFileSync(
      "git",
      [
        "config",
        "alias.capture-prompt",
        "!sh -c 'printf %s \"${GIT_TERMINAL_PROMPT:-unset}\" > git-prompt-env.txt'",
      ],
      { cwd: repoPath, stdio: "pipe" },
    );

    await runGit(["capture-prompt"], repoPath);

    const captured = Bun.file(join(repoPath, "git-prompt-env.txt"));
    expect(await captured.text()).toBe("0");
  });

  test("throws when the git process is killed by timeout", async () => {
    execFileSync("git", ["config", "alias.sleep-forever", "!sh -c 'sleep 2'"], {
      cwd: repoPath,
      stdio: "pipe",
    });

    await expect(runGit(["sleep-forever"], repoPath, { timeoutMs: 100 })).rejects.toThrow(
      "terminated by SIGTERM",
    );
  });
});
