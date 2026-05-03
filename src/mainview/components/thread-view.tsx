import { useSendThreadPrompt, useStopThread, useThreadOutput } from "@/hooks";
import type { RPCClientError } from "@/lib/rpc-client";
import { useEffect, useRef, useState } from "react";
import type { AgentStatus, AgentUpdateDTO, ThreadDTO } from "shared/rpc";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

const STATUS_VARIANT: Record<AgentStatus, "secondary" | "warning" | "success" | "destructive"> = {
  idle: "secondary",
  running: "warning",
  stopped: "secondary",
  error: "destructive",
};

function formatChunk(chunk: AgentUpdateDTO): string {
  switch (chunk.kind) {
    case "message":
      return chunk.text;
    case "thought":
      return `[thought] ${chunk.text}`;
    case "tool_call":
      return `[tool ${chunk.toolKind} · ${chunk.status}] ${chunk.title}`;
    case "tool_call_update":
      return `[tool ${chunk.status}]${chunk.title ? ` ${chunk.title}` : ""}`;
    case "plan":
      return `[plan]\n${chunk.entries
        .map((e) => `  - (${e.status}/${e.priority}) ${e.content}`)
        .join("\n")}`;
  }
}

interface ThreadViewProps {
  threadId: string;
  thread: ThreadDTO | undefined;
  threadError: RPCClientError | undefined;
  refetch: () => void;
}

export function ThreadView({ threadId, thread, threadError, refetch }: ThreadViewProps) {
  const chunks = useThreadOutput(threadId);
  const { mutate: sendPrompt, loading: sending, error: sendError } = useSendThreadPrompt();
  const { mutate: stopThread, loading: stopping, error: stopError } = useStopThread();
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom whenever new chunks arrive
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chunks]);

  const status = thread?.status ?? "idle";
  const canSend = status === "running" && draft.trim().length > 0 && !sending;
  const canStop = status === "running" && !stopping;

  const handleSend = async () => {
    if (!canSend) return;
    const prompt = draft.trim();
    const result = await sendPrompt({ threadId, prompt });
    if (result?.success) setDraft("");
  };

  const handleStop = async () => {
    if (!canStop) return;
    const result = await stopThread({ threadId });
    if (result?.success) refetch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col rounded-md border border-border bg-card">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">
            {thread?.backend ?? "thread"}
          </span>
          <Badge variant={STATUS_VARIANT[status]} className="text-xs">
            {status}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">{threadId.slice(0, 8)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleStop} disabled={!canStop}>
          {stopping ? "Stopping…" : "Stop"}
        </Button>
      </header>

      {threadError && (
        <div className="shrink-0 border-b border-destructive/50 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {threadError.code}: {threadError.message}
        </div>
      )}

      {thread?.errorMessage && (
        <div className="shrink-0 border-b border-destructive/50 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {thread.errorMessage}
        </div>
      )}

      {stopError && (
        <div className="shrink-0 border-b border-destructive/50 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          Stop failed — {stopError.code}: {stopError.message}
        </div>
      )}

      <pre
        ref={logRef}
        className="flex-1 overflow-auto whitespace-pre-wrap break-words bg-background px-4 py-3 font-mono text-xs text-foreground"
      >
        {chunks.length === 0 ? (
          <span className="text-muted-foreground">No output yet.</span>
        ) : (
          chunks.map((chunk, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, index is stable
            <div key={i} className="mb-1">
              {formatChunk(chunk)}
            </div>
          ))
        )}
      </pre>

      <footer className="shrink-0 border-t border-border p-3">
        {sendError && (
          <div className="mb-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
            {sendError.code}: {sendError.message}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              status === "running" ? "Send a follow-up… (⌘/Ctrl+Enter)" : "Thread is not running"
            }
            disabled={status !== "running"}
            rows={3}
            className="flex-1 resize-none"
          />
          <Button onClick={handleSend} disabled={!canSend} size="sm">
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
