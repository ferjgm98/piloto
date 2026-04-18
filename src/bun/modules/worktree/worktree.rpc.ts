import * as worktreeService from "./worktree.service";
import type {
  ActiveWorktree,
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  WorktreeResult,
  WorktreeStatus,
} from "./worktree.types";

export const worktreeHandlers = {
  requests: {
    listWorktrees: async ({ repoPath }: { repoPath: string }): Promise<Worktree[]> => {
      return worktreeService.listWorktrees(repoPath);
    },
    createWorktree: async (input: WorktreeCreateInput): Promise<Worktree> => {
      return worktreeService.createWorktree(input);
    },
    removeWorktree: async (input: WorktreeRemoveInput): Promise<undefined> => {
      await worktreeService.removeWorktree(input);
      return undefined;
    },
    createWorktreesForFeature: async (params: {
      workspaceId: string;
      featureName: string;
      branchName: string;
    }): Promise<WorktreeResult[]> => {
      return worktreeService.createWorktreesForFeature(
        params.workspaceId,
        params.featureName,
        params.branchName,
      );
    },
    listWorkspaceWorktrees: async (params: {
      workspaceId: string;
    }): Promise<ActiveWorktree[]> => {
      return worktreeService.listWorkspaceWorktrees(params.workspaceId);
    },
    removeTrackedWorktree: async (params: {
      worktreeId: string;
      force?: boolean;
    }): Promise<undefined> => {
      await worktreeService.removeTrackedWorktree(params.worktreeId, params.force);
      return undefined;
    },
    getWorktreeStatus: async (params: { worktreeId: string }): Promise<WorktreeStatus> => {
      return worktreeService.getWorktreeStatus(params.worktreeId);
    },
  },
  messages: {},
};
