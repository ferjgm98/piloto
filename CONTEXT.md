# Piloto — domain glossary

This is the project's shared vocabulary. When you talk about Piloto in
issues, commits, code, tests, or chat — use these terms exactly. Synonyms
listed under "avoid" exist in the wider ecosystem but are not how Piloto
talks about itself.

`docs/agents/domain.md` explains the read order and how the engineering
skills consume this file. `CLAUDE.md` is the rules; this file is the
language.

## How to read this file

Definitions are short on purpose. When a concept needs more depth, a
**See:** line points at the source of truth (architecture doc, ADR, or
file). Read the source when the term first matters; don't paraphrase from
this glossary.

If a concept you need isn't here, that's a signal:

- you might be inventing language the project doesn't use → reconsider, or
- there's a real gap → propose adding it via `/grill-with-docs`.

---

## Core architecture

**Main process** — the Bun-runtime side of Piloto, in `src/bun/`. Owns
every side effect: filesystem, git, child processes, SQLite, agent stdio.
The trust boundary; user input from the webview is validated here before
touching anything.

**Webview** — the System WebView side, in `src/mainview/`. React 19, pure
view layer. No side effects beyond DOM and RPC calls.

**Module** — a feature folder under `src/bun/modules/<name>/`. Always
exactly three source files: `<name>.types.ts`, `<name>.service.ts`,
`<name>.rpc.ts` (tests don't count). See `CLAUDE.md`.

**Service layer** — `<module>.service.ts`. The public face of a module;
other modules import here, never from `.rpc.ts`. Throws `AppError`
subclasses; doesn't know about wire format.

**Typed RPC** — Electrobun's built-in type-safe IPC layer. Schema lives in
`shared/rpc.ts`. The frontend never calls `electrobun.rpc.request[...]`
directly — always via `useRPCQuery` / `useRPCMutation` /
`useRPCSubscription`. **Avoid:** "tRPC" (different library), "IPC bridge".

**wrapHandlers** — middleware in `src/bun/rpc.ts` that wraps every request
handler with logging, timing, and `AppError` → wire-error serialization.
Already wired; do not bypass. **Avoid** inventing parallel middleware.

**AppError** — base class in `src/bun/utils/errors.ts`. Subclasses:
`NotFoundError`, `ValidationError`, `GitError`. Adding a new error type
requires three edits — see `CLAUDE.md` "Error hierarchy". **Avoid:**
throwing plain objects, throwing strings, ad-hoc `Error` subclasses.

**RPC_ERROR_PREFIX** — the wire marker (`__RPC_ERROR__:`) used to carry
structured errors through Electrobun's string-only error channel. JSON
encoded by the middleware, decoded by `rpc-client.ts`. See
`shared/errors.ts`.

---

## Workspace and worktree concepts

**Workspace** — a named group of repository paths that logically belong
together (e.g. `api/`, `web/`, `shared/`). The unit Piloto is built around;
not a folder, not a Git repo. Persisted in SQLite.

**Workspace repo** — a single repository path within a workspace. Carries
its own default branch and ordering. Schema: `workspace_repos` table.
**Avoid:** "project" (overloaded with the Linear meaning).

**Worktree** — a Git worktree (`git worktree add`) on a feature branch.
Computed on demand by reading the filesystem; not stored as the source of
truth. **Avoid:** conflating with "active worktree".

**Active worktree** — a tracked worktree row in the `active_worktrees`
table. The DB tracks these because they need cross-repo coordination and
status; thread bindings live in `thread_repos`. Raw worktrees on disk
that nothing tracks are not "active".

**Feature** (or **feature name**) — string identifying a cross-repo
task; multiple worktrees across repos share one feature name when they're
part of the same change. Used to group worktrees in
`createWorktreesForFeature`. **Avoid:** "branch group", "task name".

**Worktree status** — the computed snapshot of a worktree:
`changedFiles`, `ahead`, `behind`, `branchName`, `lastFetch`, `hasChanges`.
Type lives in `shared/rpc.ts:WorktreeStatus`. Pushed live via the
**Status watcher** (PIL-20).

**Status watcher** — deep module that owns `node:fs.watch`, debounce, and
the ignore predicate behind a small interface (`startWatching`,
`stopWatching`, `subscribe`, `notify`, `shutdown`). Lives at
`src/bun/modules/worktree/status-watcher/`. Sole emitter of live
`Worktree status` updates; rationale + tradeoffs in ADR 0001.

**Pre-remove check** — refusal to remove a worktree when it is bound to a
running thread (`isWorktreeBoundToActiveThread`) or has uncommitted
changes. Inspired by worktrunk; in `worktree.service.ts`.

**Port hashing** — deterministic port assignment per worktree branch so
parallel dev servers don't collide. Worktrunk pattern, ported into
TypeScript per the Architecture doc.

---

## Sessions, threads, agents

**Session** — a named grouping of threads within a workspace. Pure
container with `id`, `workspaceId`, `name`. Persisted in `sessions`. Owns
no agent state; deleting a session cascades to its threads (and stops any
that are running). See ADR 0004.

**Thread** — one running (or historical) agent process, persisted in
`threads`. Holds the per-conversation state: `backend`, `model`, `prompt`,
`status: 'idle' | 'running' | 'stopped' | 'error'`, plus the per-thread
overrides (`reasoningLevel`, `fastMode`, `planMode`). Backend is frozen
after the first prompt; the model variant within that backend is
hot-swappable. Replaces the old `agent_sessions` concept.

**Thread repo binding** — a `thread_repos` row pinning a `(threadId,
repoId, worktreeId)` triple with an `alias`. The alias is the
single-segment subdirectory under `~/.piloto/threads/<threadId>/` where the
worktree is symlinked. Per-worktree active-thread uniqueness is enforced
at the service layer (`findRunningThreadForWorktree` +
`isWorktreeBoundToActiveThread`), not by a unique index — bindings persist
for stopped threads as history.

**Thread session dir** — the per-thread working directory at
`~/.piloto/threads/<threadId>/`. The bin process runs with this as its
cwd; each binding is a symlink `<alias>/` → worktree path. Submodule:
`src/bun/modules/thread/thread-session-dir/`.

**Agent backend** — the implementation behind a thread. Two ship today:
`claude` (via `stream-json`) and `codex` (via `app-server`). Files:
`src/bun/modules/thread/backends/<name>.backend.ts`. Implement the
`ThreadBackend` interface in `thread.types.ts`.

**Native protocol** — the per-vendor stdio contract Piloto drives directly:
`claude -p --output-format stream-json` for Claude, `codex app-server`
JSON-RPC 2.0 (NDJSON over stdio) for Codex. **Not** ACP — see ADR 0002.

**ACP (Agent Client Protocol)** — Zed's universal agent protocol
(`@zed-industries/agent-client-protocol`). **Reserved for future
third-party agents** (Cursor, Opencode, Cline). Not used for Claude or
Codex. **Avoid** describing the existing backends as "ACP-based" — that
was the pre-2026-04-19 plan and the codebase has been pivoted off it. See
ADR 0002.

**Registry** — the in-memory `Map<threadId, RegistryEntry>` in
`thread.service.ts`. Single source of truth for "is thread X currently
running in this process". Capped at `MAX_CONCURRENT_THREADS = 5`. Pre-
reserved before the DB transaction; rolled back on insert failure.

**AgentUpdateDTO** — the wire format for streamed agent output, in
`shared/rpc.ts`. Discriminated union of `message`, `thought`, `tool_call`,
`tool_call_update`, `plan`. Pushed via the `threadOutput` channel.

**threadOutput** / **threadStatusChange** — the two push-message channels
for thread events. `threadStatusChange` carries `workspaceId` and
`sessionId` so subscribers can scope-filter without an extra round-trip.

**JSON-RPC stdio** — the generic transport implementation in
`src/bun/modules/thread/backends/jsonrpc-stdio.ts` shared by Codex's
`app-server` integration.

---

## Release vocabulary

**Trusted alpha** / **R1** — the first installable release tier.
macOS-only, small invited group, one supported backend (Claude). The
release strategy doc is the source of truth on what counts as in-scope for
R1; embedded terminal, in-app diff, MCP, and skills are explicitly **not**
R1.

**Release ladder** — R0 (Dev Preview, founder-only canary) → R1 (Trusted
Alpha) → R2 (Public Alpha) → R3 (Beta). See `docs/RELEASE_STRATEGY.md`.

**Build canary** — `bun run build:canary`, the continuous internal build
target. The default release validation target.

**Build stable** — `bun run build:stable`, reserved for later public
releases; not the default for the first external milestone.

---

## Issue tracker vocabulary

**PIL** — the Linear team key. Every issue is `PIL-NN`.

**Spec link** — every Epic-level Linear issue links to a Notion spec page
in its description. Sub-issues inherit the parent's spec link rather than
having their own. See `docs/agents/issue-tracker.md`.

**Triage label** — one of the five canonical roles applied to issues:
`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`. Separate vocabulary from the **type labels** (`Epic`, `Bug`,
`Feature`, `Improvement`); an issue can carry one of each. See
`docs/agents/triage-labels.md`.

**Vertical slice** — an issue scoped so that landing it ships a small but
end-to-end useful change. The `/to-issues` skill cuts on this boundary.
**Avoid:** "phase 1 of N" issues that have no value alone.

---

## Pivots worth knowing

**ACP pivot (2026-04-19)** — abandoned the universal-ACP plan for Claude
and Codex; both now use native vendor protocols. The interface name
`AgentBackend` survives from the original design. ADR 0002.

**Watcher pivot** — moved from `@parcel/watcher` to `node:fs.watch` because
Parcel's native dependency doesn't survive Electrobun's bundler. ADR 0001
documents the trade-offs and the revisit triggers.

**Electrobun over Electron** — original plan was Electron + NestJS + tRPC;
pivoted to Electrobun + Bun + Typed RPC for the Zig FFI path to
libghostty. **Avoid** any Electron / NestJS / tRPC vocabulary in new code,
issues, or docs.
