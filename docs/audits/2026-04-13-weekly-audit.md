# Weekly Project Health Audit — 2026-04-13

**Scope:** Piloto MVP (Linear project "Piloto MVP", team PIL)
**Data sources:** Linear MCP, codebase at `piloto/`, design docs

---

## 1. Linear Status vs Codebase Reality

### Done issues — spot-check results

| Issue | Title | Verdict |
|-------|-------|---------|
| PIL-12 | Initialize project from electrobun-starter | OK — `electrobun.config.ts` present |
| PIL-13 | Set up Electrobun desktop shell with React + TS | OK — webview scaffold, `app.tsx`, `home.tsx` |
| PIL-14 | Scaffold Bun main process with module structure | OK — 5 modules (agent, mcp, terminal, workspace, worktree) |
| PIL-15 | Set up IPC (Electrobun Typed RPC) | OK — `shared/rpc.ts`, `rpc-middleware.ts`, `rpc-client.ts`, hooks |
| PIL-16 | Configure CI/CD pipeline | OK — `.github/workflows/ci.yml` exists |
| PIL-17 | Design system foundation | OK — 9 shadcn/ui primitives in `components/ui/` |
| PIL-31 | Add test infrastructure and foundational tests | OK — `workspace.test.ts`, `worktree.test.ts` present |
| PIL-5  | [Epic] Phase 0: Project Bootstrap | OK — all child issues complete |
| **PIL-18** | **Workspace CRUD and SQLite persistence** | **MISMATCH** — see below |

**PIL-18 mismatch (High Priority):**
PIL-18 was marked Done on 2026-04-13, but the spec calls for `getWorkspace` and `updateWorkspace` methods, plus schema extensions (`description`, `defaultBranch`, repo `name`, repo `order`, FK cascade delete, `updatedAt` auto-bump). The current codebase only has `listWorkspaces`, `createWorkspace`, and `deleteWorkspace`. The schema lacks `description`, repo `name`, and repo `order` columns. The RPC contract in `shared/rpc.ts` has no `getWorkspace` or `updateWorkspace` method.

**Recommendation:** Reopen PIL-18 or create a follow-up issue for the missing CRUD operations and schema columns.

### In Progress issues

No issues are currently marked "In Progress." The project appears to be between active sprints.

---

## 2. Untracked Work

Recent commits (last 7 days, since 2026-04-05) without a corresponding Linear issue:

| Commit | Description | Suggested action |
|--------|-------------|------------------|
| `cd78947` | Update .gitignore and enhance dark mode styles | Minor — no issue needed |
| `727a45b` | Add design document for Worktree Management Layer | Should be linked to PIL-6 or PIL-19 |
| `cc9103f` | Add CLI Git hooks (commit-msg, post-commit, pre-push, prepare-commit-msg) | Dev tooling — consider tracking under M0 or a "DX" label |
| `7f22240` | Add dev guide, enforcement stack, and scaffolding CLIs | Dev tooling — same as above |
| `3936c54` | Switch biome indent style to spaces and reformat | Minor — no issue needed |
| `1eb4279` | Add release scope and documentation | Should be linked to M6 or a release-planning issue |

**Recommendation:** Create a "DX / Developer Tooling" label and retroactively tag the dev guide and git hooks work. The worktree design doc should be linked to PIL-6 or PIL-19 as a resource.

---

## 3. Stale Issues

**No "In Progress" issues exist**, so there are no stale in-progress items.

However, the following default Linear onboarding issues are still open and should be cleaned up:

| Issue | Title | Status |
|-------|-------|--------|
| PIL-1 | Get familiar with Linear | Todo |
| PIL-2 | Set up your teams | Todo |
| PIL-3 | Connect your tools | Todo |
| PIL-4 | Import your data | Todo |

**Recommendation:** Archive PIL-1 through PIL-4 (Linear onboarding tasks).

**Backlog items with no milestone** that may need triage:

