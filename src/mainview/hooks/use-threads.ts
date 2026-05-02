import { useCallback, useEffect, useState } from "react";
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
  useRPCSubscription<{ threadId: string; status: AgentStatus; error?: string }>(
    "threadStatusChange",
    () => {
      query.refetch();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset chunks when thread changes
  useEffect(() => {
    setChunks([]);
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

export function useThreadStatusChange(
  handler: (payload: { threadId: string; status: AgentStatus; error?: string }) => void,
  deps: unknown[] = [],
): void {
  useRPCSubscription<{ threadId: string; status: AgentStatus; error?: string }>(
    "threadStatusChange",
    handler,
    deps,
  );
}
