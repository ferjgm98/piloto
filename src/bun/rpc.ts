import type { MainRPC } from "shared/rpc";
import { agentHandlers } from "./modules/agent/agent.rpc";
import { terminalHandlers } from "./modules/terminal/terminal.rpc";
import { requestHandlers } from "./rpc-handlers";
import { wrapHandlers } from "./utils/rpc-middleware";

export function createRPC() {
  const { BrowserView } = require("electrobun/bun") as typeof import("electrobun/bun");

  return BrowserView.defineRPC<MainRPC>({
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
}
