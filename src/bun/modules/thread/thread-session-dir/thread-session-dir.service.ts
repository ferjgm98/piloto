import { mkdir, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ThreadSessionDirBinding } from "./thread-session-dir.types";

const THREAD_SESSION_DIR_ROOT = join(homedir(), ".piloto", "threads");

export function getThreadSessionDirRoot(): string {
  return THREAD_SESSION_DIR_ROOT;
}

export function getThreadSessionDirPath(threadId: string): string {
  return join(THREAD_SESSION_DIR_ROOT, threadId);
}

export async function createThreadSessionDir(
  threadId: string,
  bindings: ThreadSessionDirBinding[],
): Promise<string> {
  const dir = getThreadSessionDirPath(threadId);
  await mkdir(dir, { recursive: true });
  for (const binding of bindings) {
    const linkPath = join(dir, binding.alias);
    await symlink(binding.worktreePath, linkPath);
  }
  return dir;
}

export async function cleanupThreadSessionDir(threadId: string): Promise<void> {
  const dir = getThreadSessionDirPath(threadId);
  await rm(dir, { recursive: true, force: true });
}
