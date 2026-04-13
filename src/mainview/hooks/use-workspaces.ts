import { useRPCMutation } from "./use-rpc-mutation";
import { useRPCQuery } from "./use-rpc-query";

interface WorkspaceRepo {
  id: string;
  workspaceId: string;
  path: string;
  name: string | null;
  defaultBranch: string | null;
  order: number;
}

interface WorkspaceWithRepos {
  id: string;
  name: string;
  description: string | null;
  defaultBranch: string | null;
  createdAt: string;
  updatedAt: string;
  repos: WorkspaceRepo[];
}

type CreateWorkspaceParams = {
  name: string;
  description?: string;
  defaultBranch?: string;
  repoPaths: string[];
};

type UpdateWorkspaceParams = {
  id: string;
  input: {
    name?: string;
    description?: string;
    defaultBranch?: string;
    repoPaths?: string[];
  };
};

export function useWorkspaces() {
  return useRPCQuery<WorkspaceWithRepos[]>("listWorkspaces");
}

export function useWorkspace(id: string) {
  return useRPCQuery<WorkspaceWithRepos>("getWorkspace", { id }, [id]);
}

export function useCreateWorkspace() {
  return useRPCMutation<WorkspaceWithRepos, CreateWorkspaceParams>("createWorkspace");
}

export function useUpdateWorkspace() {
  return useRPCMutation<WorkspaceWithRepos, UpdateWorkspaceParams>("updateWorkspace");
}

export function useDeleteWorkspace() {
  return useRPCMutation<undefined, { id: string }>("deleteWorkspace");
}
