import { BrowserView } from "electrobun/bun";
import type { MainRPC } from "shared/rpc";
import { agentHandlers } from "./modules/agent/agent.rpc";
import { terminalHandlers } from "./modules/terminal/terminal.rpc";
import { setWorktreeStatusNotifier } from "./modules/worktree/worktree.service";
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
        ...agentHandlers.messages,
        ...terminalHandlers.messages,
      },
    },
  });

  setWorktreeStatusNotifier(({ worktreeId, status }) => {
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

  return rpc;
}
