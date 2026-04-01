import type { AgentBackend } from "../agent.types";

// Stub: Codex CLI — implementation in Phase 2
export function createCodexBackend(): AgentBackend {
  return {
    name: "codex",
    start: async () => {},
    stop: async () => {},
    onOutput: () => {},
  };
}
