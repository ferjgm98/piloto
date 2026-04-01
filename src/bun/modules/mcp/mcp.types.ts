export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  status: "connected" | "disconnected" | "error";
}

export interface McpTool {
  name: string;
  description: string;
  serverId: string;
}
