import type { McpServer, McpTool } from "./mcp.types";

export const mcpHandlers = {
  requests: {
    listMcpServers: async (): Promise<McpServer[]> => [],
    listMcpTools: async (): Promise<McpTool[]> => [],
  },
  messages: {},
};
