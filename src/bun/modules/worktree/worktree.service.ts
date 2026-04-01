import { runGit } from "../../utils/git";
import type {
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
} from "./worktree.types";

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

export async function createWorktree(
  input: WorktreeCreateInput,
): Promise<Worktree> {
  await runGit(
    ["worktree", "add", "-b", input.branch, input.path],
    input.repoPath,
  );
  const head = await runGit(["rev-parse", "HEAD"], input.path);
  return { path: input.path, branch: input.branch, head, isMain: false };
}

export async function removeWorktree(
  input: WorktreeRemoveInput,
): Promise<void> {
  const args = ["worktree", "remove", input.path];
  if (input.force) args.push("--force");
  await runGit(args, input.repoPath);
}
