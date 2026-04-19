import { useWorkspaces } from "@/hooks";
import { useEffect, useState } from "react";
import { WorktreeDashboard } from "./worktree-dashboard";

const AGENTS = [
  { name: "Claude Code", active: true },
  { name: "Codex CLI", active: false },
];

export function Home() {
  const { data: workspaces, loading, error } = useWorkspaces();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) {
      setActiveWorkspaceId(null);
      return;
    }

    const hasActiveWorkspace = workspaces.some((workspace) => workspace.id === activeWorkspaceId);
    if (!hasActiveWorkspace) {
      setActiveWorkspaceId(workspaces[0]?.id ?? null);
    }
  }, [activeWorkspaceId, workspaces]);

  const activeWorkspace =
    workspaces?.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground antialiased scheme-only-dark">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex h-11 items-center gap-2 border-b border-border px-3.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-primary-foreground">
            P
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">piloto</span>
        </div>

        {/* Workspace list */}
        <div className="px-2 pt-4 pb-2">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </p>
          {loading ? (
            <p className="px-2 text-sm text-muted-foreground">Loading…</p>
          ) : workspaces && workspaces.length > 0 ? (
            <ul className="space-y-0.5">
              {workspaces.map((workspace) => {
                const isActive = workspace.id === activeWorkspaceId;
                return (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      className={
                        isActive
                          ? "flex w-full items-center gap-2.5 rounded-md bg-primary/15 px-2 py-1.5 text-sm font-medium text-foreground"
                          : "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }
                      onClick={() => {
                        setActiveWorkspaceId(workspace.id);
                      }}
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${isActive ? "bg-primary" : "bg-muted-foreground/30"}`}
                      />
                      {workspace.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 text-sm text-muted-foreground">No workspaces yet.</p>
          )}
        </div>

        <div className="mx-3 my-1 border-t border-border" />

        {/* Agents */}
        <div className="px-2 pt-2 pb-2">
          <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Agents
          </p>
          <div className="space-y-0.5">
            {AGENTS.map((agent) => (
              <div
                key={agent.name}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${agent.active ? "text-foreground" : "text-muted-foreground"}`}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${agent.active ? "bg-success" : "bg-muted-foreground/30"}`}
                />
                {agent.name}
              </div>
            ))}
          </div>
        </div>

        {/* User */}
        <div className="mt-auto border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
              F
            </div>
            <span className="text-sm text-foreground">fernando</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground">
              {activeWorkspace?.name ?? "Worktree dashboard"}
            </h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-muted-foreground">
              Live status
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Watcher-driven updates</span>
        </div>

        {/* Dashboard */}
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-5 py-6">
            {error ? (
              <section className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
                <p className="text-sm text-destructive">
                  Failed to load workspaces: {error.message}
                </p>
              </section>
            ) : activeWorkspace ? (
              <WorktreeDashboard
                workspaceId={activeWorkspace.id}
                workspaceName={activeWorkspace.name}
              />
            ) : (
              <section className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm text-foreground">
                  Create a workspace to start tracking worktrees.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This dashboard updates automatically when files change inside tracked worktrees.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
