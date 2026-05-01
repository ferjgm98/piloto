# Issue Tracker

Issues for this repo live in **Linear**, team **Piloto** (key `PIL`).

## Workflow

- **Tool**: use the Linear MCP (`mcp__plugin_linear_linear__*`) for all create / list / update / comment operations. Do not shell out to a Linear CLI.
- **Team**: every issue belongs to team `PIL`.
- **Projects**: two known projects exist:
  - `Piloto MVP` — the in-flight MVP (status was marked Completed in Linear on 2026-04-20, but work may still be open against it; confirm with the user)
  - `Piloto Post-MVP` — deferred features beyond the MVP (worktree hooks, build cache sharing, external interop, etc.)
- **Default project**: skills should **ask the user which project** when creating a new issue rather than defaulting. List the two projects above as the choices.

## Spec linking convention

Each major effort has a spec page in Notion that's linked to its top-level Linear issue (typically the Epic).

- **Epic / project-level issues**: must link a Notion spec page in the issue description. If the user doesn't provide one, ask before creating the issue.
- **Sub-issues under an Epic**: inherit the parent's spec link. Do not require a separate Notion page; reference the parent epic in the description.
- **Standalone issues** (not part of an Epic): a Notion spec is optional but encouraged for anything larger than a small fix.

Use the Notion MCP (`mcp__plugin_Notion_notion__notion-*`) to fetch or create spec pages when needed.

## Conventions

- **Branch / commit / PR references**: commit messages use the `PIL-NN` issue key prefix (e.g. `feat(agent): PIL-22 ...`). When opening a PR for an issue, include `PIL-NN` in the PR title or body so Linear auto-links it.
- **Existing labels in PIL**: `Epic`, `Bug`, `Feature`, `Improvement`. Apply the appropriate type label on creation.
- **Triage labels**: see `docs/agents/triage-labels.md`. The triage vocabulary is separate from the type labels above and may be created lazily on first use.

## Skills that read this file

`to-issues`, `triage`, `to-prd`, `qa`, and any skill that creates or updates issues.