| Issue | Title | Last updated |
|-------|-------|-------------|
| PIL-33 | Worktree lifecycle hooks system | 2026-04-03 |
| PIL-34 | Build cache sharing across worktrees | 2026-04-03 |
| PIL-35 | External worktree interop | 2026-04-03 |
| PIL-36 | Integrated browser with password manager | 2026-04-03 |
| PIL-37 | Connections with Linear, Sentry, Slack | 2026-04-03 |
| PIL-38 | Dedicated memory per workspace | 2026-04-03 |
| PIL-39 | Run workspaces in sandboxes | 2026-04-03 |
| PIL-40 | Mobile companion app | 2026-04-03 |
| PIL-41 | Plugin system | 2026-04-03 |

These are post-MVP ideas. No action needed now, but PIL-33 (hooks) maps to the worktree design doc Phase 2 and will become relevant once M1 completes.

---

## 4. Design Doc Deferred Items

`docs/design-worktree-management.md` defines 4 implementation phases:

| Phase | Items | Current status |
|-------|-------|---------------|
| Phase 1: Foundation | `active_worktrees` + `worktree_configs` tables, path templates, `hashPort()`, status enrichment | **Not started.** Basic worktree CRUD exists (55 lines, git CLI wrapper). PIL-19 and PIL-20 cover parts of this. |
| Phase 2: Hooks and Merge | Hook system, `mergeWorktree`, pre-remove safety | Not started. PIL-33 (no milestone) partially maps here. |
| Phase 3: Cross-repo Coordination | `createFeatureWorktrees`, feature grouping, build cache | Not started. PIL-19 covers cross-repo creation; PIL-34 covers cache sharing. |
| Phase 4: External Interop | Detect/import external worktrees, worktrunk config | Not started. PIL-35 exists but has no milestone. |

**Key observation:** The design doc's Phase 1 items (DB-backed worktree tracking, path templates, port hashing, status enrichment) are prerequisites for PIL-19 and PIL-20. These should be explicitly called out as sub-tasks or acceptance criteria on those issues.

**Recommendation:** Once PIL-18 is truly complete, assign PIL-33 to M1 or M2, since the hooks system is architecturally load-bearing for agent-worktree coordination (design doc Phase 2).

---

## 5. Milestone Progress

| Milestone | Done | Total (non-epic) | Progress | Status |
|-----------|------|-------------------|----------|--------|
| **M0: Project Bootstrap** | 7 | 7 | **100%** | Complete |
| **M1: Workspace & Worktree Core** | 1* | 3 | **33%** | Active — PIL-18 needs verification |
| **M2: Agent Orchestration** | 0 | 3 | **0%** | Not started (agent/mcp/terminal services are stubs) |
| **M3: Terminal Integration** | 0 | 1 | **0%** | Not started |
| **M4: Diff View & Change Management** | 0 | 3 | **0%** | Not started |
| **M5: MCP & Skills** | 0 | 2 | **0%** | Not started |
| **M6: Polish & Alpha Release** | 0 | 2 | **0%** | Not started |

*PIL-18 counted as Done per Linear but has deliverable gaps (see Section 1).

**Overall MVP progress: 8/21 non-epic issues closed (38%).** M0 is fully complete. M1 is the active frontier.

---

## Action Items Summary

1. **PIL-18 — Reopen or create follow-up.** Missing `getWorkspace`, `updateWorkspace`, schema extensions (`description`, repo `name`, repo `order`), FK cascade, `updatedAt` auto-bump. (High priority)
2. **Archive PIL-1 through PIL-4.** Default Linear onboarding issues cluttering the board.
3. **Link worktree design doc to PIL-19.** The design doc at `docs/design-worktree-management.md` is an untracked resource that informs M1 work.
4. **Consider assigning PIL-33 (hooks) to M1 or M2.** The hooks system is a prerequisite for agent-worktree lifecycle coordination.
5. **Create a "DX / Developer Tooling" label** to track commits like git hooks, scaffolding CLIs, and dev guides that don't fit existing milestones.
6. **Move an issue to "In Progress"** — no active work is tracked in Linear despite recent commits. This makes velocity hard to measure.
