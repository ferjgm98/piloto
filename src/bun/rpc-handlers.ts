import { mcpHandlers } from "./modules/mcp/mcp.rpc";
import { sessionHandlers } from "./modules/session/session.rpc";
import { terminalHandlers } from "./modules/terminal/terminal.rpc";
import { threadHandlers } from "./modules/thread/thread.rpc";
import { workspaceHandlers } from "./modules/workspace/workspace.rpc";
import { worktreeHandlers } from "./modules/worktree/worktree.rpc";

export const requestHandlers = {
  ping: () => "pong",
  getGreeting: () => "Greetings from the Bun side!",
  ...workspaceHandlers.requests,
  ...worktreeHandlers.requests,
  ...sessionHandlers.requests,
  ...threadHandlers.requests,
  ...terminalHandlers.requests,
  ...mcpHandlers.requests,
};
