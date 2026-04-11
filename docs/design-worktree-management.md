# Design Doc: Worktree Management Layer

**Status:** Proposed
**Author:** Fer
**Date:** 2026-04-03
**Related:** [worktrunk CLI](https://worktrunk.dev/worktrunk/)

## Context and Goals

Piloto's core value proposition is running multiple AI agents in parallel across multi-repo workspaces using Git worktrees. The current implementation (`worktree.service.ts`) provides basic CRUD operations — list, create, remove — by shelling out to `git worktree` commands via `runGit()`. This is functional but minimal.

[worktrunk](https://worktrunk.dev/worktrunk/) is a Rust CLI tool that solves a very similar problem: making git worktrees ergonomic for parallel AI agent workflows. It has a mature feature set including hook systems, merge workflows, port hashing for dev servers, and build cache sharing. The question is whether Piloto should depend on worktrunk, port its ideas, or chart its own course.

This document proposes **porting worktrunk's best patterns into Piloto's native TypeScript worktree layer** rather than taking a runtime dependency on the CLI tool.

## Current State

### What exists today

```
src/bun/modules/worktree/
  worktree.service.ts   — list, create, remove (git worktree CLI wrapper)
  worktree.types.ts     — Worktree, WorktreeCreateInput, WorktreeRemoveInput
  worktree.rpc.ts       — RPC handlers exposed to the renderer

src/bun/modules/workspace/
  workspace.service.ts  — CRUD for multi-repo workspaces (SQLite-backed)
  workspace.types.ts    — Workspace, WorkspaceRepo, CreateWorkspaceInput

src/bun/utils/git.ts    — runGit() helper with timeout and error handling
```

The `Worktree` type tracks `path`, `branch`, `head`, and `isMain`. Workspaces group multiple repos (`workspaceRepos` table) and agent sessions are linked to workspaces. The agent service is still a Phase 2 stub.

### What's missing

The gap between "create a worktree" and "run an agent in it productively" is substantial:

1. **No lifecycle hooks** — nothing happens before/after worktree creation or removal (e.g., install deps, start dev server, clean up).
2. **No merge workflow** — no squash/rebase/merge + cleanup in one operation.
3. **No port isolation** — two worktrees running dev servers will collide.
4. **No build cache sharing** — each worktree does a full `node_modules` install.
5. **No status enrichment** — no staged change counts, commit age, or CI status per worktree.
6. **No cross-repo coordination** — worktrees are per-repo, but Piloto workspaces span multiple repos. Creating a "feature" across repos means coordinating worktree creation with consistent branch naming.

## Decision: Native Implementation over CLI Dependency

### Why not depend on worktrunk directly

| Concern | Detail |
|---|---|
| **Runtime dependency** | Adds a Rust binary (via Homebrew/Cargo) to a Bun + Zig stack. Users must install it separately. |
| **Single-repo scope** | worktrunk operates within one repo. Piloto's differentiator is multi-repo workspace coordination — worktrunk can't help there. |
| **GUI vs CLI** | Piloto users interact through a desktop GUI, not a terminal. Wrapping CLI output parsing is fragile and adds latency vs. calling `git` directly (which we already do). |
| **Update coupling** | worktrunk's breaking changes become Piloto's breaking changes, with no control over the release cadence. |

### What to port from worktrunk

worktrunk has solved real problems through community iteration. These patterns are worth adopting:

#### 1. Template-based worktree paths

worktrunk computes worktree paths from branch names using configurable templates. Piloto should do the same to keep worktree directories predictable and tidy.

```typescript
// Proposed: path template resolution
interface WorktreePathConfig {
  // Default: `../{repo-name}-worktrees/{branch}`
  template: string;
}

function resolveWorktreePath(repoPath: string, branch: string, config: WorktreePathConfig): string {
  const repoName = path.basename(repoPath);
  return config.template
    .replace("{repo-name}", repoName)
    .replace("{branch}", branch.replace(/\//g, "-"));
}
```

#### 2. Lifecycle hooks

worktrunk runs user-defined hooks at key moments. Piloto should support this natively, configured per-workspace:

```typescript
interface WorktreeHooks {
  postCreate?: HookAction[];   // e.g., install deps, copy .env, start dev server
  preRemove?: HookAction[];    // e.g., stop processes, warn about uncommitted changes
  preMerge?: HookAction[];     // e.g., run tests
  postMerge?: HookAction[];    // e.g., cleanup branch, notify
}

type HookAction =
  | { type: "shell"; command: string }
  | { type: "installDeps" }        // built-in: detect package manager, install
  | { type: "copyFile"; from: string; to: string }
  | { type: "startDevServer"; portOffset?: number };
```

#### 3. Port hashing for dev servers

worktrunk's `hash_port` filter deterministically assigns a port per worktree branch, avoiding collisions. This is critical for parallel agents running dev servers.

```typescript
function hashPort(branch: string, basePort: number = 3000, range: number = 1000): number {
  let hash = 0;
  for (const char of branch) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return basePort + (Math.abs(hash) % range);
}
```

#### 4. Unified merge workflow

Instead of requiring users to manually squash, merge, delete the branch, and remove the worktree, expose a single `mergeWorktree` operation:

```typescript
interface MergeWorktreeInput {
  repoPath: string;
  worktreePath: string;
  targetBranch: string;
  strategy: "squash" | "rebase" | "merge";
  deleteBranch?: boolean;   // default: true
  removeWorktree?: boolean; // default: true
}
```

#### 5. Status enrichment

worktrunk's `list --full` shows staged changes, commit counts, age, and CI status. Piloto should compute this for the GUI:

```typescript
interface WorktreeStatus extends Worktree {
  stagedCount: number;
  unstagedCount: number;
  aheadCount: number;       // commits ahead of target branch
  behindCount: number;
  lastCommitAge: string;    // relative, e.g., "2h ago"
  lastCommitMessage: string;
}
```

## What Piloto Builds Beyond worktrunk

These features are unique to Piloto and have no worktrunk equivalent:

### Cross-repo worktree coordination

When a user creates a "feature" in a multi-repo workspace, Piloto should create worktrees in all repos simultaneously with consistent branch naming:

```typescript
interface CrossRepoWorktreeInput {
  workspaceId: string;
  featureName: string;          // becomes branch name across all repos
  repos?: string[];             // subset of workspace repos, or all if omitted
}

async function createFeatureWorktrees(input: CrossRepoWorktreeInput): Promise<Worktree[]> {
  const repos = input.repos ?? getWorkspaceRepos(input.workspaceId);
  const branch = `feature/${input.featureName}`;

  return Promise.all(
    repos.map((repoPath) =>
      createWorktree({
        repoPath,
        branch,
        path: resolveWorktreePath(repoPath, branch, config),
      })
    ),
  );
}
```

### Agent-aware worktree lifecycle

Since agents run inside worktrees, the worktree module should coordinate with the agent module:

- **Pre-remove check:** refuse to remove a worktree with a running agent (or offer to stop it first).
- **Agent spawn integration:** when creating a worktree + agent in one step, run hooks (install deps) before starting the agent.
- **Worktree health:** expose per-worktree agent status alongside git status in the GUI.

### Build cache sharing

For `node_modules`, Piloto can symlink or use workspace-level caching to avoid redundant installs across worktrees of the same repo. This requires detecting the package manager (`package-lock.json` → npm, `bun.lock` → bun, etc.) and choosing the right caching strategy.

## Proposed Schema Changes

The `worktree` module currently has no database backing — it reads directly from `git worktree list`. To support hooks, templates, and cross-repo coordination, add:

```sql
CREATE TABLE worktree_configs (
  id TEXT PRIMARY KEY,
  workspace_repo_id TEXT NOT NULL REFERENCES workspace_repos(id),
  path_template TEXT DEFAULT '../{repo-name}-worktrees/{branch}',
  hooks_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE active_worktrees (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  workspace_repo_id TEXT NOT NULL REFERENCES workspace_repos(id),
  feature_name TEXT,           -- groups worktrees across repos
  branch TEXT NOT NULL,
  path TEXT NOT NULL,
  head TEXT NOT NULL,
  agent_session_id TEXT REFERENCES agent_sessions(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

This lets Piloto track worktrees it created (vs. externally created ones) and associate them with agents and cross-repo features.

## Implementation Phases

### Phase 1: Foundation (aligns with current Phase 2 agent work)

- Add `active_worktrees` and `worktree_configs` tables.
- Implement template-based path resolution.
- Implement `hashPort()`.
- Enrich `listWorktrees` to return `WorktreeStatus` (staged/unstaged counts, ahead/behind).
- Wire into existing RPC layer.

### Phase 2: Hooks and Merge

- Implement hook system (shell commands, built-in actions).
- Implement `mergeWorktree` with squash/rebase/merge + cleanup.
- Add pre-remove safety checks (running agents, uncommitted changes).

### Phase 3: Cross-repo Coordination

- Implement `createFeatureWorktrees` for multi-repo branch creation.
- Add feature grouping in the `active_worktrees` table.
- Build cache sharing (symlinks for `node_modules`/`target`).

### Phase 4: External Worktree Interop (optional)

- Detect and import worktrees created outside Piloto (including via worktrunk).
- Read worktrunk config if present to infer path templates.

## Open Questions

1. **Hook execution model:** Should hooks run in the integrated libghostty terminal (visible to user) or in a background process? Probably terminal for transparency, background for batch operations.

2. **Cache sharing strategy:** Symlinks vs. hardlinks vs. copy-on-write (APFS clones on macOS). Bun's `bun install` already has good caching — worth benchmarking before adding complexity.

3. **Conflict resolution in cross-repo merges:** If one repo's merge succeeds but another fails, should Piloto roll back the successful one? Or leave both in their current state and let the user decide?
