export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class GitError extends AppError {
  constructor(message: string) {
    super(message, "GIT_ERROR");
    this.name = "GitError";
  }
}

export class WorktreeInUseError extends AppError {
  constructor(worktreeId: string) {
    super(
      `Worktree ${worktreeId} has a running agent session; pass force=true to override`,
      "WORKTREE_IN_USE",
    );
    this.name = "WorktreeInUseError";
  }
}

export class WorktreeAlreadyHasWatcherError extends AppError {
  constructor(worktreeId: string) {
    super(`Worktree ${worktreeId} already has an active watcher`, "WORKTREE_ALREADY_HAS_WATCHER");
    this.name = "WorktreeAlreadyHasWatcherError";
  }
}

export class UncommittedChangesError extends AppError {
  constructor(path: string) {
    super(
      `Worktree at ${path} has uncommitted changes; pass force=true to override`,
      "UNCOMMITTED_CHANGES",
    );
    this.name = "UncommittedChangesError";
  }
}

export class AgentBinaryNotFoundError extends AppError {
  constructor(binary: string) {
    super(`Agent binary "${binary}" not found on PATH`, "AGENT_BINARY_NOT_FOUND");
    this.name = "AgentBinaryNotFoundError";
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR");
    this.name = "ConfigurationError";
  }
}
