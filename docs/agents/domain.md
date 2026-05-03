# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a **single-context** repo. All domain context and architectural decisions live at the repo root:

```
/
├── CONTEXT.md           ← does not exist yet; create lazily
├── docs/
│   ├── ARCHITECTURE.md  ← rationale for the layered design
│   ├── DEVELOPMENT.md   ← narrative walkthrough for adding features
│   └── adr/
│       ├── 0001-file-system-watcher.md
│       └── 0002-agent-protocol-choice.md
└── src/
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (if present) — domain glossary.
- **`CLAUDE.md`** — authoritative project rules and conventions.
- **`docs/ARCHITECTURE.md`** — why the bun / webview / shared layering exists.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If `CONTEXT.md` doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The producer skill (`/grill-with-docs`) creates it lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (agent protocol choice) — but worth reopening because…_

## Notion specs

In addition to in-repo docs, project-level work has spec pages in Notion linked from Linear epics. When a task references a Linear issue, check for a linked Notion spec via the Notion MCP and read it before exploring code. See `docs/agents/issue-tracker.md` for the spec-linking convention.
