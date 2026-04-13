const SESSIONS = [
  {
    branch: "feat/agent-dashboard",
    repo: "piloto",
    agent: "Claude Code",
    status: "active" as const,
    message: "Adding activity timeline to homepage",
    time: "2m ago",
  },
  {
    branch: "fix/rpc-error-handling",
    repo: "piloto",
    agent: "Claude Code",
    status: "pending" as const,
    message: "Improved error serialization across IPC boundary",
    time: "1h ago",
  },
  {
    branch: "feat/worktree-manager",
    repo: "piloto",
    agent: "Codex CLI",
    status: "idle" as const,
    message: "Implemented worktree creation and cleanup",
    time: "3h ago",
  },
  {
    branch: "docs/architecture-update",
    repo: "conductor",
    agent: "Claude Code",
    status: "idle" as const,
    message: "Updated ARCHITECTURE.md with new agent layer docs",
    time: "5h ago",
  },
  {
    branch: "refactor/db-schema",
    repo: "kargo",
    agent: "Codex CLI",
    status: "idle" as const,
    message: "Normalized delivery tables, added indexes",
    time: "1d ago",
  },
];

const WORKSPACES = ["piloto", "conductor", "kargo"];
const AGENTS = [
  { name: "Claude Code", active: true },
  { name: "Codex CLI", active: false },
];

const STATUS_COLOR = {
  active: "bg-success",
  pending: "bg-warning",
  idle: "bg-muted-foreground/30",
} as const;

export function Home() {
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
          <ul className="space-y-0.5">
            {WORKSPACES.map((ws, i) => (
              <li key={ws}>
                <button
                  type="button"
                  className={
                    i === 0
                      ? "flex w-full items-center gap-2.5 rounded-md bg-primary/15 px-2 py-1.5 text-sm font-medium text-foreground"
                      : "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  {ws}
                </button>
              </li>
            ))}
          </ul>
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
            <h1 className="text-sm font-semibold text-foreground">piloto</h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-muted-foreground">
              3 active
            </span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <span className="text-sm leading-none">+</span> New session
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-auto">
          <div className="px-5 pb-2 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent sessions
            </p>
          </div>

          <ul className="px-2">
            {SESSIONS.map((item, i) => (
              <li key={item.branch} className={i > 0 ? "border-t border-border" : ""}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/40"
                >
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${STATUS_COLOR[item.status]}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-mono text-xs text-foreground">
                        {item.branch}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {item.repo}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular-nums text-[10px] text-muted-foreground">
                      {item.time}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{item.agent}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
