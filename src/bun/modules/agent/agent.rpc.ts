import type { AgentSession } from "./agent.types";

export const agentHandlers = {
  requests: {
    listAgentSessions: async (): Promise<AgentSession[]> => [],
    startAgent: async (_input: {
      workspaceId: string;
      backend: string;
    }): Promise<null> => null,
  },
  messages: {
    agentOutput: (_data: { sessionId: string; text: string }) => {},
  },
};
