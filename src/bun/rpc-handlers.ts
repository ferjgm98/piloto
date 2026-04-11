import { agentHandlers } from "./modules/agent/agent.rpc";
import { mcpHandlers } from "./modules/mcp/mcp.rpc";
import { terminalHandlers } from "./modules/terminal/terminal.rpc";
import { workspaceHandlers } from "./modules/workspace/workspace.rpc";
import { worktreeHandlers } from "./modules/worktree/worktree.rpc";

export const requestHandlers = {
  ping: () => "pong",
  getGreeting: () => "Greetings from the Bun side!",
  ...workspaceHandlers.requests,
  ...worktreeHandlers.requests,
  ...agentHandlers.requests,
  ...terminalHandlers.requests,
  ...mcpHandlers.requests,
};
