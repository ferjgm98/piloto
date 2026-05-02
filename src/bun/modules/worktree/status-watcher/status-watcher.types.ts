import type { WorktreeStatus } from "../worktree.types";

export interface StatusWatcherEvent {
  worktreeId: string;
  status: WorktreeStatus;
}

export type StatusWatcherSubscriber = (event: StatusWatcherEvent) => void;

export interface StatusWatcher {
  startWatching(worktreeId: string, path: string): void;
  stopWatching(worktreeId: string): Promise<void>;
  subscribe(listener: StatusWatcherSubscriber): () => void;
  notify(worktreeId: string, status: WorktreeStatus): void;
  shutdown(): Promise<void>;
  has(worktreeId: string): boolean;
}

export interface StatusWatcherDeps {
  computeStatus: (path: string) => Promise<WorktreeStatus>;
  debounceMs?: number;
  shouldIgnore?: (worktreePath: string, eventPath: string) => boolean;
}
