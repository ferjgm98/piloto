import type { InferSelectModel } from "drizzle-orm";
import type { activeWorktrees, workspaceRepos } from "../../db/schema";

export interface Worktree {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export interface WorktreeCreateInput {
  repoPath: string;
  branch: string;
  path: string;
}

export interface WorktreeRemoveInput {
  repoPath: string;
  path: string;
  force?: boolean;
}

export type WorkspaceRepo = InferSelectModel<typeof workspaceRepos>;
export type ActiveWorktreeRow = InferSelectModel<typeof activeWorktrees>;
export type ActiveWorktree = ActiveWorktreeRow & { repo: WorkspaceRepo };

export type WorktreeResult =
  | { repoId: string; ok: true; worktree: ActiveWorktree }
  | { repoId: string; ok: false; error: string };

export interface WorktreeStatus {
  path: string;
  branch: string;
  hasUncommittedChanges: boolean;
  hasRunningAgents: boolean;
}
