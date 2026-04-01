import type { AgentBackend } from "../agent.types";

// Stub: Claude Code via ACP — implementation in Phase 2
export function createClaudeBackend(): AgentBackend {
  return {
    name: "claude",
    start: async () => {},
    stop: async () => {},
    onOutput: () => {},
  };
}
