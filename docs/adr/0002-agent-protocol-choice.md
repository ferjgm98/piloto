# ADR 0002: Agent protocol choice — native CLIs over a universal ACP wrapper

- **Status:** Accepted
- **Date:** 2026-04-19
- **Ticket:** [PIL-21](https://linear.app/piloto/issue/PIL-21)

## Context

PIL-21 originally specced a single integration path for every agent: spawn a
third-party Agent Client Protocol (ACP) adapter (`claude-code-acp`, `codex acp`)
and drive them through the `@zed-industries/agent-client-protocol` SDK. That
shipped in a first pass. We then reverted in-branch for three reasons:

1. **Native experience.** Conductor (Melty Labs) and the Anthropic IDE
   extensions both drive the official `claude` binary directly through its
   `stream-json` interface. Doing the same unlocks features the ACP adapter
   doesn't currently expose (session resume, Claude-specific approval policies,
   MCP passthrough) and inherits upstream fixes without waiting for an adapter
   release.
2. **Auth delegation.** The ACP path forced Piloto to handle
   `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` directly. Spawning the native CLIs
   lets each vendor's own `login` flow own credentials — better UX, smaller
   attack surface for Piloto.
3. **Branding.** Anthropic's brand guidelines reserve "Claude Code" for the
   first-party product. Wrapping `claude-code-acp` under our own UI blurs that.

## Decision

- **Claude** — spawn the native `claude` binary with
  `-p --output-format stream-json --input-format stream-json --verbose --session-id <uuid>`.
- **Codex** — spawn `codex app-server` and drive the JSON-RPC 2.0 NDJSON
  protocol (`initialize` → `initialized` → `thread/start` → `turn/start`).
- **Other agents** (Cursor, Opencode, Cline, …) — adopt ACP when we integrate
  them, via `@zed-industries/agent-client-protocol`. It remains the fallback
  for vendors without a first-party stdio protocol.

Shared stdio plumbing (Bun.spawn, line-buffered NDJSON reader, graceful
shutdown, optional JSON-RPC correlation) lives in
`src/bun/modules/agent/backends/jsonrpc-stdio.ts` so each backend is a thin
protocol adapter.

## Consequences

- Piloto now depends on the user having the vendor CLIs installed and logged in.
  Documented in `README.md` Prerequisites.
- `@zed-industries/agent-client-protocol` is removed from `dependencies` for
  now. It will come back when the first non-Claude/Codex agent lands.
- Future PIL specs that assume ACP for Claude/Codex should be read against this
  ADR — the native path is the source of truth for those two backends.

## Alternatives considered

- **Pure ACP (original spec)** — rejected for the three reasons above.
- **Anthropic TypeScript agent SDK (`@anthropic-ai/claude-agent-sdk`)** —
  rejected because it takes an API key directly rather than delegating to the
  CLI's login, which defeats the auth-delegation goal.
