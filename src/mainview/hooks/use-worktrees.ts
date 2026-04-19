import type { ActiveWorktreeDTO, WorktreeResult } from "shared/rpc";
import { type UseRPCMutationResult, useRPCMutation } from "./use-rpc-mutation";
import { type UseRPCQueryResult, useRPCQuery } from "./use-rpc-query";

export interface CreateWorktreesForFeatureInput extends Record<string, unknown> {
  workspaceId: string;
  featureName: string;
  branchName: string;
}

export interface RemoveTrackedWorktreeInput extends Record<string, unknown> {
  worktreeId: string;
  force?: boolean;
}

export function useWorkspaceWorktrees(workspaceId: string): UseRPCQueryResult<ActiveWorktreeDTO[]> {
  return useRPCQuery<ActiveWorktreeDTO[]>("listWorkspaceWorktrees", { workspaceId }, [workspaceId]);
}

export function useCreateWorktreesForFeature(): UseRPCMutationResult<
  WorktreeResult[],
  CreateWorktreesForFeatureInput
> {
  return useRPCMutation<WorktreeResult[], CreateWorktreesForFeatureInput>(
    "createWorktreesForFeature",
  );
}

export function useRemoveTrackedWorktree(): UseRPCMutationResult<
  undefined,
  RemoveTrackedWorktreeInput
> {
  return useRPCMutation<undefined, RemoveTrackedWorktreeInput>("removeTrackedWorktree");
}
