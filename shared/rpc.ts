// RPC type definitions for main process <-> webview communication
// This file defines the contract for typed RPC between Electrobun main and webview

import type { RPCSchema } from "electrobun";

export interface ActiveWorktreeDTO {
  id: string;
  repoId: string;
  featureName: string | null;
  branch: string;
  path: string;
  agentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  repo: {
    id: string;
    workspaceId: string;
    path: string;
    defaultBranch: string | null;
  };
  status: WorktreeStatus;
}

export type WorktreeResult =
  | { repoId: string; ok: true; worktree: ActiveWorktreeDTO }
  | { repoId: string; ok: false; error: string };

export interface WorktreeStatus {
  hasChanges: boolean;
  changedFiles: number;
  branchName: string | null;
  ahead: number;
  behind: number;
  lastFetch: string | null;
}

export type AgentBackendName = "claude" | "codex";
export type AgentStatus = "idle" | "running" | "stopped" | "error";

export interface AgentSessionDTO {
  id: string;
  workspaceId: string;
  worktreeId: string | null;
  backend: AgentBackendName;
  status: AgentStatus;
  prompt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AgentUpdateDTO =
  | { kind: "message"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "tool_call"; toolCallId: string; title: string; toolKind: string; status: string }
  | { kind: "tool_call_update"; toolCallId: string; status: string; title: string | null }
  | { kind: "plan"; entries: { content: string; status: string; priority: string }[] };

export type MainRPC = {
  bun: RPCSchema<{
    requests: {
      // Core
      ping: { params: Record<string, never>; response: string };
      getGreeting: { params: Record<string, never>; response: string };

      // Workspace
      listWorkspaces: {
        params: Record<string, never>;
        response: {
          id: string;
          name: string;
          description: string | null;
          defaultBranch: string | null;
          createdAt: string;
          updatedAt: string;
          repos: {
            id: string;
            workspaceId: string;
            path: string;
            name: string | null;
            defaultBranch: string | null;
            order: number;
          }[];
        }[];
      };
      getWorkspace: {
        params: { id: string };
        response: {
          id: string;
          name: string;
          description: string | null;
          defaultBranch: string | null;
          createdAt: string;
          updatedAt: string;
          repos: {
            id: string;
            workspaceId: string;
            path: string;
            name: string | null;
            defaultBranch: string | null;
            order: number;
          }[];
        };
      };
      createWorkspace: {
        params: {
          name: string;
          description?: string;
          defaultBranch?: string;
          repoPaths: string[];
        };
        response: {
          id: string;
          name: string;
          description: string | null;
          defaultBranch: string | null;
          createdAt: string;
          updatedAt: string;
          repos: {
            id: string;
            workspaceId: string;
            path: string;
            name: string | null;
            defaultBranch: string | null;
            order: number;
          }[];
        };
      };
      updateWorkspace: {
        params: {
          id: string;
          input: {
            name?: string;
            description?: string;
            defaultBranch?: string;
            repoPaths?: string[];
          };
        };
        response: {
          id: string;
          name: string;
          description: string | null;
          defaultBranch: string | null;
          createdAt: string;
          updatedAt: string;
          repos: {
            id: string;
            workspaceId: string;
            path: string;
            name: string | null;
            defaultBranch: string | null;
            order: number;
          }[];
        };
      };
      deleteWorkspace: {
        params: { id: string };
        response: undefined;
      };

      // Worktree
      listWorktrees: {
        params: { repoPath: string };
        response: {
          path: string;
          branch: string;
          head: string;
          isMain: boolean;
        }[];
      };
      createWorktree: {
        params: { repoPath: string; branch: string; path: string };
        response: {
          path: string;
          branch: string;
          head: string;
          isMain: boolean;
        };
      };
      removeWorktree: {
        params: { repoPath: string; path: string; force?: boolean };
        response: undefined;
      };

      createWorktreesForFeature: {
        params: { workspaceId: string; featureName: string; branchName: string };
        response: WorktreeResult[];
      };
      listWorkspaceWorktrees: {
        params: { workspaceId: string };
        response: ActiveWorktreeDTO[];
      };
      refreshWorktreeStatus: {
        params: { worktreeId: string };
        response: WorktreeStatus;
      };
      removeTrackedWorktree: {
        params: { worktreeId: string; force?: boolean };
        response: undefined;
      };
      getWorktreeStatus: {
        params: { worktreeId: string };
        response: WorktreeStatus;
      };

      // Agent
      listAgentSessions: {
        params: { workspaceId: string };
        response: AgentSessionDTO[];
      };
      getAgentSession: {
        params: { sessionId: string };
        response: AgentSessionDTO;
      };
      startAgent: {
        params: {
          workspaceId: string;
          worktreeId?: string;
          backend: AgentBackendName;
          prompt?: string;
        };
        response: { sessionId: string };
      };
      stopAgent: {
        params: { sessionId: string };
        response: { success: boolean };
      };
      stopAllAgents: {
        params: { workspaceId: string };
        response: { stopped: number };
      };
      sendPrompt: {
        params: { sessionId: string; prompt: string };
        response: { success: boolean };
      };

      // Terminal (stub)
      listTerminals: {
        params: Record<string, never>;
        response: {
          id: string;
          workspaceId: string;
          pid: number;
          status: "running" | "exited";
        }[];
      };
      createTerminal: {
        params: { workspaceId: string; cwd: string };
        response: null;
      };

      // MCP (stub)
      listMcpServers: {
        params: Record<string, never>;
        response: {
          id: string;
          name: string;
          command: string;
          args: string[];
          status: "connected" | "disconnected" | "error";
        }[];
      };
      listMcpTools: {
        params: Record<string, never>;
        response: {
          name: string;
          description: string;
          serverId: string;
        }[];
      };
    };
    messages: {
      log: { msg: string };
      terminalOutput: { terminalId: string; text: string };
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      worktreeStatusChanged: { worktreeId: string; status: WorktreeStatus };
      agentOutput: { sessionId: string; chunk: AgentUpdateDTO };
      agentStatusChange: { sessionId: string; status: AgentStatus; error?: string };
    };
  }>;
};
