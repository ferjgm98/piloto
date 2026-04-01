import { GitError } from "./errors";

export async function runGit(args: string[], cwd: string): Promise<string> {
  const timeoutMs = 30_000;
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
