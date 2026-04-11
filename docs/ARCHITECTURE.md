# Piloto — architecture

This document explains *why* Piloto is built the way it is. For rules and
conventions see `../CLAUDE.md`. For a step-by-step guide to adding features
see `DEVELOPMENT.md`.

## Why Electrobun (not Electron)

Piloto uses [Electrobun](https://electrobun.dev/) as its desktop runtime.
The key trade-off was being able to embed `libghostty` — the Ghostty
terminal emulator — through a direct Zig↔Zig FFI instead of writing a C
bridge. Electrobun's main process runs on Bun and its native layer is Zig,
which makes that integration natural.

Secondary benefits:

- **Bundle size.** ~14 MB vs ~200 MB for an equivalent Electron app.
- **Startup time.** Under 50 ms to first window.
- **System WebView** instead of bundling Chromium. Smaller, less memory.

The cost is a smaller ecosystem and younger tooling. We accept that in
exchange for the native integration surface.

## Process model

```
┌───────────────────────────────────────────────────────────────┐
│  Native window (Electrobun)                                   │
│                                                               │
│  ┌─────────────────────┐         ┌─────────────────────────┐  │
│  │  Bun main process   │◀───────▶│  System WebView         │  │
│  │  src/bun/           │  Typed  │  src/mainview/          │  │
│  │                     │  RPC    │                         │  │
│  │  • services         │         │  • React 19             │  │
│  │  • Drizzle + SQLite │         │  • Tailwind 4           │  │
│  │  • git worktrees    │         │  • shadcn/ui            │  │
│  │  • agent orchestr.  │         │  • Monaco (planned)     │  │
│  │  • MCP clients      │         │                         │  │
│  └─────────────────────┘         └─────────────────────────┘  │
│            │                                                  │
│            ▼                                                  │
│    Zig native layer                                           │
│    (libghostty, FFI)                                          │
└───────────────────────────────────────────────────────────────┘
```

Exactly one process boundary exists inside the app: main ↔ webview. All
communication crosses it through `shared/rpc.ts`.

## Layer boundaries and rationale

### `src/bun/` — main process

Everything with a side effect lives here: filesystem access, git commands,
child processes, database, MCP servers, agent stdio. The main process is
the trust boundary — user input from the webview is validated here before
touching any of those systems.

Organized as feature **modules** under `src/bun/modules/<feature>/`. Each
module has a fixed three-file shape:

- `.types.ts` — domain model, pure types
- `.service.ts` — business logic; the layer that other modules can depend on
- `.rpc.ts` — thin handlers that unwrap RPC params and delegate to the service

The separation exists so that cross-module imports always go through
`.service.ts`. If module A ever depends on module B, A imports from
`B.service.ts`, never from `B.rpc.ts`. This keeps the RPC layer from
becoming an implicit service registry.

### `src/mainview/` — webview

Pure UI. React, Tailwind, shadcn/ui, Monaco (planned), and the hook layer
built on top of the RPC client. No side effects beyond DOM and RPC calls.

The webview can be developed in two modes:

- **`bun run dev`** / **`bun run dev:hmr`** — launches the native
  Electrobun window. This is the production runtime and the only place
  real RPC calls succeed.
- **`bun run hmr`** alone — plain Vite dev server. Useful for browser-only
  UI iteration. RPC calls surface as `RPCClientError(INTERNAL)` because
  the transport is absent; the hooks' error paths render normally.

The second mode works because `src/mainview/lib/electrobun.ts` feature-detects
Electrobun's preload globals (`window.__electrobunWebviewId`,
`window.__electrobunRpcSocketPort`) and skips `Electroview` construction
when they're absent.

### `shared/` — contracts

Types and small pure helpers shared between the two processes. The rule is:
anything in `shared/` must be importable from both runtimes without side
effects. No I/O, no module-load work, no dependencies on Bun or DOM APIs.

`shared/rpc.ts` — the typed RPC schema. Adding a new method starts here.
`shared/errors.ts` — the wire error contract and the `RPC_ERROR_PREFIX`
marker used to carry structured errors through Electrobun's string-only
error channel.

## Cross-process communication (Typed RPC)

Piloto uses Electrobun's built-in Typed RPC layer with a project-specific
middleware on top. The flow for a request:

```
React component
  └─ useRPCQuery("listWorkspaces")
     └─ rpcRequest()                              src/mainview/lib/rpc-client.ts
        └─ electrobun.rpc.request.listWorkspaces()
           ─── IPC (websocket, AES-GCM) ──▶
                                               wrapped handler               src/bun/rpc.ts
                                                └─ workspaceHandlers.listWorkspaces
                                                   └─ workspaceService.listAll()   src/bun/modules/workspace/workspace.service.ts
                                                      └─ db.select()...
```

Why we added middleware (PIL-15):

- **Observability.** Every request is logged with timing (`[rpc] DEBUG
  listWorkspaces completed in 3.2ms`). One place to add tracing, rate
  limiting, or metrics later.
- **Structured errors.** Electrobun's wire protocol only transports
  `error.message` as a string. To preserve error codes we JSON-encode an
  `RPCError` shape into `Error.message` behind the `__RPC_ERROR__:` marker
  prefix, catch it on the webview, and reconstruct it as `RPCClientError`.
  The middleware is the single place that serializes; the client is the
  single place that deserializes.
- **AppError mapping.** Service code throws domain errors (`NotFoundError`,
  `ValidationError`, `GitError`) without worrying about wire format. The
  middleware maps them to `ErrorCode` values before sending.

Two bugs from the original PIL-15 spec, preserved here as cautionary tales:

- **Throwing a plain object**. `throw { code, message, details }` looks
  reasonable but Electrobun's handler drops non-`Error` throws entirely.
  Always throw a real `Error`.
- **Mutating `rpc.handlers.messages[event]`.** Subscriptions go through
  `rpc.addMessageListener(event, handler)` and
  `rpc.removeMessageListener(event, handler)`. There is no handler map
  to mutate.

## Data model

SQLite via [Drizzle ORM](https://orm.drizzle.team/). Database file defaults
to `./.context/piloto.db`; override with `DATABASE_URL`.

Core entities:

- **Workspace** — a named group of repository paths.
- **WorkspaceRepo** — join table: repo path + default branch.
- **AgentSession** — a running agent instance (Claude Code or Codex CLI).

Worktrees are computed on demand by reading the filesystem; they are not
stored in the database. This keeps the DB as the source of truth only for
things it owns exclusively.

## Zig native layer

Currently just Electrobun's bundled runtime. The planned next step is
embedding `libghostty` for an in-app terminal, accessed via Zig FFI without
a C shim. This is the primary reason Electrobun was chosen over Electron.

## Known constraints

- **`electrobun.ts` feature-detects native globals.** Plain browser dev
  works but RPC calls surface as `RPCClientError(INTERNAL)`. Full smoke
  tests of the success path require running `bun run dev` (native window).
- **No test framework is set up yet.** `docs/DEVELOPMENT.md` notes this as
  a placeholder. Picking a framework (Bun's built-in runner vs vitest) is
  an upcoming decision.
- **`.claude/` is gitignored.** Team-shared dev-guide artifacts live at
  the repo root (`CLAUDE.md`, `docs/`) or in tracked scripts. Anything
  under `.claude/` is personal per developer.

## Historical decision records

Plan files for completed features that captured design decisions:

- **PIL-15** (frontend IPC layer + middleware): the original plan file
  documents why we use a marker-prefix wire contract and why subscriptions
  use `addMessageListener` instead of handler-map mutation.
