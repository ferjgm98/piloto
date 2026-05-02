import type { InferSelectModel } from "drizzle-orm";
import type { AgentBackendName, AgentStatus, AgentUpdateDTO } from "shared/rpc";
import type { threadRepos, threads } from "../../db/schema";

export type ThreadRow = InferSelectModel<typeof threads>;
export type ThreadRepoRow = InferSelectModel<typeof threadRepos>;

export interface ThreadBackend {
  name: AgentBackendName;
  start(input: { workingDir: string; prompt: string }): Promise<{ sessionId: string }>;
  sendPrompt(prompt: string): Promise<void>;
  stop(): Promise<void>;
  onUpdate(cb: (update: AgentUpdateDTO) => void): void;
}

export interface ThreadBackendExitInfo {
  code: number | null;
  signal: string | null;
}

export interface ThreadBindingInput {
  repoId: string;
  worktreeId: string;
  alias?: string;
}

export interface StartThreadInput {
  sessionId: string;
  backend: AgentBackendName;
  bindings: ThreadBindingInput[];
  prompt?: string;
}

export type ThreadStatusChange = {
  threadId: string;
  status: AgentStatus;
  error?: string;
};
