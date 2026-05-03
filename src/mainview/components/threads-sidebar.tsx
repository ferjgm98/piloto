import { useStopAllThreads, useThreads } from "@/hooks";
import { useState } from "react";
import type { AgentStatus, ThreadDTO } from "shared/rpc";
import { NewSessionDialog } from "./new-session-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface ThreadsSidebarProps {
  workspaceId: string;
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
}

const STATUS_VARIANT: Record<AgentStatus, "secondary" | "warning" | "destructive"> = {
  idle: "secondary",
  running: "warning",
  stopped: "secondary",
  error: "destructive",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function previewPrompt(prompt: string | null): string {
  if (!prompt) return "(no prompt)";
  if (prompt.length <= 60) return prompt;
  return `${prompt.slice(0, 60)}…`;
}

export function ThreadsSidebar({ workspaceId, activeThreadId, onSelect }: ThreadsSidebarProps) {
  const { data: threads, loading, error, refetch } = useThreads({ workspaceId });
  const { mutate: stopAll, loading: stoppingAll, error: stopAllError } = useStopAllThreads();
  const [dialogOpen, setDialogOpen] = useState(false);

  const runningCount = threads?.filter((t) => t.status === "running").length ?? 0;
  const canStopAll = runningCount > 0 && !stoppingAll;

  const handleStopAll = async () => {
    if (!canStopAll) return;
    if (!globalThis.confirm(`Stop ${runningCount} running thread(s)?`)) return;
    const result = await stopAll({ workspaceId });
    if (result) refetch();
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Threads</h2>
          <Badge variant="outline" className="text-xs tabular-nums">
            {threads?.length ?? 0}
          </Badge>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleStopAll}
          disabled={!canStopAll}
        >
          {stoppingAll ? "Stopping…" : "Stop all"}
        </Button>
      </header>

      {stopAllError && (
        <div className="shrink-0 border-b border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Stop all failed — {stopAllError.code}: {stopAllError.message}
        </div>
      )}

      <div className="shrink-0 border-b border-border p-3">
        <Button type="button" size="sm" className="w-full" onClick={() => setDialogOpen(true)}>
          + New thread
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="px-3 py-2 text-xs text-destructive">{error.message}</div>
        ) : loading ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : threads && threads.length > 0 ? (
          <ul className="space-y-0.5 p-2">
            {threads.map((thread: ThreadDTO) => {
              const isActive = thread.id === activeThreadId;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(thread.id)}
                    className={
                      isActive
                        ? "flex w-full flex-col gap-1 rounded-md bg-primary/15 px-2.5 py-2 text-left text-foreground"
                        : "flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{thread.backend}</span>
                      <Badge variant={STATUS_VARIANT[thread.status]} className="text-[10px]">
                        {thread.status}
                      </Badge>
                    </div>
                    <p className="truncate text-xs">{previewPrompt(thread.prompt)}</p>
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {relativeTime(thread.updatedAt)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="m-3 rounded-md border border-dashed border-border p-4">
            <p className="text-xs text-foreground">No threads yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click "+ New thread" to start an agent in a worktree.
            </p>
          </div>
        )}
      </div>

      <NewSessionDialog
        workspaceId={workspaceId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(threadId) => {
          onSelect(threadId);
          refetch();
        }}
      />
    </aside>
  );
}
