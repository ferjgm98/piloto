# Piloto — development guide

This file is the authoritative source of rules and conventions for Piloto.
Claude Code loads it automatically on every session; humans read it as the
project's constitution. Keep it concise — if it grows past ~300 lines it
stops being load-bearing.

For architectural rationale see `docs/ARCHITECTURE.md`. For a narrative
"how to add a feature" walkthrough see `docs/DEVELOPMENT.md`.

## What Piloto is

An agentic development environment that makes multi-folder, multi-repo
projects first-class. It orchestrates parallel AI agents across Git
worktrees with an embedded terminal and diff viewer. See `README.md` for
the product description.

## Architecture at a glance

```
Electrobun runtime (native window + system WebView)
├── Bun main process      (src/bun/)       services, DB, agents, worktrees
│    ↕  Typed RPC         (shared/rpc.ts)  request/response + messages
└── WebView (React)       (src/mainview/)  UI, hooks, design system
```

The main process owns all side effects (filesystem, git, child processes,
SQLite, MCP clients). The webview is a pure view layer that talks to the
main process exclusively through the typed RPC contract.

## Directory rules

- `src/bun/modules/<feature>/` — every feature folder has exactly three
  source files (tests don't count against the three):
  - `<feature>.types.ts` — domain types. No imports from other modules.
  - `<feature>.service.ts` — pure business logic. Throws `AppError` subclasses.
  - `<feature>.rpc.ts` — exports `const <feature>Handlers = { requests, messages }`.
  - `<feature>.test.ts` — colocated unit tests (optional, zero or more).
- `src/bun/utils/` — shared utilities (`logger.ts`, `errors.ts`, `rpc-middleware.ts`, `git.ts`).
- `src/bun/db/` — database setup and Drizzle schema.
- `src/mainview/components/` — React components. shadcn/ui primitives live under `ui/`.
- `src/mainview/hooks/` — custom React hooks. The RPC hooks live here.
- `src/mainview/lib/` — webview-side libraries (`electrobun.ts`, `rpc-client.ts`, `utils.ts`).
- `shared/` — types and contracts used by both sides. No runtime code with
  side effects; `shared/` files must be importable from either runtime.

## RPC contract (non-negotiable)

1. Every method is declared in `shared/rpc.ts` first. The schema is the
   source of truth — both sides are type-checked against it.
2. Handlers throw `AppError` subclasses (`NotFoundError`, `ValidationError`,
   `GitError`). Do **not** catch-and-serialize errors manually.
3. `wrapHandlers()` in `src/bun/rpc.ts` applies logging, timing, and error
   serialization to every request handler. It is already wired — do not
   bypass it or reinvent middleware ad-hoc.
4. Errors cross the IPC boundary via the `RPC_ERROR_PREFIX` marker in
   `shared/errors.ts`. Electrobun's wire only transports `error.message` as
   a string, so structured errors are JSON-encoded into it by the middleware
   and decoded on the webview by `rpc-client.ts`. Do not invent a second
   mechanism.
5. Frontend components call RPC through `useRPCQuery`, `useRPCMutation`, or
   `useRPCSubscription`. Never call `electrobun.rpc.request[...]` directly.
6. `messages` handlers (fire-and-forget push events) are intentionally NOT
   wrapped by `wrapHandlers` — there is no request id to correlate an error
   with, so throwing from a message handler would disappear silently. Keep
   them simple and side-effect-free.

## Error hierarchy

`src/bun/utils/errors.ts` owns `AppError` and its subclasses. When you need
a new error type:

1. Add the subclass in `src/bun/utils/errors.ts`.
2. Add the wire code in `shared/errors.ts` under `ErrorCode`.
3. Add the mapping in `src/bun/utils/rpc-middleware.ts:mapErrorCode`.

Never throw error subclasses from inline files or define a second error
hierarchy.

## Imports and aliases

- `@/*` → `src/mainview/*` (webview only).
- `shared/*` → `shared/*` (both sides).
- `src/bun/` code imports its siblings via relative paths.
- Webview code never imports from `src/bun/`. If you need a type in both
  places, move it to `shared/`.
- Cross-module imports inside `src/bun/` go through the service layer, not
  the rpc layer. A module's `.rpc.ts` should only import its own service.

## Logging

Use `createLogger("<module>")` from `src/bun/utils/logger.ts`. The module
name is baked in at creation; log methods take a single string:

```ts
const log = createLogger("workspace");
log.info("created workspace " + id);
log.error("failed to list: " + err.message);
```

Available levels: `debug`, `info`, `warn`, `error`.

## Naming

- Files: kebab-case (`rpc-client.ts`, `use-rpc-query.ts`).
- Types, interfaces, classes: `PascalCase`.
- Functions, variables: `camelCase`.
- Module files use the suffix pattern: `<name>.types.ts`, `<name>.service.ts`,
  `<name>.rpc.ts`.
- React component files: kebab-case (`rpc-demo.tsx`). Exported component
  symbol is PascalCase.

## React hooks

- Custom hooks live in `src/mainview/hooks/` and are exported from
  `src/mainview/hooks/index.ts` (barrel).
- Hook files are named `use-*.ts`.
- When subscribing to external state (RPC, event listeners), store the
  callback in a ref so inline closures don't re-subscribe on every render.
  See `use-rpc-subscription.ts` for the pattern.

## Testing

Placeholder — no test framework is set up yet. When one lands (see
`docs/DEVELOPMENT.md`), this section will document the command and layout.

## Verification before completing work

Always run `bun run check` before committing. It runs Biome lint + strict
`tsc --noEmit`. The pre-commit hook runs it automatically on every commit.
Exit code 0 means you're good to commit.

If you made changes that are observable in the webview, also smoke-test them
in `bun run dev` (native Electrobun window) or `bun run dev:hmr` (Vite +
native window with HMR). For webview-only changes, plain `bun run hmr` with
a browser works because `src/mainview/lib/electrobun.ts` feature-detects the
native globals.

## Scaffolding

Use these instead of hand-creating files — they enforce the module layout:

```
bun run scaffold:module <kebab-name>
bun run scaffold:rpc <module> <methodName> [query|mutation|message]
```

`scaffold:rpc` defaults to `query`. Both scripts print the manual follow-up
steps (wiring into `src/bun/rpc.ts`, filling in service logic).

## Ask-first list

These changes need discussion before you commit them. They have wide blast
radius or reverse prior decisions.

- Adding a state-management library (Zustand, Redux, React Query, TanStack Query).
- New cross-cutting middleware on the Bun side (beyond `wrapHandlers`).
- Changes to `src/mainview/lib/electrobun.ts` or the Electrobun runtime integration.
- Renaming or removing existing methods in `shared/rpc.ts` (breaking for pending branches).
- Touching `biome.json`, `tsconfig.json`, or this file.
- Adding new runtime dependencies to `package.json`.
- Introducing a new testing framework.

## Further reading

- `docs/ARCHITECTURE.md` — why the layers are the way they are.
- `docs/DEVELOPMENT.md` — setup, narrative walkthrough for adding a feature, debugging tips, common pitfalls.
- `README.md` — product description and tech stack summary.

## Agent skills

### Issue tracker

Issues live in Linear, team `PIL` (Piloto). Skills use the Linear MCP for create/list/update; Notion specs are linked from Epic-level issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) created lazily in Linear on first use. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` (lazy) and `docs/adr/` at the root. See `docs/agents/domain.md`.
