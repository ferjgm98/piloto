import { rpcRequest } from "@/lib/rpc-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentBackendName,
  AgentStatus,
  AgentUpdateDTO,
  ThreadBindingInput,
  ThreadDTO,
} from "shared/rpc";
import { type UseRPCMutationResult, useRPCMutation } from "./use-rpc-mutation";
import { type UseRPCQueryResult, useRPCQuery } from "./use-rpc-query";
import { useRPCSubscription } from "./use-rpc-subscription";

export interface StartThreadInput extends Record<string, unknown> {
  sessionId: string;
  backend: AgentBackendName;
  bindings: ThreadBindingInput[];
  prompt?: string;
}

export interface StopThreadInput extends Record<string, unknown> {
  threadId: string;
}

export interface StopAllThreadsInput extends Record<string, unknown> {
  workspaceId: string;
}

export interface SendPromptInput extends Record<string, unknown> {
  threadId: string;
  prompt: string;
}

export interface ThreadsScope {
  sessionId?: string;
  workspaceId?: string;
}

export function useThreads(scope: ThreadsScope): UseRPCQueryResult<ThreadDTO[]> {
  const key = scope.sessionId ?? scope.workspaceId ?? "";
  const query = useRPCQuery<ThreadDTO[]>(
    "listThreads",
    { sessionId: scope.sessionId, workspaceId: scope.workspaceId },
    [key],
  );
  // refetch identity changes every render — stash it in a ref so the
  // subscription callback stays stable and doesn't re-subscribe each frame.
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  useRPCSubscription<{
    threadId: string;
    workspaceId: string;
    sessionId: string;
    status: AgentStatus;
    error?: string;
  }>(
    "threadStatusChange",
    (payload) => {
      if (scope.sessionId && payload.sessionId !== scope.sessionId) return;
      if (scope.workspaceId && payload.workspaceId !== scope.workspaceId) return;
      refetchRef.current();
    },
    [key],
  );
  return query;
}

export function useThread(threadId: string): UseRPCQueryResult<ThreadDTO> {
  return useRPCQuery<ThreadDTO>("getThread", { threadId }, [threadId]);
}

export function useStartThread(): UseRPCMutationResult<{ threadId: string }, StartThreadInput> {
  return useRPCMutation<{ threadId: string }, StartThreadInput>("startThread");
}

export function useStopThread(): UseRPCMutationResult<{ success: boolean }, StopThreadInput> {
  return useRPCMutation<{ success: boolean }, StopThreadInput>("stopThread");
}

export function useStopAllThreads(): UseRPCMutationResult<
  { stopped: number },
  StopAllThreadsInput
> {
  return useRPCMutation<{ stopped: number }, StopAllThreadsInput>("stopAllThreads");
}

export function useSendThreadPrompt(): UseRPCMutationResult<{ success: boolean }, SendPromptInput> {
  return useRPCMutation<{ success: boolean }, SendPromptInput>("sendPrompt");
}

export function useThreadOutput(threadId: string | null): AgentUpdateDTO[] {
  const [chunks, setChunks] = useState<AgentUpdateDTO[]>([]);

  useEffect(() => {
    if (!threadId) {
      setChunks([]);
      return;
    }
    let cancelled = false;
    setChunks([]);
    void rpcRequest<AgentUpdateDTO[]>("getThreadOutput", { threadId })
      .then((initial) => {
        if (!cancelled) setChunks(initial);
      })
      .catch(() => {
        // Buffer hydration is best-effort; live subscription still fills the log.
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const onOutput = useCallback(
    (payload: { threadId: string; chunk: AgentUpdateDTO }) => {
      if (!threadId || payload.threadId !== threadId) return;
      setChunks((prev) => [...prev, payload.chunk]);
    },
    [threadId],
  );

  useRPCSubscription<{ threadId: string; chunk: AgentUpdateDTO }>("threadOutput", onOutput, [
    threadId,
  ]);

  return chunks;
}

export interface ThreadStatusChangePayload {
  threadId: string;
  workspaceId: string;
  sessionId: string;
  status: AgentStatus;
  error?: string;
}

export function useThreadStatusChange(
  handler: (payload: ThreadStatusChangePayload) => void,
  deps: unknown[] = [],
): void {
  useRPCSubscription<ThreadStatusChangePayload>("threadStatusChange", handler, deps);
}
