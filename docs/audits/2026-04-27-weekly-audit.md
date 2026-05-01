# Weekly Project Health Audit — 2026-04-27

**Scope:** Piloto MVP (Linear project "Piloto MVP", team PIL)
**Data sources:** Linear MCP, codebase at `piloto/`, design docs, ADRs
**Previous audit:** [2026-04-13](./2026-04-13-weekly-audit.md)

---

## TL;DR — needs attention

1. **Project status is wrong.** "Piloto MVP" in Linear is marked `Completed` (completedAt 2026-04-20), yet only M0 + M1 are 100% done; M2 is 50%, M3–M6 are 0%. PIL-22 was even closed on 2026-04-21, *after* the project was flagged complete. Reopen the project (set status back to `In Progress`).
2. **Epic PIL-7 (Phase 2: Agent Orchestration) is still `Backlog`** even though PIL-21 and PIL-22 are Done. Move it to `In Progress`.
3. **ADR 0001 follow-up is untracked.** ADR 0001 commits to a follow-up ticket investigating `@parcel/watcher` viability under Electrobun bundling. No issue exists in the MVP or Post-MVP project.
4. **No commits in 7 days** (latest commit `6786a81` 2026-04-20). No stale `In Progress` issues — but velocity has paused. Likely because nothing in the MVP backlog is currently picked up.
5. **PIL-23 is the only thing blocking M2 closure.** Its prerequisites (PIL-21, PIL-22) are Done. It's unblocked and ready to pull.

---

## 1. Linear status vs codebase reality

### Done issues — verified against the source tree

All 12 `Done` issues in the MVP project map to real implementation:

| Issue | Title | Verdict |
|-------|-------|---------|
| PIL-12 | Initialize from electrobun-starter | OK — `electrobun.config.ts`, `package.json` configured |
| PIL-13 | Electrobun shell + React/TS | OK — `src/mainview/`, `src/bun/` scaffolded |
| PIL-14 | Bun main process module structure | OK — 5 modules: `agent/`, `mcp/`, `terminal/`, `workspace/`, `worktree/` + `db/` with Drizzle |
| PIL-15 | IPC Typed RPC | OK — `shared/rpc.ts` (277 lines), `rpc-middleware.ts`, `rpc-client.ts`, hooks |
| PIL-16 | CI/CD pipeline | OK — `.github/workflows/` |
| PIL-17 | Design system | OK — Tailwind v4 + shadcn/ui in `components/ui/` |
| PIL-31 | Test infrastructure | OK — `workspace.test.ts`, `worktree.test.ts`, `agent.test.ts` (311 lines) |
| PIL-18 | Workspace CRUD + SQLite | OK — `getWorkspace`, `listWorkspaces`, `createWorkspace`, `updateWorkspace`, `deleteWorkspace` all present |
| PIL-19 | Multi-repo worktree lifecycle | OK — `createWorktreesForFeature`, `listWorkspaceWorktrees`, `removeTrackedWorktree` in `worktree.service.ts` |
| PIL-20 | Worktree status dashboard + watcher | OK — `createWatcher`, `destroyWatcher`, `computeAllStatuses`, `getWorktreeStatus`, `refreshWorktreeStatus` |
| PIL-21 | Agent abstraction + Claude/Codex backends | OK — `agent.service.ts` (200 LOC), `backends/claude.backend.ts`, `backends/codex.backend.ts`, `backends/jsonrpc-stdio.ts` |
| PIL-22 | Codex CLI backend integration tests | OK — covered in `agent.test.ts` and the Codex backend module |

Stubs that are correctly *not* claimed as done:

- `src/bun/modules/terminal/terminal.service.ts` — single-line stub for libghostty (M3, PIL-24 still Backlog) ✓
- `src/bun/modules/mcp/mcp.service.ts` — single-line stub for MCP bridge (M5, PIL-27 still Backlog) ✓

### In Progress issues

None. The MVP project has zero issues in `In Progress` right now.

### Status anomalies

- **Project "Piloto MVP" → status = `Completed`.** Completed at 2026-04-20T01:53Z. Mismatch: M2 progress 50%, M3–M6 progress 0%, and PIL-22 closed *after* the project (2026-04-21T03:35Z). Almost certainly an accidental side-effect of closing the PIL-6 Phase 1 epic on the same date.
- **Epic PIL-7 (Phase 2: Agent Orchestration) → status = `Backlog`.** Two of its three children (PIL-21, PIL-22) are Done; only PIL-23 remains. Should be `In Progress`.

---

## 2. Untracked work in git history

7 commits since the last audit (2026-04-13). All map to either a tracked issue, a documented ADR, or the audit doc itself:

| Commit | Issue / Doc |
|---|---|
| `6786a81` feat(agent): PIL-22 Codex CLI backend integration tests | PIL-22 ✓ |
| `65d6469` refactor(agent): PIL-21 — pivot from ACP to native CLI | PIL-21 ✓ + ADR 0002 |
| `9197825` docs: README + ADR 0002 agent protocol choice | PIL-21 ✓ |
| `9432a74` refactor(worktree): switch to node:fs.watch (ADR 0001) | PIL-20 ✓ + ADR 0001 |
| `a3f5c9a` Add live worktree status dashboard with watcher updates | PIL-20 ✓ |
| `a174798` docs(audits): 2026-04-13 weekly audit | meta — last audit |
| `4fe5425` feat(worktree): multi-repo worktree lifecycle (PIL-19) | PIL-19 ✓ |

