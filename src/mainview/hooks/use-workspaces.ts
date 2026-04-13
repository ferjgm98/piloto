import type { MainRPC } from "shared/rpc";
import { useRPCMutation } from "./use-rpc-mutation";
import { useRPCQuery } from "./use-rpc-query";

// Derive types from the RPC contract so they stay in sync automatically.
type Requests = MainRPC["bun"]["requests"];
type WorkspaceWithRepos = Requests["getWorkspace"]["response"];
type CreateWorkspaceParams = Requests["createWorkspace"]["params"];
type UpdateWorkspaceParams = Requests["updateWorkspace"]["params"];

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
