import { describe, expect, test } from "bun:test";
import type { MainRPC } from "shared/rpc";
import { RPC_ERROR_PREFIX, decodeRPCError } from "../../shared/errors";
import { requestHandlers } from "./rpc-handlers";
import { NotFoundError } from "./utils/errors";
import { wrapHandler } from "./utils/rpc-middleware";

const expectedRequestKeys = {
  ping: true,
  getGreeting: true,
  listWorkspaces: true,
  getWorkspace: true,
  createWorkspace: true,
  updateWorkspace: true,
  deleteWorkspace: true,
  listWorktrees: true,
  createWorktree: true,
  removeWorktree: true,
  createWorktreesForFeature: true,
  listWorkspaceWorktrees: true,
  refreshWorktreeStatus: true,
  removeTrackedWorktree: true,
  getWorktreeStatus: true,
  listAgentSessions: true,
  getAgentSession: true,
  startAgent: true,
  stopAgent: true,
  stopAllAgents: true,
  sendPrompt: true,
  listTerminals: true,
  createTerminal: true,
  listMcpServers: true,
  listMcpTools: true,
} satisfies Record<keyof MainRPC["bun"]["requests"], true>;

describe("rpc", () => {
  test("exports handlers for every MainRPC request key", () => {
    expect(Object.keys(requestHandlers).sort()).toEqual(Object.keys(expectedRequestKeys).sort());
  });

  test("wrapHandler preserves inferred parameter and return types", async () => {
    const originalDebug = console.debug;
    console.debug = () => {};

    try {
      const handler = wrapHandler("typed", async ({ value }: { value: string }) => value.length);
      const result: number = await handler({ value: "pilot" });

      expect(result).toBe(5);
    } finally {
      console.debug = originalDebug;
    }
  });

  test("serializes AppError instances with RPC_ERROR_PREFIX", async () => {
    const originalError = console.error;
    console.error = () => {};

    try {
      const handler = wrapHandler("failing", async () => {
        throw new NotFoundError("Workspace", "missing");
      });

      try {
        await handler();
        throw new Error("Expected handler to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);

        const message = (error as Error).message;
        expect(message.startsWith(RPC_ERROR_PREFIX)).toBe(true);

        const decoded = decodeRPCError(message);
        expect(decoded?.code).toBe("NOT_FOUND");
        expect(decoded?.message).toBe("Workspace not found: missing");
        expect(decoded?.details?.handler).toBe("failing");
      }
    } finally {
      console.error = originalError;
    }
  });
});
