import type { Terminal } from "./terminal.types";

export const terminalHandlers = {
  requests: {
    listTerminals: async (): Promise<Terminal[]> => [],
    createTerminal: async (_input: {
      workspaceId: string;
      cwd: string;
    }): Promise<null> => null,
  },
  messages: {
    terminalOutput: (_data: { terminalId: string; text: string }) => {},
  },
};
