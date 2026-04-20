import { useCallback, useState } from "react";
import type { AgentBackendName, AgentSessionDTO, AgentStatus, AgentUpdateDTO } from "shared/rpc";
import { type UseRPCMutationResult, useRPCMutation } from "./use-rpc-mutation";
import { type UseRPCQueryResult, useRPCQuery } from "./use-rpc-query";
import { useRPCSubscription } from "./use-rpc-subscription";

export interface StartAgentInput extends Record<string, unknown> {
  workspaceId: string;
  worktreeId?: string;
  backend: AgentBackendName;
  prompt?: string;
}

export interface StopAgentInput extends Record<string, unknown> {
  sessionId: string;
}

export function useAgents(workspaceId: string): UseRPCQueryResult<AgentSessionDTO[]> {
  const query = useRPCQuery<AgentSessionDTO[]>("listAgentSessions", { workspaceId }, [workspaceId]);
  useRPCSubscription<{ sessionId: string; status: AgentStatus; error?: string }>(
    "agentStatusChange",
    () => {
      query.refetch();
    },
    [workspaceId],
  );
  return query;
}

export function useStartAgent(): UseRPCMutationResult<{ sessionId: string }, StartAgentInput> {
  return useRPCMutation<{ sessionId: string }, StartAgentInput>("startAgent");
}

export function useStopAgent(): UseRPCMutationResult<{ success: boolean }, StopAgentInput> {
  return useRPCMutation<{ success: boolean }, StopAgentInput>("stopAgent");
}

export function useAgentOutput(sessionId: string | null): AgentUpdateDTO[] {
  const [chunks, setChunks] = useState<AgentUpdateDTO[]>([]);

  const onOutput = useCallback(
    (payload: { sessionId: string; chunk: AgentUpdateDTO }) => {
      if (!sessionId || payload.sessionId !== sessionId) return;
      setChunks((prev) => [...prev, payload.chunk]);
    },
    [sessionId],
  );

  useRPCSubscription<{ sessionId: string; chunk: AgentUpdateDTO }>("agentOutput", onOutput, [
    sessionId,
  ]);

  return chunks;
}
