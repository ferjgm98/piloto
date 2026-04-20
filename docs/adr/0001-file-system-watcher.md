# ADR 0001: File system watcher library

- **Status:** Accepted (interim)
- **Date:** 2026-04-19
- **Ticket:** [PIL-20](https://linear.app/piloto/issue/PIL-20)
- **Spec:** [Notion — PIL-20](https://www.notion.so/33f6d0f7f95a81a7ae8ce97805a03e64)

## Context

PIL-20's spec recommends `@parcel/watcher` with Bun's `node:fs.watch` listed as
the explicit alternative. `@parcel/watcher` is also an ask-first addition to
`package.json` under `CLAUDE.md`. We initially shipped `@parcel/watcher`. The
packaged Electrobun app crashed at startup:

```
Uncaught exception in worker:
  binding = (()=>{throw new Error("Cannot require module "+"./build/Release/watcher.node");})();
error: Cannot require module ./build/Release/watcher.node
```

`@parcel/watcher` loads a native `.node` addon. Electrobun bundles the Bun
entrypoint into a single JS file with Bun's bundler, packs it into an ASAR
archive, and at runtime writes the JS to a temp path before `bun` exec's it.
Bun's bundler statically evaluated the fallback `require('./build/Release/watcher.node')`
inside `@parcel/watcher/index.js` and replaced it with a hardcoded
error-thrower — so the failure is baked into the bundle, not a runtime
resolution problem asar-unpacking can fix.

Mitigations attempted, in order:

1. `external: ["@parcel/watcher"]` in `electrobun.config.ts` — bundle size
   unchanged (~11.7 MB), suggesting Electrobun's bun config didn't pass the
   external list through, or Bun resolved `@parcel/watcher` anyway.
2. `copy:` entries shipping `node_modules/@parcel/watcher*` + `detect-libc` +
   `node-addon-api` into Resources — no effect (still bundled into asar, still
   crashes).
3. `asarUnpack: ["**/*.node", "**/node_modules/@parcel/watcher*/**"]` — the
   unpack directory wasn't created, same crash.

The core problem is that Electrobun's current bundling pipeline does not play
cleanly with native Node addons, and the error-thrower replacement happens at
bundle time, not at runtime, so post-hoc `.node` placement doesn't help.

## Decision

Use Bun's `node:fs.watch(path, { recursive: true })` as the interim file
system watcher. Keep all other PIL-20 behaviour identical (100 ms debounce,
`WorktreeAlreadyHasWatcherError` on duplicate, path-based ignore via
`shouldIgnoreFileEvent` covering `.git/`, `node_modules/`, `build/`, `dist/`,
`.DS_Store`).

## Consequences

### Accepted

- ✅ The packaged Electrobun app launches.
- ✅ No native dependency, no platform prebuild matrix, no asar unpack config.
- ✅ Spec-compliant — `fs.watch` is explicitly listed as the approved alternative.
- ✅ Functionally equivalent on macOS (primary dev target) for the scope of
  PIL-20 (few dozen worktrees, ignore set dominated by `.git/` and
  `node_modules/`).

### Trade-offs

- ⚠️ `recursive: true` is non-recursive at the OS level on Linux. Acceptable
  while Piloto targets macOS; revisit before Linux support.
- ⚠️ No native ignore-glob support — the kernel still delivers events from
  `node_modules/` and `.git/`, and we filter them in JS via
  `shouldIgnoreFileEvent`. For worktrees with very large `node_modules/`, this
  is measurably worse than `@parcel/watcher`'s native ignore. Mitigated by the
  100 ms debounce: the extra wakeups collapse into a single status
  recomputation.
- ⚠️ Bun's `recursive` watch has had edge cases historically (atomic writes,
  rename on macOS). Monitored via the existing watcher-ignore test suite.

### Ask-first reversal

Per `CLAUDE.md`'s ask-first list, removing a runtime dependency normally
requires discussion. This ADR *is* the discussion record — the removal is
tied to a concrete, reproducible blocker (app won't launch) rather than a
preference change.

## Reversal path (follow-up ticket)

A follow-up ticket will investigate making `@parcel/watcher` work in
Electrobun, likely by one of:

1. Disabling `useAsar` and shipping node_modules alongside the bundle.
2. Loading `@parcel/watcher` via `createRequire` against an absolute path
   derived from `process.execPath` so Bun's bundler can't statically evaluate
   the `require`.
3. Upstream patch to Electrobun's bundler-config passthrough so `external:`
   actually reaches `Bun.build`.

Until then the spec points to this ADR for the watcher choice.

## Revisit triggers

- Linux support added to Piloto
- Worktree count grows past ~50 (JS-side filter cost becomes non-trivial)
- Electrobun or Bun ships a fix that makes native modules trivial to bundle
- `fs.watch` drops events in practice on any supported platform
