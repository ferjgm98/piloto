import type { InferSelectModel } from "drizzle-orm";
import type { AgentBackendName, AgentStatus, AgentUpdateDTO } from "shared/rpc";
import type { agentSessions } from "../../db/schema";

export type AgentSessionRow = InferSelectModel<typeof agentSessions>;

export interface AgentBackend {
  name: AgentBackendName;
  start(input: { workingDir: string; prompt: string }): Promise<{ sessionId: string }>;
  sendPrompt(prompt: string): Promise<void>;
  stop(): Promise<void>;
  onUpdate(cb: (update: AgentUpdateDTO) => void): void;
}

export interface ClaudeConfig {
  sessionId: string;
  binaryPath?: string;
}

export interface CodexConfig {
  sessionId: string;
  binaryPath?: string;
}

export interface StartAgentInput {
  workspaceId: string;
  worktreeId?: string;
  backend: AgentBackendName;
  prompt?: string;
}

export interface StopAgentInput {
  sessionId: string;
}

export type AgentStatusChange = {
  sessionId: string;
  status: AgentStatus;
  error?: string;
};
