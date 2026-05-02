import type { SessionDTO } from "shared/rpc";
import { type UseRPCMutationResult, useRPCMutation } from "./use-rpc-mutation";
import { type UseRPCQueryResult, useRPCQuery } from "./use-rpc-query";

export interface CreateSessionInput extends Record<string, unknown> {
  workspaceId: string;
  name: string;
}

export interface RenameSessionInput extends Record<string, unknown> {
  id: string;
  name: string;
}

export interface DeleteSessionInput extends Record<string, unknown> {
  id: string;
}

export function useSessions(workspaceId: string): UseRPCQueryResult<SessionDTO[]> {
  return useRPCQuery<SessionDTO[]>("listSessions", { workspaceId }, [workspaceId]);
}

export function useSession(id: string): UseRPCQueryResult<SessionDTO> {
  return useRPCQuery<SessionDTO>("getSession", { id }, [id]);
}

export function useCreateSession(): UseRPCMutationResult<SessionDTO, CreateSessionInput> {
  return useRPCMutation<SessionDTO, CreateSessionInput>("createSession");
}

export function useRenameSession(): UseRPCMutationResult<SessionDTO, RenameSessionInput> {
  return useRPCMutation<SessionDTO, RenameSessionInput>("renameSession");
}

export function useDeleteSession(): UseRPCMutationResult<undefined, DeleteSessionInput> {
  return useRPCMutation<undefined, DeleteSessionInput>("deleteSession");
}
