import { BrowserView } from "electrobun/bun";
import type { MainRPC } from "shared/rpc";
import { terminalHandlers } from "./modules/terminal/terminal.rpc";
import { setThreadStatusNotifier, setThreadUpdateNotifier } from "./modules/thread/thread.service";
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

  setThreadUpdateNotifier(({ threadId, chunk }) => {
    rpc.send.threadOutput({ threadId, chunk });
  });

  setThreadStatusNotifier(({ threadId, workspaceId, sessionId, status, error }) => {
    rpc.send.threadStatusChange({ threadId, workspaceId, sessionId, status, error });
  });

  return rpc;
}
