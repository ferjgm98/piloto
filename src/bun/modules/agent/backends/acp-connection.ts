import { type ChildProcess, spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from "@zed-industries/agent-client-protocol";
import type {
  Client,
  ContentBlock,
  NewSessionResponse,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from "@zed-industries/agent-client-protocol";
import type { AgentUpdateDTO } from "shared/rpc";

export interface AcpConnectionOptions {
  binary: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  onUpdate: (update: AgentUpdateDTO) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  onStderr?: (chunk: string) => void;
}

export interface AcpConnection {
  sessionId: string;
  prompt: (text: string) => Promise<PromptResponse>;
  cancel: () => Promise<void>;
  shutdown: (timeoutMs?: number) => Promise<void>;
}

function toWebReadable(r: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return Readable.toWeb(r as Readable) as unknown as ReadableStream<Uint8Array>;
}

function toWebWritable(w: NodeJS.WritableStream): WritableStream<Uint8Array> {
  return Writable.toWeb(w as Writable) as WritableStream<Uint8Array>;
}

function toAgentUpdateDTO(notification: SessionNotification): AgentUpdateDTO | null {
  const update = notification.update;
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return { kind: "message", text: contentBlockToText(update.content) };
    case "agent_thought_chunk":
      return { kind: "thought", text: contentBlockToText(update.content) };
    case "tool_call":
      return {
        kind: "tool_call",
        toolCallId: update.toolCallId,
        title: update.title,
        toolKind: update.kind ?? "other",
        status: update.status ?? "pending",
      };
    case "tool_call_update":
      return {
        kind: "tool_call_update",
        toolCallId: update.toolCallId,
        status: update.status ?? "pending",
        title: update.title ?? null,
      };
    case "plan":
      return {
        kind: "plan",
        entries: update.entries.map((entry) => ({
          content: entry.content,
          status: entry.status,
          priority: entry.priority,
        })),
      };
    default:
      return null;
  }
}

function contentBlockToText(block: ContentBlock): string {
  if (block.type === "text") return block.text;
  if (block.type === "resource_link") return `[${block.name ?? block.uri}](${block.uri})`;
  return "";
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }
    child.once("exit", onExit);
  });
}

export async function connectAcp(options: AcpConnectionOptions): Promise<AcpConnection> {
  const child = spawn(options.binary, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const spawnError = await new Promise<Error | null>((resolve) => {
    const onError = (err: Error) => {
      cleanup();
      resolve(err);
    };
    const onSpawn = () => {
      cleanup();
      resolve(null);
    };
    function cleanup() {
      child.off("error", onError);
      child.off("spawn", onSpawn);
    }
    child.once("error", onError);
    child.once("spawn", onSpawn);
  });
  if (spawnError) throw spawnError;

  child.once("exit", (code, signal) => options.onExit(code, signal));
  if (options.onStderr && child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      options.onStderr?.(chunk.toString("utf8"));
    });
  }

  if (!child.stdin || !child.stdout) {
    child.kill("SIGKILL");
    throw new Error("Spawned ACP process has no stdio pipes");
  }

  const stream = ndJsonStream(toWebWritable(child.stdin), toWebReadable(child.stdout));

  const client: Client = {
    async requestPermission(_params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
      return { outcome: { outcome: "cancelled" } };
    },
    async sessionUpdate(notification: SessionNotification): Promise<void> {
      const update = toAgentUpdateDTO(notification);
      if (update) options.onUpdate(update);
    },
  };

  const conn = new ClientSideConnection(() => client, stream);

  await conn.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: false, writeTextFile: false },
      terminal: false,
    },
  });

  const session: NewSessionResponse = await conn.newSession({
    cwd: options.cwd,
    mcpServers: [],
  });

  return {
    sessionId: session.sessionId,
    prompt: async (text: string): Promise<PromptResponse> => {
      return conn.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text }],
      });
    },
    cancel: async () => {
      await conn.cancel({ sessionId: session.sessionId });
    },
    shutdown: async (timeoutMs = 5_000) => {
      try {
        await conn.cancel({ sessionId: session.sessionId });
      } catch {}
      const exited = await waitForExit(child, timeoutMs);
      if (!exited) {
        child.kill("SIGTERM");
        const exitedAfterTerm = await waitForExit(child, 2_000);
        if (!exitedAfterTerm) child.kill("SIGKILL");
      }
    },
  };
}
