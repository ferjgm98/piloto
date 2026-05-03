# ADR 0004: Session / thread model and multi-repo bin orchestration

- **Status:** Accepted
- **Date:** 2026-05-02
- **Ticket:** [PIL-47](https://linear.app/piloto/issue/PIL-47) (sliced into [PIL-48](https://linear.app/piloto/issue/PIL-48), [PIL-49](https://linear.app/piloto/issue/PIL-49), [PIL-50](https://linear.app/piloto/issue/PIL-50), [PIL-51](https://linear.app/piloto/issue/PIL-51), [PIL-52](https://linear.app/piloto/issue/PIL-52), [PIL-53](https://linear.app/piloto/issue/PIL-53))
- **Supersedes:** [ADR 0003](./0003-parallel-agent-orchestration.md)

## Context

ADR 0003 documented the single-`agent_session`-per-workspace model: one bin process per workspace, optional single-worktree binding via `agent_sessions.worktree_id`. That shape stops working as soon as users want:

- Multiple parallel conversations within the same workspace (a "session" of related threads).
- A single bin process that can read and edit files across more than one repo at once (per-thread multi-repo).
- Stable conversation history detached from a specific worktree, model variant, or backend.

The fix is a three-level hierarchy — **workspace → session → thread** — backed by per-thread multi-repo bindings and a per-thread filesystem session directory that the bin uses as its `cwd`. This ADR records the binding decisions across the slices so each implementer does not re-derive them.

## Decisions

| # | Decision | Notes |
| -- | -------- | ----- |
| 1. Schema | Rename `agent_sessions` → `threads`; add `sessions` parent table; add `thread_repos` join table for per-thread multi-repo bindings | `threads(session_id)` cascades from `sessions(workspace_id)`. `thread_repos(worktree_id)` cascades from `active_worktrees`. |
| 2. State ownership | Per-thread: backend, model, prompt, status, repo bindings, todos, plan. Session = pure grouping (id, name, workspace_id, timestamps) | Sessions hold no agent state; renaming a session never touches running threads. |
| 3. Multi-repo bin | One bin process per thread, `cwd = ~/.piloto/threads/<thread_id>/`, with each scoped worktree symlinked as `<repo-alias>/` inside the dir | Created in `startThread`, removed on stop / exit / shutdown. Symlinks unlink without touching their targets. |
| 4. Repo subset | `thread_repos` is immutable for the lifetime of a thread. Wanting a different subset = new thread | Avoids mid-conversation cwd changes that would invalidate the bin's cached file state. |
| 5. Worktree pick | Per-repo dropdown with "+ new worktree" or pick existing — one binding per repo at thread creation | Slice 1+2 ships the single-binding form; richer per-repo picker lands in PIL-51. |
| 6. New thread UX | Inline empty thread (no modal) with sensible defaults: all workspace repos, first model | Deferred to PIL-51. PIL-48+49 keep the existing dialog and emit one binding per submission. |
| 7. Lock granularity | Backend frozen at first message (i.e. `promptsSent > 0`). Model variant, reasoning level, fast mode, plan mode are hot-swappable within a backend | Enforced server-side in `updateThreadSettings`. The registry's `promptsSent` counter is the source of truth. |
| 8. Cross-backend in picker | Switching backend after a message is forbidden; the UI offers "↗ open in new tab" — spawns a new thread in the same session, bound to that backend | Preserves history while letting the user compare backends side by side. |
| 9. Migration | Drop existing `agent_sessions` data wholesale (pre-prod, no real users). Drop `active_worktrees.agent_session_id`. Preserve `active_worktrees` rows | SQLite `__new_active_worktrees` rename trick mirrors migration 4. |
| 10. RPC reshape | Replace `agent.*` with `thread.*` (start/stop/list/get/sendPrompt/stopAllThreads) and add `session.*` CRUD. Push messages: `agentOutput`/`agentStatusChange` → `threadOutput`/`threadStatusChange` keyed on `threadId` | No legacy shim; webview hooks rename in lockstep. |
| 11. Sidebar | Multi-workspace 2-level tree (workspace → sessions); threads as tabs in the main area | UI redesign deferred to PIL-50/51; PIL-48+49 retarget the existing sidebar to threads under one active workspace as a stepping stone. |

### Slicing

| # | Ticket | Scope |
| -- | ----- | ----- |
| 1 | [PIL-48](https://linear.app/piloto/issue/PIL-48) | Schema rewrite + service layer (`session.service`, `thread.service`, `thread-session-dir.service`) + migration |
| 2 | [PIL-49](https://linear.app/piloto/issue/PIL-49) | RPC reshape + bulk-teardown + webview hook/component rename. Bundled with slice 1 in this PR |
| 3 | [PIL-50](https://linear.app/piloto/issue/PIL-50) | Workspace tree sidebar |
| 4 | [PIL-51](https://linear.app/piloto/issue/PIL-51) | Inline empty thread + per-repo picker |
| 5 | [PIL-52](https://linear.app/piloto/issue/PIL-52) | Reasoning / fast / plan UI controls wired to `updateThreadSettings` |
| 6 | [PIL-53](https://linear.app/piloto/issue/PIL-53) | Cross-backend "open in new tab" affordance |

Slices 1 and 2 ship together because they have no useful intermediate state: the schema and RPC contracts are inseparable, and there is no shim layer worth the wiring cost given there are no real users yet.

### Per-thread session directory

`~/.piloto/threads/<thread-id>/` is created on `startThread` after the DB transaction inserts `threads` + `thread_repos`. Each binding's `worktreePath` is `fs.symlink`ed at `<dir>/<alias>`. The bin process spawns with that directory as `cwd`, so its multi-repo view is the alias namespace the user picked. Cleanup runs on:

- backend exit (any code)
- `stopThread`
- `stopAllThreads(workspaceId)`
- `stopAllThreadsGlobal()` (window close, SIGTERM, SIGINT)
- `startThread` failures, before the error propagates

`cleanupThreadSessionDir` is idempotent (`fs.rm` with `force: true`) so repeated teardown signals are safe.

### Default alias

`thread_repos.alias` defaults to `workspace_repos.name` if non-null, else `path.basename(workspace_repos.path)`. Empty after both fallbacks throws `ValidationError`. Aliases are unique within a thread; the `thread_repos_thread_alias_idx` unique index enforces that at the DB level.

### Concurrency

`MAX_CONCURRENT_THREADS = 5` (carried over from `MAX_CONCURRENT_AGENTS`). The pre-reservation pattern from ADR 0003 is preserved: the registry slot is taken before `backend.start()`, and the `thread_repos_worktree_active_idx` partial unique index on `(worktree_id)` is the second line of defense (one running thread per worktree). The lookup `isWorktreeBoundToActiveThread(worktreeId)` is exposed from `thread.service` so the worktree module can deny removal of bound worktrees without duplicating the join.

### Push channels

`threadOutput { threadId, chunk }` and `threadStatusChange { threadId, status, error? }` replace the agent-keyed equivalents. The webview hook surface (`useThreads`, `useThread`, `useThreadOutput`, `useThreadStatusChange`, etc.) lives in `src/mainview/hooks/use-threads.ts`; session CRUD in `use-sessions.ts`.

## Consequences

- A single feature now ships in two RPC modules (`session`, `thread`) rather than one `agent`. Cross-module imports inside `src/bun/` go through the service layer (CLAUDE.md rule), so the worktree module's "is bound" check calls `thread.service.isWorktreeBoundToActiveThread` directly.
- Migration 6 drops `agent_sessions` wholesale. Local DBs created before this commit need to be deleted (or they will fail the migration on the dropped foreign key). Acceptable because there are no real users yet.
- The existing `NewSessionDialog` keeps its UX in this slice but now creates a session and starts a single thread bound to one worktree under the hood. The richer per-repo picker is PIL-51.
- ADR 0003 is preserved as historical record but marked superseded; its concurrency / shutdown design carries forward verbatim into the thread module.
