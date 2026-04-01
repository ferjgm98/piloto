export interface AgentBackend {
  name: string;
  start(workingDir: string, prompt: string): Promise<void>;
  stop(): Promise<void>;
  onOutput(cb: (text: string) => void): void;
}

export interface AgentSession {
  id: string;
  workspaceId: string;
  backend: string;
  status: "idle" | "running" | "stopped" | "error";
  createdAt: string;
}
