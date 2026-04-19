import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { GitError } from "./errors";

interface RunGitOptions {
  timeoutMs?: number;
}

export async function runGit(
  args: string[],
  cwd: string,
  options?: RunGitOptions,
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    const stderrMessage = stderr.trim();
    const failureReason =
      proc.killed && proc.signalCode
        ? `terminated by ${proc.signalCode}${stderrMessage ? `: ${stderrMessage}` : ` after ${timeoutMs}ms timeout`}`
        : stderrMessage;

    throw new GitError(`git ${args.join(" ")} failed: ${failureReason}`);
  }

  return stdout.trim();
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const output = await runGit(["status", "--porcelain"], cwd);
  return output.length > 0;
}

export async function getChangedFilesCount(cwd: string): Promise<number> {
  const output = await runGit(["status", "--porcelain"], cwd);
  if (output.length === 0) return 0;
  return output.split("\n").filter(Boolean).length;
}

export async function getCurrentBranchName(cwd: string): Promise<string | null> {
  const output = await runGit(["branch", "--show-current"], cwd);
  return output.length > 0 ? output : null;
}

export async function getAheadBehind(cwd: string): Promise<{ ahead: number; behind: number }> {
  try {
    const output = await runGit(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], cwd);
    const [behindRaw = "0", aheadRaw = "0"] = output.split(/\s+/);
    const behind = Number.parseInt(behindRaw, 10);
    const ahead = Number.parseInt(aheadRaw, 10);
    return {
      ahead: Number.isNaN(ahead) ? 0 : ahead,
      behind: Number.isNaN(behind) ? 0 : behind,
    };
  } catch (error) {
    if (error instanceof GitError) {
      return { ahead: 0, behind: 0 };
    }
    throw error;
  }
}

export async function getLastFetchTime(cwd: string): Promise<Date | null> {
  const gitDir = await runGit(["rev-parse", "--git-dir"], cwd);
  const fetchHead = resolve(cwd, gitDir, "FETCH_HEAD");

  try {
    const metadata = await stat(fetchHead);
    return metadata.mtime;
  } catch {
    return null;
  }
}
