import type {
  ActiveWorktreeDTO,
  WorktreeResult as WorktreeResultDTO,
  WorktreeStatus as WorktreeStatusDTO,
} from "shared/rpc";
import * as worktreeService from "./worktree.service";
import type {
  ActiveWorktree,
  WorktreeStatus as DomainWorktreeStatus,
  Worktree,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  WorktreeResult,
  WorktreeWithStatus,
} from "./worktree.types";

function toWorktreeStatusDTO(status: DomainWorktreeStatus): WorktreeStatusDTO {
  return {
    hasChanges: status.hasChanges,
    changedFiles: status.changedFiles,
    branchName: status.branchName,
    ahead: status.ahead,
    behind: status.behind,
    lastFetch: status.lastFetch?.toISOString() ?? null,
  };
}

function toActiveWorktreeDTO(wt: WorktreeWithStatus): ActiveWorktreeDTO {
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
    status: toWorktreeStatusDTO(wt.status),
  };
}

async function toTrackedWorktreeDTO(wt: ActiveWorktree): Promise<ActiveWorktreeDTO> {
  const status = await worktreeService.getWorktreeStatus(wt.id);
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
    status: toWorktreeStatusDTO(status),
  };
}

async function toWorktreeResultDTO(result: WorktreeResult): Promise<WorktreeResultDTO> {
  if (result.ok) {
    return {
      repoId: result.repoId,
      ok: true,
      worktree: await toTrackedWorktreeDTO(result.worktree),
    };
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
      return Promise.all(results.map(toWorktreeResultDTO));
    },
    listWorkspaceWorktrees: async (params: {
      workspaceId: string;
    }): Promise<ActiveWorktreeDTO[]> => {
      const worktrees = await worktreeService.listWorkspaceWorktrees(params.workspaceId);
      return worktrees.map(toActiveWorktreeDTO);
    },
    refreshWorktreeStatus: async (params: { worktreeId: string }): Promise<WorktreeStatusDTO> => {
      const status = await worktreeService.refreshWorktreeStatus(params.worktreeId);
      return toWorktreeStatusDTO(status);
    },
    removeTrackedWorktree: async (params: {
      worktreeId: string;
      force?: boolean;
    }): Promise<undefined> => {
      await worktreeService.removeTrackedWorktree(params.worktreeId, params.force);
      return undefined;
    },
    getWorktreeStatus: async (params: { worktreeId: string }): Promise<WorktreeStatusDTO> => {
      const status = await worktreeService.getWorktreeStatus(params.worktreeId);
      return toWorktreeStatusDTO(status);
    },
  },
  messages: {},
};
