export interface ThreadSessionDirBinding {
  alias: string;
  worktreePath: string;
}

export interface ThreadSessionDir {
  path: string;
  links: { alias: string; target: string }[];
}
