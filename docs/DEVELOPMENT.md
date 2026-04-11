# Piloto — development guide

How to set up the repo, add features, run the checks, and debug common
problems. For the architectural why, read `ARCHITECTURE.md`. For the
rules that everything in here depends on, read `../CLAUDE.md`.

## Setup

```bash
git clone <repo-url>
cd piloto
bun install           # installs deps and wires the pre-commit hook
cp .env.example .env  # optional; sets DATABASE_URL
```

Requirements:

- [Bun](https://bun.sh/) v1.0+
- macOS, Linux, or Windows
- Git

The `bun install` step runs `prepare`, which installs a pre-commit hook
that runs `bun run check` on every commit.

## Running the app

| Command | What it does |
|---|---|
| `bun run start` | One-shot: build webview + launch the native Electrobun window. |
| `bun run dev` | `start` with file watching — rebuilds on every change. |
| `bun run dev:hmr` | Vite dev server + native window with HMR. Best for webview iteration. |
| `bun run hmr` | Just Vite, served at http://localhost:5173. Plain-browser dev mode; RPC calls will error with `INTERNAL` because there's no main process. |

For any change that touches the RPC round trip, use `bun run dev` or
`bun run dev:hmr` so the main process is live.

## Running the checks

```bash
bun run check       # biome lint + strict tsc, read-only
bun run check:fix   # biome --write + strict tsc, auto-fixes format
```

`bun run check` is the single canonical gate. It runs in three places:

1. Locally when you invoke it explicitly before committing.
2. Automatically via the pre-commit Git hook.
3. In CI via `.github/workflows/ci.yml` on every push and PR.

If all three pass, the change is good to merge.

### Common failures

- **Biome format errors** → run `bun run check:fix`. Format is always
  auto-fixable.
- **`tsc` errors in files you didn't touch** → you probably changed a
  shared type. Run `bun run check` to see the full list and fix them in
  the same change.
- **"Cannot find module '@/...'"** → path alias not set up. Check
  `tsconfig.json` and `vite.config.ts` `resolve.alias`.

## Database migrations

```bash
bun run db:generate   # generate SQL from schema changes
bun run db:migrate    # apply migrations
```

`drizzle.config.ts` falls back to `./.context/piloto.db` when `DATABASE_URL`
isn't set.

## Walkthrough: add a new RPC method

We'll add `listWorkspaceRepos` as an example.

### 1. Scaffold the stub

```bash
bun run scaffold:rpc workspace listWorkspaceRepos query
```

This inserts:

- A schema entry in `shared/rpc.ts`:
  ```ts
  listWorkspaceRepos: {
    params: Record<string, never>;  // TODO: fill in
    response: unknown;              // TODO: fill in
  };
  ```
- A stub handler in `src/bun/modules/workspace/workspace.rpc.ts` that
  throws "not implemented".

### 2. Fill in the schema

Replace the placeholders with real types:

```ts
listWorkspaceRepos: {
  params: { workspaceId: string };
  response: { id: string; path: string; defaultBranch: string }[];
};
```

### 3. Implement the service

Add the function to `src/bun/modules/workspace/workspace.service.ts`:

```ts
import { NotFoundError } from "../../utils/errors";

export function listWorkspaceRepos(workspaceId: string) {
  const db = getDb();
  const workspace = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (!workspace) throw new NotFoundError("Workspace", workspaceId);
  return db.select().from(workspaceRepos).where(eq(workspaceRepos.workspaceId, workspaceId)).all();
}
```

Throw `AppError` subclasses for domain errors — the RPC middleware handles
serializing them across the IPC boundary.

### 4. Wire the handler

Replace the stub in `workspace.rpc.ts`:

```ts
import * as workspaceService from "./workspace.service";

export const workspaceHandlers = {
  requests: {
    // ... existing handlers
    listWorkspaceRepos: async ({ workspaceId }: { workspaceId: string }) =>
      workspaceService.listWorkspaceRepos(workspaceId),
  },
  messages: {},
};
```

### 5. Use it from a component

```tsx
import { useRPCQuery } from "@/hooks";

const { data: repos, error, loading } = useRPCQuery<
  { id: string; path: string; defaultBranch: string }[]
>("listWorkspaceRepos", { workspaceId: ws.id }, [ws.id]);
```

The third argument is the dependency array — pass values here that should
trigger a refetch when they change. Don't put `params` in there directly;
a fresh object literal would refetch on every render.

### 6. Test via the RPC Demo

The design-system page (`src/mainview/components/app.tsx`) has an
"RPC Demo" section. Temporarily add your new hook there to see it work
end-to-end, then remove it before committing.

### 7. Run the checks

```bash
bun run check
```

Commit.

## Walkthrough: add a new module

```bash
bun run scaffold:module skill
```

This creates `src/bun/modules/skill/` with three files (`skill.types.ts`,
`skill.service.ts`, `skill.rpc.ts`). Then:

1. Wire it into `src/bun/rpc.ts`:
   ```ts
   import { skillHandlers } from "./modules/skill/skill.rpc";

   requests: wrapHandlers({
     ...existingHandlers,
     ...skillHandlers.requests,
   }),
   ```
2. Use `scaffold:rpc` to add methods as needed.

## Debugging

### RPC logs

The middleware logs every request:

```
[2026-04-11T...] [DEBUG] [rpc] listWorkspaces completed in 3.2ms
[2026-04-11T...] [ERROR] [rpc] createWorkspace failed (VALIDATION) after 0.1ms: name is required
```

Watch the Bun stdout while running `bun run dev` to see RPC activity in
real time.

### Surfacing errors in the UI

The RPC hooks expose an `error` field that's an `RPCClientError` instance
with `code`, `message`, and optional `details`. Render it like:

```tsx
{error && (
  <div className="text-destructive">
    <span className="font-mono">{error.code}</span>: {error.message}
  </div>
)}
```

`error.code` is one of the `ErrorCode` values in `shared/errors.ts`.

### Testing the error path

To verify an error flows end-to-end without touching production code,
temporarily throw from a service function:

```ts
export function listWorkspaces() {
  throw new NotFoundError("Workspace", "test");
  // ... real code
}
```

Reload the app. The UI should show `NOT_FOUND: Workspace not found: test`
and the Bun log should show `failed (NOT_FOUND)`. Revert before committing.

## Common pitfalls

These are things that have bitten us before. All of them are guarded by
`CLAUDE.md` rules, but it helps to see the failure mode:

- **Throwing a plain object from a handler.** `throw { code: "X", message: "y" }`
  looks reasonable but Electrobun's handler drops non-`Error` throws.
  Always throw an `Error` subclass — ideally an `AppError` subclass from
  `src/bun/utils/errors.ts` so the middleware can map it to a wire code.
- **Mutating `rpc.handlers.messages[event]`.** Subscriptions must use
  `rpc.addMessageListener(event, handler)` and `removeMessageListener`.
  There is no handler-map to mutate. See `use-rpc-subscription.ts`.
- **Calling `electrobun.rpc.request` directly from a component.** Use the
  hooks — they handle loading, cleanup, and error reconstruction.
- **Putting `params` in a `useRPCQuery` dependency array.** Object
  literals change identity on every render, so you get an infinite
  refetch loop. Pass scalar values via the explicit `deps` argument
  instead.
- **Importing from `src/bun/` in the webview.** The webview is a separate
  bundle; those imports will fail at build time or pull in server code
  that tries to use Bun APIs in the browser. Move shared types to
  `shared/`.
- **Forgetting to add a handler to the aggregator.** `scaffold:rpc` adds
  the stub to the module's `.rpc.ts`, but you still need to have the
  module wired into `src/bun/rpc.ts`. `scaffold:module` reminds you of
  this at creation time.

## Testing

Placeholder — no test framework is set up yet. When we add one, this
section will document:

- How to run tests (`bun test` / `bun run test`)
- Where tests live (colocated vs `tests/`)
- How to test RPC handlers in isolation (direct middleware invocation,
  per the PIL-15 `bun -e` smoke pattern)
- How to test React hooks (probably `@testing-library/react`)

Until then, verification relies on `bun run check` + manual smoke-testing
via the RPC Demo section.
