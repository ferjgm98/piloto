import type { AgentSessionDTO } from "shared/rpc";
import * as agentService from "./agent.service";
import type { AgentSessionRow, StartAgentInput } from "./agent.types";

function toAgentSessionDTO(row: AgentSessionRow): AgentSessionDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    worktreeId: row.worktreeId,
    backend: row.backend,
    status: row.status,
    prompt: row.prompt,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const agentHandlers = {
  requests: {
    listAgentSessions: async ({
      workspaceId,
    }: {
      workspaceId: string;
    }): Promise<AgentSessionDTO[]> => {
      return agentService.listAgentSessions(workspaceId).map(toAgentSessionDTO);
    },
    getAgentSession: async ({
      sessionId,
    }: {
      sessionId: string;
    }): Promise<AgentSessionDTO> => {
      return toAgentSessionDTO(agentService.getAgentSession(sessionId));
    },
    startAgent: async (input: StartAgentInput): Promise<{ sessionId: string }> => {
      return agentService.startAgent(input);
    },
    stopAgent: async ({ sessionId }: { sessionId: string }): Promise<{ success: boolean }> => {
      return agentService.stopAgent(sessionId);
    },
    stopAllAgents: async ({
      workspaceId,
    }: {
      workspaceId: string;
    }): Promise<{ stopped: number }> => {
      return agentService.stopAllAgents(workspaceId);
    },
    sendPrompt: async ({
      sessionId,
      prompt,
    }: {
      sessionId: string;
      prompt: string;
    }): Promise<{ success: boolean }> => {
      return agentService.sendPrompt(sessionId, prompt);
    },
  },
  messages: {},
};
