import * as worktreeService from "./worktree.service";
import type {
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
} from "./worktree.types";

export const worktreeHandlers = {
  requests: {
    listWorktrees: async ({
      repoPath,
    }: {
      repoPath: string;
    }): Promise<Worktree[]> => {
      return worktreeService.listWorktrees(repoPath);
    },
    createWorktree: async (input: WorktreeCreateInput): Promise<Worktree> => {
      return worktreeService.createWorktree(input);
    },
    removeWorktree: async (input: WorktreeRemoveInput): Promise<undefined> => {
      await worktreeService.removeWorktree(input);
      return undefined;
    },
  },
  messages: {},
};
