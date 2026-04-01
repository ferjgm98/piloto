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
