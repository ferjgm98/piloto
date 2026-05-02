import { BrowserView } from "electrobun/bun";
import type { MainRPC } from "shared/rpc";
import { setAgentStatusNotifier, setAgentUpdateNotifier } from "./modules/agent/agent.service";
import { terminalHandlers } from "./modules/terminal/terminal.rpc";
import { subscribeWorktreeStatus } from "./modules/worktree/worktree.service";
import { requestHandlers } from "./rpc-handlers";
import { wrapHandlers } from "./utils/rpc-middleware";

export function createRPC() {
  const rpc = BrowserView.defineRPC<MainRPC>({
    maxRequestTime: 5000,
    handlers: {
      requests: wrapHandlers(requestHandlers),
      messages: {
        log: ({ msg }) => {
          console.log("[Webview]:", msg);
        },
        ...terminalHandlers.messages,
      },
    },
  });

  subscribeWorktreeStatus(({ worktreeId, status }) => {
    rpc.send.worktreeStatusChanged({
      worktreeId,
      status: {
        hasChanges: status.hasChanges,
        changedFiles: status.changedFiles,
        branchName: status.branchName,
        ahead: status.ahead,
        behind: status.behind,
        lastFetch: status.lastFetch?.toISOString() ?? null,
      },
    });
  });

  setAgentUpdateNotifier(({ sessionId, chunk }) => {
    rpc.send.agentOutput({ sessionId, chunk });
  });

  setAgentStatusNotifier(({ sessionId, status, error }) => {
    rpc.send.agentStatusChange({ sessionId, status, error });
  });

  return rpc;
}
