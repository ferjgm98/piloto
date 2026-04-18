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
}

export type WorktreeResult =
  | { repoId: string; ok: true; worktree: ActiveWorktreeDTO }
  | { repoId: string; ok: false; error: string };

export interface WorktreeStatus {
  path: string;
  branch: string;
  hasUncommittedChanges: boolean;
  hasRunningAgents: boolean;
}

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
          createdAt: string;
          updatedAt: string;
        }[];
      };
      createWorkspace: {
        params: { name: string; repoPaths: string[] };
        response: {
          id: string;
          name: string;
          createdAt: string;
          updatedAt: string;
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

      // Cross-repo tracked worktrees (PIL-19)
      createWorktreesForFeature: {
        params: { workspaceId: string; featureName: string; branchName: string };
        response: WorktreeResult[];
      };
      listWorkspaceWorktrees: {
        params: { workspaceId: string };
        response: ActiveWorktreeDTO[];
      };
      removeTrackedWorktree: {
        params: { worktreeId: string; force?: boolean };
        response: undefined;
      };
      getWorktreeStatus: {
        params: { worktreeId: string };
        response: WorktreeStatus;
      };

      // Agent (stub)
      listAgentSessions: {
        params: Record<string, never>;
        response: {
          id: string;
          workspaceId: string;
          backend: string;
          status: "idle" | "running" | "stopped" | "error";
          createdAt: string;
        }[];
      };
      startAgent: {
        params: { workspaceId: string; backend: string };
        response: null;
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
      agentOutput: { sessionId: string; text: string };
      terminalOutput: { terminalId: string; text: string };
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: Record<string, never>;
  }>;
};
