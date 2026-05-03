import type { AgentUpdateDTO, ThreadDTO, ThreadRepoDTO } from "shared/rpc";
import * as threadService from "./thread.service";
import type { StartThreadInput, ThreadRepoRow, ThreadRow } from "./thread.types";

function toRepoDTO(row: ThreadRepoRow): ThreadRepoDTO {
  return {
    id: row.id,
    threadId: row.threadId,
    repoId: row.repoId,
    worktreeId: row.worktreeId,
    alias: row.alias,
  };
}

function toThreadDTO(row: ThreadRow, workspaceId: string, repos: ThreadRepoRow[]): ThreadDTO {
  return {
    id: row.id,
    sessionId: row.sessionId,
    workspaceId,
    backend: row.backend,
    model: row.model,
    status: row.status,
    prompt: row.prompt,
    errorMessage: row.errorMessage,
    reasoningLevel: row.reasoningLevel,
    fastMode: row.fastMode,
    planMode: row.planMode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    repos: repos.map(toRepoDTO),
  };
}

export const threadHandlers = {
  requests: {
    listThreads: async (params: {
      sessionId?: string;
      workspaceId?: string;
    }): Promise<ThreadDTO[]> => {
      let result: { thread: ThreadRow; workspaceId: string; repos: ThreadRepoRow[] }[];
      if (params.sessionId) {
        result = threadService.listThreadsBySession(params.sessionId);
      } else if (params.workspaceId) {
        result = threadService.listThreadsByWorkspace(params.workspaceId);
      } else {
        result = [];
      }
      return result.map((r) => toThreadDTO(r.thread, r.workspaceId, r.repos));
    },
    getThread: async ({ threadId }: { threadId: string }): Promise<ThreadDTO> => {
      const r = threadService.getThread(threadId);
      return toThreadDTO(r.thread, r.workspaceId, r.repos);
    },
    startThread: async (input: StartThreadInput): Promise<{ threadId: string }> => {
      return threadService.startThread(input);
    },
    stopThread: async ({ threadId }: { threadId: string }): Promise<{ success: boolean }> => {
      return threadService.stopThread(threadId);
    },
    stopAllThreads: async ({
      workspaceId,
    }: {
      workspaceId: string;
    }): Promise<{ stopped: number }> => {
      return threadService.stopAllThreads(workspaceId);
    },
    sendPrompt: async ({
      threadId,
      prompt,
    }: {
      threadId: string;
      prompt: string;
    }): Promise<{ success: boolean }> => {
      return threadService.sendPrompt(threadId, prompt);
    },
    getThreadOutput: async ({ threadId }: { threadId: string }): Promise<AgentUpdateDTO[]> => {
      return threadService.getThreadOutput(threadId);
    },
  },
  messages: {},
};
