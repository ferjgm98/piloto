import type { Subprocess } from "bun";

export interface LineStreamOptions {
  binary: string;
  args: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  onLine: (line: string) => void;
  onStderr?: (chunk: string) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

export interface LineStreamHandle {
  writeLine(line: string): void;
  closeStdin(): void;
  shutdown(timeoutMs?: number): Promise<void>;
}

function filteredEnv(env: Record<string, string | undefined> | undefined): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(env ?? process.env)) {
    if (typeof v === "string") merged[k] = v;
  }
  return merged;
}

async function pipeLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx = buf.indexOf("\n");
      while (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.length > 0) onLine(line);
        idx = buf.indexOf("\n");
      }
    }
    buf += decoder.decode();
    if (buf.length > 0) onLine(buf);
  } finally {
    reader.releaseLock();
  }
}

export function spawnLineStream(opts: LineStreamOptions): LineStreamHandle {
  const proc = Bun.spawn([opts.binary, ...opts.args], {
    cwd: opts.cwd,
    env: filteredEnv(opts.env),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  }) as Subprocess<"pipe", "pipe", "pipe">;

  void pipeLines(proc.stdout, opts.onLine).catch(() => {});
  if (opts.onStderr) {
    const onStderr = opts.onStderr;
    void pipeLines(proc.stderr, (chunk) => onStderr(chunk)).catch(() => {});
  }
  void proc.exited.then(() => opts.onExit(proc.exitCode, proc.signalCode ?? null));

  return {
    writeLine(line) {
      proc.stdin.write(`${line}\n`);
      proc.stdin.flush();
    },
    closeStdin() {
      proc.stdin.end();
    },
    async shutdown(timeoutMs = 5_000) {
      try {
        proc.stdin.end();
      } catch {}
      const timer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);
      const hardTimer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs + 2_000);
      try {
        await proc.exited;
      } finally {
        clearTimeout(timer);
        clearTimeout(hardTimer);
      }
    },
  };
}

type JsonRpcId = number;
type PendingRequest = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export interface JsonRpcPeer {
  request<T>(method: string, params?: unknown): Promise<T>;
  notify(method: string, params?: unknown): void;
  onNotification(cb: (method: string, params: unknown) => void): void;
  shutdown(timeoutMs?: number): Promise<void>;
}

export interface JsonRpcPeerOptions {
  binary: string;
  args: string[];
  cwd: string;
  env?: Record<string, string | undefined>;
  onExit: (code: number | null, signal: string | null) => void;
  onStderr?: (chunk: string) => void;
}

export function connectJsonRpc(opts: JsonRpcPeerOptions): JsonRpcPeer {
  const pending = new Map<JsonRpcId, PendingRequest>();
  let nextId = 0;
  let notificationCb: ((method: string, params: unknown) => void) | null = null;

  const stream = spawnLineStream({
    binary: opts.binary,
    args: opts.args,
    cwd: opts.cwd,
    env: opts.env,
    onStderr: opts.onStderr,
    onExit: (code, signal) => {
      for (const { reject } of pending.values()) {
        reject(new Error(`jsonrpc peer exited code=${code} signal=${signal}`));
      }
      pending.clear();
      opts.onExit(code, signal);
    },
    onLine: (line) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof msg.id === "number") {
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if ("error" in msg && msg.error) {
          const err = msg.error as { message?: string; code?: number };
          entry.reject(new Error(err.message ?? "jsonrpc error"));
        } else {
          entry.resolve(msg.result);
        }
      } else if (typeof msg.method === "string") {
        notificationCb?.(msg.method, msg.params);
      }
    },
  });

  return {
    request<T>(method: string, params?: unknown): Promise<T> {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        stream.writeLine(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    },
    notify(method: string, params?: unknown): void {
      stream.writeLine(JSON.stringify({ jsonrpc: "2.0", method, params }));
    },
    onNotification(cb) {
      notificationCb = cb;
    },
    shutdown(timeoutMs) {
      return stream.shutdown(timeoutMs);
    },
  };
}
