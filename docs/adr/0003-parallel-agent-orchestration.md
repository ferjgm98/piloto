# ADR 0003: Parallel agent execution and multi-session UI

- **Status:** Superseded by [ADR 0004](./0004-session-thread-model.md) (2026-05-02)
- **Date:** 2026-05-02
- **Ticket:** [PIL-23](https://linear.app/piloto/issue/PIL-23) (sliced into [PIL-42](https://linear.app/piloto/issue/PIL-42), [PIL-43](https://linear.app/piloto/issue/PIL-43), [PIL-44](https://linear.app/piloto/issue/PIL-44), [PIL-45](https://linear.app/piloto/issue/PIL-45))

> **Superseded:** The single-`agent_session`-per-workspace model documented here was replaced same-day by the workspace > session > thread restructure ([PIL-47](https://linear.app/piloto/issue/PIL-47)). `agent_sessions` becomes `threads`; a new `sessions` parent groups thread tabs; bin processes are now per-thread (with a symlinked thread session dir for multi-repo). See ADR 0004 for the new design and the slicing into PIL-48–PIL-53. The "Decisions" section below is preserved as historical record of the pre-restructure model.

## Context

PIL-21 shipped single-agent lifecycle (one Claude or Codex backend at a time, in-memory `Map<sessionId, RegistryEntry>`, `agentOutput` / `agentStatusChange` push channels). PIL-23 turns that into multi-session: run up to N agents in parallel across worktrees, with a UI that shows them all and lets the user converse with each.

The work was sliced into four vertical tickets. This ADR captures the design decisions that bind across slices, so each implementer doesn't re-derive them and so future readers can understand why each slice looks the way it does.

## Decisions

### Concurrency control (PIL-42)

- **Pre-reserve a registry slot before spawning.** `startAgent` writes a placeholder `RegistryEntry` (with a nullable `backend` field) immediately after the size + per-worktree checks, then fills `backend` once `start()` resolves. Two concurrent calls cannot both pass the size check because JS is single-threaded between the check and the `set`. Without this, the existing code path checks size, awaits the slow `backend.start()`, and only then registers — opening a window for the 6th agent to slip through.
- **DB partial unique index is the second line of defense.** `agent_sessions_running_per_worktree_idx` on `(worktree_id) WHERE status='running' AND worktree_id IS NOT NULL`, written as raw SQL in the migration since Drizzle Kit doesn't support partial indexes natively.
- **Migration cleans zombie rows before adding the index.** Same migration runs `UPDATE agent_sessions SET status='error', error_message='orphaned at restart' WHERE status='running'` first. Pre-PIL-43 builds left rows marked `running` with no live process; without the cleanup the partial unique index can fail to create on existing dev DBs, and the in-memory concurrency count would be wrong on first boot.

### Bulk teardown and shutdown (PIL-43)

- **Two named exports**, sharing a private helper:
  - `stopAllAgents(workspaceId: string)` for the RPC method (workspace-scoped).
  - `stopAllAgentsGlobal()` for signal handlers (every workspace).
    Internal `_stopAllInRegistry(predicate)` keeps the iteration logic in one place.
- **`Promise.allSettled` over the matched entries.** Parallel teardown bounds shutdown to roughly one backend's `shutdown(5_000)` timeout. `allSettled` so a hung agent doesn't reject the whole bundle and leave others alive.
- **Window close uses the same teardown path as SIGTERM/SIGINT.** Today `mainWindow.on("close", () => process.exit(0))` exits immediately. macOS red-traffic-light close is the most common shutdown path; not handling it would orphan child processes and make PIL-43 mostly cosmetic. Window-close, SIGTERM, and SIGINT all `await stopAllAgentsGlobal()` then `process.exit(0)`.

### Single-session view (PIL-44)

- **Component contract is `{ sessionId }` only.** Initial state comes from `useRPCQuery("getAgentSession", { sessionId })`; `agentStatusChange` and `agentOutput` subscriptions overlay updates into local state. The view works in isolation (deep link, standalone mount) without depending on a parent that already has the DTO.
- **Service-side guard on `sendPrompt`.** Throws `ValidationError` when the registry entry exists but `stopping=true`, `NotFoundError` when absent. UI also disables Send when status ≠ running, but the service guard is the load-bearing check — covers races between click and IPC arrival, and gives future programmatic callers a typed error rather than the opaque `"claude backend not started"` string from the backend layer.

### Multi-session shell (PIL-45)

- **New `WorkspaceShell` component, two-pane (sidebar | detail).** Hosts `<AgentSessionsSidebar>` on the left and `<AgentSessionView sessionId={activeSessionId} />` on the right. Today's `app.tsx` is a design-system showcase + workspace listing with no per-workspace shell; this is where one lands. Showcase content moves to a dev-only route.
- **`activeSessionId` lives in `useState` inside `WorkspaceShell`.** Two consumers, one parent — no router, no context, no state library (the ask-first list in CLAUDE.md bans Zustand/Redux/TanStack and we don't need them yet). Promote to URL routing the day deep-linking matters.
- **Sidebar shows all sessions, sorted `status='running' DESC, updated_at DESC`.** Live work pinned to the top, history visible underneath. Output history on stopped sessions is OOS for this milestone, so a stopped session shows an empty pane plus a "session ended" placeholder. Filtering and archive UX are explicit follow-ups, not part of PIL-45.

## Consequences

- The registry is now load-bearing for two safety properties (concurrency cap, per-worktree uniqueness) plus shutdown correctness. Any future code path that mutates it must go through `agent.service.ts` — direct `Map` access from outside the module is a regression risk.
- The same three call sites (window close, SIGTERM, SIGINT) all funnel into `stopAllAgentsGlobal`. Tests for PIL-43 should cover at least one signal path and the window-close path.
- The DB migration that adds the partial unique index also rewrites historical `running` rows. That row rewrite is a one-shot, idempotent on re-run (the rows are already `error`), and intentional — it is not a bug and shouldn't be "reverted" if it surfaces in a diff against an older dev DB.
- `WorkspaceShell` becomes the canonical place to add per-workspace UI. Future work (terminal panel, MCP panel, diff viewer) plugs into the same shell rather than each feature inventing its own layout.

## Alternatives considered

- **DB-only concurrency check (no in-memory pre-reservation).** Rejected: a partial unique index can enforce "one running agent per worktree", but not "max N running across the workspace" without a counter table. The in-memory check is cheap and correct.
- **Sequential teardown.** Rejected: up to 25s shutdown lag with five agents, no benefit beyond log ordering.
- **Push-only initial state in PIL-44 (no `getAgentSession` query on mount).** Rejected: status pill stays empty for stopped/idle sessions until a transition that may never come.
- **Filtering the sidebar to running-only.** Rejected for now — losing stopped sessions instantly feels broken when there's no other surface to revisit them. Revisit when archive/filter UX lands.
