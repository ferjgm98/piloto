export interface Terminal {
  id: string;
  workspaceId: string;
  pid: number;
  status: "running" | "exited";
}

export interface TerminalCreateInput {
  workspaceId: string;
  cwd: string;
}
