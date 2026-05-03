import { type UseTreeExpansionResult, useSessions, useThreads, useWorkspaces } from "@/hooks";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import type { AgentStatus, MainRPC, SessionDTO, ThreadDTO } from "shared/rpc";
import { NewSessionDialog } from "./new-session-dialog";
import { ScrollArea } from "./ui/scroll-area";

type Workspace = MainRPC["bun"]["requests"]["listWorkspaces"]["response"][number];

interface WorkspaceTreeProps {
  expansion: UseTreeExpansionResult;
}

export function WorkspaceTree({ expansion }: WorkspaceTreeProps) {
  const { data: workspaces, loading, error } = useWorkspaces();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
          P
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">piloto</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 pt-3">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </p>

          {error ? (
            <p className="px-2 py-1.5 text-xs text-destructive">{error.message}</p>
          ) : loading ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
          ) : !workspaces || workspaces.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No workspaces yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <WorkspaceNode workspace={workspace} expansion={expansion} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>

      <div className="mt-auto shrink-0 border-t border-border px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
            F
          </div>
          <span className="text-sm text-foreground">fernando</span>
        </div>
      </div>
    </aside>
  );
}

interface WorkspaceNodeProps {
  workspace: Workspace;
  expansion: UseTreeExpansionResult;
}

function WorkspaceNode({ workspace, expansion }: WorkspaceNodeProps) {
  const expanded = expansion.isWorkspaceExpanded(workspace.id);

  return (
    <div>
      <DisclosureRow
        expanded={expanded}
        onToggle={() => expansion.toggleWorkspace(workspace.id)}
        label={workspace.name}
        indent="pl-2"
      />
      {expanded && <ExpandedWorkspace workspaceId={workspace.id} expansion={expansion} />}
    </div>
  );
}

interface ExpandedWorkspaceProps {
  workspaceId: string;
  expansion: UseTreeExpansionResult;
}

function ExpandedWorkspace({ workspaceId, expansion }: ExpandedWorkspaceProps) {
  const { data: sessions, loading, error, refetch } = useSessions(workspaceId);

  return (
    <div className="mt-0.5 space-y-0.5">
      {error ? (
        <p className="px-2 py-1 pl-7 text-xs text-destructive">{error.message}</p>
      ) : loading ? (
        <p className="px-2 py-1 pl-7 text-xs text-muted-foreground">Loading…</p>
      ) : sessions && sessions.length > 0 ? (
        sessions.map((session) => (
          <SessionNode key={session.id} session={session} expansion={expansion} />
        ))
      ) : null}
      <NewSessionButton workspaceId={workspaceId} expansion={expansion} refetchSessions={refetch} />
    </div>
  );
}

interface SessionNodeProps {
  session: SessionDTO;
  expansion: UseTreeExpansionResult;
}

function SessionNode({ session, expansion }: SessionNodeProps) {
  const expanded = expansion.isSessionExpanded(session.id);

  return (
    <div>
      <DisclosureRow
        expanded={expanded}
        onToggle={() => expansion.toggleSession(session.id)}
        label={session.name}
        indent="pl-5"
      />
      {expanded && (
        <ExpandedSession
          sessionId={session.id}
          workspaceId={session.workspaceId}
          expansion={expansion}
        />
      )}
    </div>
  );
}

interface ExpandedSessionProps {
  sessionId: string;
  workspaceId: string;
  expansion: UseTreeExpansionResult;
}

function ExpandedSession({ sessionId, workspaceId, expansion }: ExpandedSessionProps) {
  const { data: threads, loading, error, refetch } = useThreads({ sessionId });

  return (
    <div className="mt-0.5 space-y-0.5">
      {error ? (
        <p className="px-2 py-1 pl-10 text-xs text-destructive">{error.message}</p>
      ) : loading ? (
        <p className="px-2 py-1 pl-10 text-xs text-muted-foreground">Loading…</p>
      ) : threads && threads.length > 0 ? (
        threads.map((thread) => (
          <ThreadNode
            key={thread.id}
            thread={thread}
            active={expansion.activeThreadId === thread.id}
            onSelect={() => expansion.setActiveThreadId(thread.id)}
          />
        ))
      ) : null}
      <NewThreadButton
        sessionId={sessionId}
        workspaceId={workspaceId}
        expansion={expansion}
        refetchThreads={refetch}
      />
    </div>
  );
}

interface ThreadNodeProps {
  thread: ThreadDTO;
  active: boolean;
  onSelect: () => void;
}

function ThreadNode({ thread, active, onSelect }: ThreadNodeProps) {
  const label = thread.prompt && thread.prompt.trim().length > 0 ? thread.prompt : thread.backend;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      aria-current={active ? "true" : undefined}
      className={
        active
          ? "flex w-full items-center gap-2 rounded-md bg-primary/15 py-1.5 pr-2 pl-8 text-left text-foreground"
          : "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-left text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }
    >
      <StatusDot status={thread.status} />
      <span className="truncate text-xs">{label}</span>
    </button>
  );
}

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  idle: "bg-muted-foreground/30",
  running: "bg-warning animate-pulse",
  stopped: "bg-muted-foreground/30",
  error: "bg-destructive",
};

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span
      aria-label={`status: ${status}`}
      className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`}
    />
  );
}

interface DisclosureRowProps {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  indent: string;
}

function DisclosureRow({ expanded, onToggle, label, indent }: DisclosureRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 ${indent} text-left text-sm text-foreground hover:bg-accent/50`}
      data-state={expanded ? "open" : "closed"}
    >
      <ChevronRight
        className="size-3 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-90"
        data-state={expanded ? "open" : "closed"}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

interface NewSessionButtonProps {
  workspaceId: string;
  expansion: UseTreeExpansionResult;
  refetchSessions: () => void;
}

function NewSessionButton({ workspaceId, expansion, refetchSessions }: NewSessionButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-5 text-left text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <Plus className="size-3 shrink-0" />
        <span>New session</span>
      </button>
      <NewSessionDialog
        workspaceId={workspaceId}
        open={open}
        onOpenChange={setOpen}
        onCreated={(threadId) => expansion.setActiveThreadId(threadId)}
        onSessionListShouldRefresh={refetchSessions}
      />
    </>
  );
}

interface NewThreadButtonProps {
  workspaceId: string;
  sessionId: string;
  expansion: UseTreeExpansionResult;
  refetchThreads: () => void;
}

function NewThreadButton({
  workspaceId,
  sessionId,
  expansion,
  refetchThreads,
}: NewThreadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 pl-8 text-left text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <Plus className="size-3 shrink-0" />
        <span>New thread</span>
      </button>
      <NewSessionDialog
        workspaceId={workspaceId}
        presetSessionId={sessionId}
        open={open}
        onOpenChange={setOpen}
        onCreated={(threadId) => expansion.setActiveThreadId(threadId)}
        onThreadListShouldRefresh={refetchThreads}
      />
    </>
  );
}
