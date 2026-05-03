# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in Linear (team `PIL`).

| Canonical role    | Linear label      | Meaning                                  |
| ----------------- | ----------------- | ---------------------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human` | Requires human implementation            |
| `wontfix`         | `wontfix`         | Will not be actioned                     |

## Lazy creation

These labels do **not** exist in Linear yet. The `triage` skill should create any missing label on first use via the Linear MCP (`mcp__plugin_linear_linear__create_issue_label`) on team `PIL`, then apply it. Subsequent uses reuse the existing label.

This is separate from the existing type labels in `PIL` (`Epic`, `Bug`, `Feature`, `Improvement`) — both vocabularies coexist and an issue may carry one of each.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from the table.
