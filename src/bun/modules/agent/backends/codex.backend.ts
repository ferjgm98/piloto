import type { AgentUpdateDTO } from "shared/rpc";
import { AgentBinaryNotFoundError } from "../../../utils/errors";
import { createLogger } from "../../../utils/logger";
import type { AgentBackend } from "../agent.types";
import { type JsonRpcPeer, connectJsonRpc } from "./jsonrpc-stdio";

export interface CodexBackendConfig {
  sessionId: string;
  binaryPath?: string;
}

interface CodexThreadStartResult {
  threadId: string;
}

interface CodexItemStartedParams {
  itemId: string;
  itemType: string;
  title?: string;
}
interface CodexAgentMessageDeltaParams {
  delta: string;
}
interface CodexItemCompletedParams {
  itemId: string;
  itemType: string;
}

export function createCodexBackend(config: CodexBackendConfig): AgentBackend {
  const log = createLogger("codex-backend");
  const binaryName = config.binaryPath ?? process.env.PILOTO_CODEX_BIN ?? "codex";

  let peer: JsonRpcPeer | null = null;
  let threadId: string | null = null;
  let onUpdateCb: ((update: AgentUpdateDTO) => void) | null = null;

  function emit(update: AgentUpdateDTO): void {
    onUpdateCb?.(update);
  }

  function handleNotification(method: string, params: unknown): void {
    const p = (params ?? {}) as Record<string, unknown>;
    if (method === "item/started") {
      const ev = p as unknown as CodexItemStartedParams;
      if (ev.itemType && ev.itemType !== "agentMessage") {
        emit({
          kind: "tool_call",
          toolCallId: ev.itemId,
          title: ev.title ?? ev.itemType,
          toolKind: ev.itemType,
          status: "in_progress",
        });
      }
    } else if (method === "item/agentMessage/delta") {
      const ev = p as unknown as CodexAgentMessageDeltaParams;
      if (ev.delta) emit({ kind: "message", text: ev.delta });
    } else if (method === "item/completed") {
      const ev = p as unknown as CodexItemCompletedParams;
      if (ev.itemType && ev.itemType !== "agentMessage") {
        emit({
          kind: "tool_call_update",
          toolCallId: ev.itemId,
          status: "completed",
          title: null,
        });
      }
    }
  }

  async function startTurn(prompt: string): Promise<void> {
    if (!peer || !threadId) return;
    await peer.request("turn/start", { threadId, input: prompt });
  }

  return {
    name: "codex",
    async start({ workingDir, prompt }) {
      const binary = Bun.which(binaryName);
      if (!binary) throw new AgentBinaryNotFoundError(binaryName);

      peer = connectJsonRpc({
        binary,
        args: ["app-server"],
        cwd: workingDir,
        onStderr: (chunk) => log.debug(`codex stderr: ${chunk.trimEnd()}`),
        onExit: (code, signal) => {
          log.info(`codex process exited code=${code} signal=${signal}`);
        },
      });
      peer.onNotification(handleNotification);

      await peer.request("initialize", {});
      peer.notify("initialized", {});

      const thread = await peer.request<CodexThreadStartResult>("thread/start", {
        cwd: workingDir,
      });
      threadId = thread.threadId;

      if (prompt) {
        void startTurn(prompt).catch((err: Error) => {
          log.error(`codex turn/start failed: ${err.message}`);
        });
      }

      return { sessionId: config.sessionId };
    },
    async sendPrompt(prompt: string) {
      if (!peer || !threadId) throw new Error("codex backend not started");
      await startTurn(prompt);
    },
    async stop() {
      if (!peer) return;
      await peer.shutdown(5_000);
      peer = null;
      threadId = null;
    },
    onUpdate(cb) {
      onUpdateCb = cb;
    },
  };
}
