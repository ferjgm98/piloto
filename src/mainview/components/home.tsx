import { useThread, useThreadStatusChange, useTreeExpansion } from "@/hooks";
import type { AgentStatus, ThreadDTO } from "shared/rpc";
import { ThreadView } from "./thread-view";
import { Badge } from "./ui/badge";
import { WorkspaceTree } from "./workspace-tree";

const STATUS_VARIANT: Record<AgentStatus, "secondary" | "warning" | "destructive"> = {
  idle: "secondary",
  running: "warning",
  stopped: "secondary",
  error: "destructive",
};

export function Home() {
  const expansion = useTreeExpansion();
  const { activeThreadId } = expansion;

  return (
    <div className="isolate flex h-dvh overflow-hidden bg-background text-foreground antialiased scheme-only-dark">
      <WorkspaceTree expansion={expansion} />

      <main className="flex flex-1 flex-col overflow-hidden">
        {activeThreadId ? (
          <ActiveThreadPane threadId={activeThreadId} />
        ) : (
          <>
            <ToolbarShell title="No thread selected" />
            <EmptyState />
          </>
        )}
      </main>
    </div>
  );
}

function ActiveThreadPane({ threadId }: { threadId: string }) {
  const { data: thread, refetch } = useThread(threadId);

  useThreadStatusChange(
    (payload) => {
      if (payload.threadId === threadId) refetch();
    },
    [threadId],
  );

  return (
    <>
      <ThreadToolbar thread={thread ?? null} />
      <div className="flex flex-1 overflow-hidden">
        <ThreadView threadId={threadId} />
      </div>
    </>
  );
}

function ThreadToolbar({ thread }: { thread: ThreadDTO | null }) {
  const title = formatThreadTitle(thread);
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-5">
      <div className="flex items-center gap-3">
        <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
        {thread && (
          <Badge variant={STATUS_VARIANT[thread.status]} className="text-[10px]">
            {thread.status}
          </Badge>
        )}
      </div>
      {thread && (
        <span className="font-mono text-xs text-muted-foreground">{thread.id.slice(0, 8)}</span>
      )}
    </div>
  );
}

function ToolbarShell({ title }: { title: string }) {
  return (
    <div className="flex h-11 shrink-0 items-center border-b border-border px-5">
      <h1 className="text-sm font-semibold text-muted-foreground">{title}</h1>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden p-5">
      <div className="max-w-md rounded-md border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium text-foreground">No thread selected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a thread from the sidebar, or expand a session and start a new one.
        </p>
      </div>
    </div>
  );
}

function formatThreadTitle(thread: ThreadDTO | null): string {
  if (!thread) return "Loading…";
  const prompt = thread.prompt?.trim();
  if (prompt) {
    return prompt.length <= 60 ? prompt : `${prompt.slice(0, 60)}…`;
  }
  return BACKEND_LABEL[thread.backend] ?? thread.backend;
}

const BACKEND_LABEL: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
};
