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

export interface WorkspaceRepo {
  id: string;
  workspaceId: string;
  path: string;
  name: string | null;
  defaultBranch: string | null;
  order: number;
}

export interface ActiveWorktreeRow {
  id: string;
  repoId: string;
  featureName: string | null;
  branch: string;
  path: string;
  agentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ActiveWorktree = ActiveWorktreeRow & { repo: WorkspaceRepo };

export type WorktreeResult =
  | { repoId: string; ok: true; worktree: ActiveWorktree }
  | { repoId: string; ok: false; error: string };

export interface WorktreeStatus {
  hasChanges: boolean;
  changedFiles: number;
  branchName: string | null;
  ahead: number;
  behind: number;
  lastFetch: Date | null;
}

export type WorktreeWithStatus = ActiveWorktree & { status: WorktreeStatus };
