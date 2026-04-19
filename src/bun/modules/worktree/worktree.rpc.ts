import type { ActiveWorktreeDTO, WorktreeResult as WorktreeResultDTO } from "shared/rpc";
import * as worktreeService from "./worktree.service";
import type {
  ActiveWorktree,
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  WorktreeResult,
  WorktreeStatus,
} from "./worktree.types";

function toActiveWorktreeDTO(wt: ActiveWorktree): ActiveWorktreeDTO {
  return {
    id: wt.id,
    repoId: wt.repoId,
    featureName: wt.featureName,
    branch: wt.branch,
    path: wt.path,
    agentSessionId: wt.agentSessionId,
    createdAt: wt.createdAt,
    updatedAt: wt.updatedAt,
    repo: {
      id: wt.repo.id,
      workspaceId: wt.repo.workspaceId,
      path: wt.repo.path,
      defaultBranch: wt.repo.defaultBranch,
    },
  };
}

function toWorktreeResultDTO(result: WorktreeResult): WorktreeResultDTO {
  if (result.ok) {
    return { repoId: result.repoId, ok: true, worktree: toActiveWorktreeDTO(result.worktree) };
  }
  return { repoId: result.repoId, ok: false, error: result.error };
}

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
    }): Promise<WorktreeResultDTO[]> => {
      const results = await worktreeService.createWorktreesForFeature(
        params.workspaceId,
        params.featureName,
        params.branchName,
      );
      return results.map(toWorktreeResultDTO);
    },
    listWorkspaceWorktrees: async (params: {
      workspaceId: string;
    }): Promise<ActiveWorktreeDTO[]> => {
      const worktrees = worktreeService.listWorkspaceWorktrees(params.workspaceId);
      return worktrees.map(toActiveWorktreeDTO);
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