No untracked feature commits. All new files (`src/bun/modules/agent/backends/*`, watcher wiring in `worktree.service.ts`) correspond to PIL-19/20/21/22.

### One untracked follow-up

`docs/adr/0001-file-system-watcher.md` explicitly states that a follow-up ticket will investigate making `@parcel/watcher` work in Electrobun (disabling `useAsar`, `createRequire` against `process.execPath`, or upstream patch). **No such ticket exists in MVP or Post-MVP.** Recommend creating one, low-priority, in Post-MVP — labelled with the revisit triggers from the ADR ("Linux support added", ">~50 worktrees", "Bun bundler fix lands", "fs.watch drops events in practice").

---

## 3. Stale issues

- **No `In Progress` issues** to be stale.
- **Backlog issues with all blockers resolved:**
  - **PIL-23** (Parallel agent execution + UI streaming) — children PIL-21 and PIL-22 are Done. Fully unblocked. This is the last MVP item before M2 closes. **Recommend: pull next.**
  - **PIL-24** (libghostty terminal) — independent of M2; can start in parallel.
  - **PIL-25 / PIL-26 / PIL-32** (M4 diff view + accept/reject + merge service) — independent. Pull after M2 closes.
- **Velocity:** Latest commit is 7 days old. Not technically a "stale issue" since nothing is `In Progress`, but the pause is worth noting given the project was prematurely flagged Complete.

---

## 4. Design doc deferred items

`docs/design-worktree-management.md` was reviewed against current state.

- **Phase 1 (foundation)** — folded into M1 work and shipped. ✓
- **Phase 2 (hooks + merge)** — the *merge* half is tracked as **PIL-32** in M4 (still Backlog). The *hooks* half is tracked as **PIL-33** in **Post-MVP** ✓.
- **Phase 3 (cross-repo coordination)** — the cross-repo branch creation half shipped under PIL-19 (`createWorktreesForFeature`). Cache sharing is **PIL-34** in Post-MVP ✓.
- **Phase 4 (external interop)** — **PIL-35** in Post-MVP ✓.

Other Post-MVP items (PIL-36 browser, PIL-37 connections, PIL-38 memory, PIL-39 sandbox, PIL-40 mobile, PIL-41 plugin system) all map to roadmap-level features documented elsewhere.

**No design-doc items have become "now-relevant" enough to promote into MVP scope.** The boundary still holds: M4 ships merge (PIL-32); hooks/cache/interop stay deferred until alpha lands.

ADR follow-up gap noted in §2 above.

---

## 5. Milestone progress

| Milestone | Issues (closed / total) | Progress | Notes |
|---|---|---|---|
| M0: Project Bootstrap | 6 / 6 | 100% | All shipped before 2026-04-13 audit |
| M1: Workspace & Worktree Core | 4 / 4 (incl. PIL-6 epic) | 100% | Closed in last cycle (PIL-19, PIL-20, epic 04-20) |
| M2: Agent Orchestration | 2 / 4 | 50% | PIL-21 + PIL-22 Done. **PIL-23 left + epic PIL-7 not yet flipped to In Progress.** |
| M3: Terminal Integration | 0 / 2 | 0% | PIL-8 epic + PIL-24 libghostty. Both Backlog. Independent of M2/M4. |
| M4: Diff View & Change Management | 0 / 4 | 0% | PIL-9 epic + PIL-25, PIL-26, PIL-32. All Backlog. |
| M5: MCP & Skills | 0 / 3 | 0% | PIL-10 epic + PIL-27, PIL-28. All Backlog. |
| M6: Polish & Alpha Release | 0 / 3 | 0% | PIL-11 epic + PIL-29, PIL-30. All Backlog. |

**Falling behind?** Not quantitatively — there are no missed targetDates (none set). But the pace from the first three weeks (M0+M1 in ~3 weeks) implies M2 should already be wrapping. The 7-day commit gap suggests momentum risk for M2.

---

## Recommendations (review-only — no automatic changes)

1. **Reopen the "Piloto MVP" project** — set status back to `In Progress`. Likely accidental closure when PIL-6 closed on 2026-04-20.
2. **Move epic PIL-7 to `In Progress`** — two of three children Done.
3. **Pull PIL-23 next** — only remaining MVP work before M2 closes; fully unblocked.
4. **Open a Post-MVP issue for the @parcel/watcher follow-up** referenced in ADR 0001. Low priority. Title suggestion: *"ADR 0001 follow-up: revisit `@parcel/watcher` integration with Electrobun bundling"*.
5. **(Optional) Set targetDates on M2–M6** — currently null. Useful for the next audit's "falling behind" check.

---

*Generated by the scheduled weekly project health audit. Next run: 2026-05-04.*
