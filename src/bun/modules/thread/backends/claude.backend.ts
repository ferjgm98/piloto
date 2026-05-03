import type { AgentUpdateDTO } from "shared/rpc";
import { AgentBinaryNotFoundError } from "../../../utils/errors";
import { createLogger } from "../../../utils/logger";
import type { ThreadBackend, ThreadBackendExitInfo } from "../thread.types";
import { type LineStreamHandle, spawnLineStream } from "./jsonrpc-stdio";

export interface ClaudeBackendConfig {
  sessionId: string;
  binaryPath?: string;
  onExit?: (info: ThreadBackendExitInfo) => void;
}

interface StreamJsonTextBlock {
  type: "text";
  text: string;
}
interface StreamJsonThinkingBlock {
  type: "thinking";
  thinking: string;
}
interface StreamJsonToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}
interface StreamJsonToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
}
type StreamJsonBlock =
  | StreamJsonTextBlock
  | StreamJsonThinkingBlock
  | StreamJsonToolUseBlock
  | StreamJsonToolResultBlock;

interface StreamJsonAssistantEvent {
  type: "assistant";
  message: { content: StreamJsonBlock[] };
}
interface StreamJsonUserEvent {
  type: "user";
  message: { content: StreamJsonBlock[] };
}

export function createClaudeBackend(config: ClaudeBackendConfig): ThreadBackend {
  const log = createLogger("claude-backend");
  const binaryName = config.binaryPath ?? process.env.PILOTO_CLAUDE_BIN ?? "claude";

  let stream: LineStreamHandle | null = null;
  let onUpdateCb: ((update: AgentUpdateDTO) => void) | null = null;

  function emit(update: AgentUpdateDTO): void {
    onUpdateCb?.(update);
  }

  function handleLine(line: string): void {
    let event: { type?: string } & Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === "assistant") {
      const ev = event as unknown as StreamJsonAssistantEvent;
      for (const block of ev.message.content) {
        if (block.type === "text") {
          emit({ kind: "message", text: block.text });
        } else if (block.type === "thinking") {
          emit({ kind: "thought", text: block.thinking });
        } else if (block.type === "tool_use") {
          emit({
            kind: "tool_call",
            toolCallId: block.id,
            title: block.name,
            toolKind: "other",
            status: "in_progress",
          });
        }
      }
    } else if (event.type === "user") {
      const ev = event as unknown as StreamJsonUserEvent;
      for (const block of ev.message.content) {
        if (block.type === "tool_result") {
          emit({
            kind: "tool_call_update",
            toolCallId: block.tool_use_id,
            status: block.is_error ? "failed" : "completed",
            title: null,
          });
        }
      }
    }
  }

  function writeUserMessage(text: string): void {
    if (!stream) return;
    const payload = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    };
    stream.writeLine(JSON.stringify(payload));
  }

  return {
    name: "claude",
    async start({ workingDir, prompt }) {
      const binary = Bun.which(binaryName);
      if (!binary) throw new AgentBinaryNotFoundError(binaryName);

      stream = spawnLineStream({
        binary,
        args: [
          "-p",
          "--output-format",
          "stream-json",
          "--input-format",
          "stream-json",
          "--verbose",
          "--session-id",
          config.sessionId,
        ],
        cwd: workingDir,
        onLine: handleLine,
        onStderr: (chunk) => log.debug(`claude stderr: ${chunk.trimEnd()}`),
        onExit: (code, signal) => {
          log.info(`claude process exited code=${code} signal=${signal}`);
          config.onExit?.({ code, signal });
        },
      });

      if (prompt) writeUserMessage(prompt);
      return { sessionId: config.sessionId };
    },
    async sendPrompt(prompt: string) {
      if (!stream) throw new Error("claude backend not started");
      writeUserMessage(prompt);
    },
    async stop() {
      if (!stream) return;
      await stream.shutdown(5_000);
      stream = null;
    },
    onUpdate(cb) {
      onUpdateCb = cb;
    },
  };
}
