# Piloto execution roadmap

Linear ticket IDs (`PIL-NN`) are no longer in execution order — the
session/thread restructure ([ADR 0004](./adr/0004-session-thread-model.md))
inserted PIL-47–PIL-53 ahead of older MVP tickets. This doc is the
human-readable map of what to build, and in what order.

Linear (team `PIL`) remains the source of truth for status, scope, and
description. This file only orders the tickets — it does not duplicate
their content.

> Last updated: 2026-05-02 — PIL-48 + PIL-49 landed as a single PR
> (schema + RPC reshape shipped together, no shim). Next up: PIL-50.

## Phase 0 — In flight (M2 foundation, must land first)

The session/thread restructure is the gate. Everything downstream assumes
the new schema (`sessions`, `threads`, `thread_repos`) and the per-thread
bin process model. Build slices in order; each slice is a shippable PR.

| Order | Ticket                                           | Slice                                                  | Depends on        | One-line scope                                                                                    |
| ----: | ------------------------------------------------ | ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------- |
|    1a | [PIL-50](https://linear.app/piloto/issue/PIL-50) | Multi-workspace sidebar tree                           | PIL-49 ✅         | `workspace-tree.tsx`; replaces left strip in `home.tsx`; localStorage-persisted expansion         |
|    1b | [PIL-51](https://linear.app/piloto/issue/PIL-51) | Inline empty thread + tab strip + grouped model picker | PIL-49 ✅, PIL-50 | Replaces `NewSessionDialog`; atomic create on first prompt; `↗ open in new tab` for cross-backend |
|     2 | [PIL-52](https://linear.app/piloto/issue/PIL-52) | Per-backend options                                    | PIL-51            | `reasoning_level` / `fast_mode` / `plan_mode` columns + footer toggles                            |
|     3 | [PIL-53](https://linear.app/piloto/issue/PIL-53) | Right rail                                             | PIL-51            | `thread-right-rail.tsx` — Files / Diff / Todos / Plan tabs; deprecates `WorktreeDashboard`        |

**1a and 1b can be parallelized** if two people are working — they touch
different surfaces. Solo, do PIL-50 first (smaller, lower risk).

## Phase 1 — MVP work unlocked after restructure

These were on the MVP roadmap before PIL-47 and have been rescoped to the
new model. They unblock once Phase 0 lands.

| Order | Ticket                                           | Depends on     | Notes                                                                                                                                                         |
| ----: | ------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     6 | [PIL-25](https://linear.app/piloto/issue/PIL-25) | PIL-49, PIL-53 | Per-thread diff RPC (`thread.getDiff(threadId)`); rendered as Diff tab in PIL-53. The Diff tab itself is shipped in PIL-53 — PIL-25 is the service-side work. |
|     7 | [PIL-26](https://linear.app/piloto/issue/PIL-26) | PIL-25, PIL-53 | Accept/reject — `mergeThreadWorktrees(threadId)` over `thread_repos`; surfaces in the slice-6 Diff tab.                                                       |
|     8 | [PIL-32](https://linear.app/piloto/issue/PIL-32) | PIL-49         | Merge service: `mergeThreadWorktrees(threadId)`. Stop thread bin before worktree removal. Same scope as PIL-26 from the service side; pair them.              |
|     9 | [PIL-24](https://linear.app/piloto/issue/PIL-24) | PIL-49, PIL-53 | Embedded terminal as a per-thread right-rail tab (keyed on `threadId`, not `worktreeId`).                                                                     |

**PIL-25 + PIL-26 + PIL-32 are essentially one feature** (per-thread diff
review and merge). One reasonable batching: do PIL-25 alongside PIL-53
(it's the data the Diff tab reads), then PIL-26+PIL-32 together as a single
"accept changes" PR.

## Phase 2 — Cross-cutting MVP

Independent of the restructure beyond the schema rename — they reference
`thread` / `session` instead of `agent_session`, but otherwise stand alone.
Order within this phase is flexible.

| Ticket                                           | Milestone        | Notes                                                      |
| ------------------------------------------------ | ---------------- | ---------------------------------------------------------- |
| [PIL-27](https://linear.app/piloto/issue/PIL-27) | M5 — MCP support | Config stays per-workspace; per-thread allowlist deferred. |
| [PIL-28](https://linear.app/piloto/issue/PIL-28) | M5 — Skills      | Apply at session (default) or thread (override).           |
| [PIL-29](https://linear.app/piloto/issue/PIL-29) | M6 — Telemetry   | —                                                          |
| [PIL-30](https://linear.app/piloto/issue/PIL-30) | M6 — Settings    | —                                                          |

## Done

- [PIL-48](https://linear.app/piloto/issue/PIL-48) + [PIL-49](https://linear.app/piloto/issue/PIL-49) — Session/thread schema + per-thread bin lifecycle ([ADR 0004](./adr/0004-session-thread-model.md)). Shipped as a single PR (no shim layer; pre-prod, no users).
- [PIL-46](https://linear.app/piloto/issue/PIL-46) — File-system watcher (ADR 0001)
- [PIL-31](https://linear.app/piloto/issue/PIL-31) — (see Linear)
- [PIL-21](https://linear.app/piloto/issue/PIL-21) — Native CLI protocol pivot (ADR 0002)
- [PIL-22](https://linear.app/piloto/issue/PIL-22) — Codex backend integration tests

## Cancelled (do not work on)

These were children of PIL-23 (parallel agent execution under the old
single-`agent_session` model). The restructure made them obsolete.
Each links to its superseding ticket in Linear.

| Ticket                                           | Superseded by  | Reason                                                                               |
| ------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------ |
| [PIL-42](https://linear.app/piloto/issue/PIL-42) | PIL-48         | Atomic create in the new schema replaces the workspace-wide concurrency cap.         |
| [PIL-43](https://linear.app/piloto/issue/PIL-43) | PIL-49         | Bulk teardown folded into per-thread bin lifecycle.                                  |
| [PIL-44](https://linear.app/piloto/issue/PIL-44) | PIL-51         | Single-session view replaced by the tab strip + inline empty thread.                 |
| [PIL-45](https://linear.app/piloto/issue/PIL-45) | PIL-50, PIL-51 | Multi-session sidebar split into the workspace tree (PIL-50) and tab strip (PIL-51). |

[ADR 0003](./adr/0003-parallel-agent-orchestration.md) is the historical
record of the design that drove these four. It is marked **Superseded**
and kept for context.

## Post-MVP backlog

Tickets PIL-33 through PIL-41 are post-MVP. They have not been ordered
here — pick from Linear when MVP closes.

## Maintaining this doc

Update this file whenever:

- A ticket lands and moves between phases (move it under "Done").
- A new ticket is created that affects ordering (insert it; cite its
  dependencies).
- A ticket is cancelled (move to "Cancelled" with the superseder).

Do **not** mirror Linear field-by-field here. Status/labels/assignees stay
in Linear; this doc is just the dependency-aware execution order.
