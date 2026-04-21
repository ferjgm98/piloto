import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, initializeDatabase } from "../../db/database";
import { agentSessions, workspaceRepos, workspaces } from "../../db/schema";
import { AgentBinaryNotFoundError, NotFoundError, ValidationError } from "../../utils/errors";
import { resetTestDb } from "../../utils/test-setup";
import {
  getAgentSession,
  listAgentSessions,
  setAgentStatusNotifier,
  setAgentUpdateNotifier,
  startAgent,
  stopAgent,
} from "./agent.service";
import { createCodexBackend, mapCodexNotification } from "./backends/codex.backend";

function seedWorkspaceWithRepo(): { workspaceId: string; repoId: string } {
  const workspaceId = randomUUID();
  const repoId = randomUUID();
  const db = getDb();
  const now = new Date().toISOString();

  db.insert(workspaces)
    .values({
      id: workspaceId,
      name: "Test Workspace",
      description: null,
      defaultBranch: "main",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(workspaceRepos)
    .values({
      id: repoId,
      workspaceId,
      path: "/tmp/test-repo",
      name: "test-repo",
      defaultBranch: "main",
      order: 0,
    })
    .run();

  return { workspaceId, repoId };
}

function seedSession(
  workspaceId: string,
  overrides: Partial<{
    backend: "claude" | "codex";
    status: "running" | "stopped" | "error";
    prompt: string;
  }> = {},
): string {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(agentSessions)
    .values({
      id: sessionId,
      workspaceId,
      worktreeId: null,
      backend: overrides.backend ?? "codex",
      status: overrides.status ?? "running",
      prompt: overrides.prompt ?? "test",
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return sessionId;
}

describe("agent.service", () => {
  beforeAll(async () => {
    await initializeDatabase({ path: ":memory:" });
  });

  beforeEach(() => {
    resetTestDb(getDb());
  });

  afterEach(() => {
    setAgentUpdateNotifier(null);
    setAgentStatusNotifier(null);
  });

  describe("startAgent", () => {
    test("throws ValidationError for unsupported backend", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const call = startAgent({
        workspaceId,
        backend: "unsupported" as "claude",
        prompt: "test",
      });
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toThrow(/Unsupported agent backend/);
    });

    describe("with missing codex binary", () => {
      let originalBin: string | undefined;
      let originalLogLevel: string | undefined;

      beforeEach(() => {
        originalBin = process.env.PILOTO_CODEX_BIN;
        originalLogLevel = process.env.LOG_LEVEL;
        process.env.PILOTO_CODEX_BIN = "nonexistent-codex-binary-12345";
        process.env.LOG_LEVEL = "silent";
      });

      afterEach(() => {
        process.env.PILOTO_CODEX_BIN = originalBin;
        process.env.LOG_LEVEL = originalLogLevel;
      });

      test("throws AgentBinaryNotFoundError", async () => {
        const { workspaceId } = seedWorkspaceWithRepo();
        const call = startAgent({ workspaceId, backend: "codex", prompt: "test prompt" });
        await expect(call).rejects.toBeInstanceOf(AgentBinaryNotFoundError);
        await expect(call).rejects.toThrow(/nonexistent-codex-binary-12345/);
      });

      test("persists a session row marked as error when start fails", async () => {
        const { workspaceId } = seedWorkspaceWithRepo();
        const db = getDb();
        expect(db.select().from(agentSessions).all().length).toBe(0);

        await expect(
          startAgent({ workspaceId, backend: "codex", prompt: "test prompt" }),
        ).rejects.toBeInstanceOf(AgentBinaryNotFoundError);

        const rows = db.select().from(agentSessions).all();
        expect(rows).toHaveLength(1);
        expect(rows[0].workspaceId).toBe(workspaceId);
        expect(rows[0].backend).toBe("codex");
        expect(rows[0].status).toBe("error");
        expect(rows[0].errorMessage).toContain("nonexistent-codex-binary-12345");
      });
    });
  });

  describe("stopAgent", () => {
    test("throws NotFoundError for non-existent session", async () => {
      await expect(stopAgent("non-existent-session-id")).rejects.toBeInstanceOf(NotFoundError);
      await expect(stopAgent("non-existent-session-id")).rejects.toThrow(/AgentSession not found/);
    });

    test("stops orphaned agent session and updates database", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const sessionId = seedSession(workspaceId, { status: "running" });

      const result = await stopAgent(sessionId);
      expect(result.success).toBe(true);

      const session = getDb()
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, sessionId))
        .get();
      expect(session?.status).toBe("stopped");
    });
  });

  describe("listAgentSessions", () => {
    test("returns empty array when no sessions exist", () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      expect(listAgentSessions(workspaceId)).toEqual([]);
    });

    test("returns sessions for workspace", () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const sessionId = seedSession(workspaceId, { prompt: "test prompt" });

      const sessions = listAgentSessions(workspaceId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
      expect(sessions[0].backend).toBe("codex");
      expect(sessions[0].status).toBe("running");
    });

    test("filters by workspaceId", () => {
      const { workspaceId: workspaceId1 } = seedWorkspaceWithRepo();
      const { workspaceId: workspaceId2 } = seedWorkspaceWithRepo();

      const sessionId1 = seedSession(workspaceId1, { backend: "codex", prompt: "test1" });
      seedSession(workspaceId2, { backend: "claude", prompt: "test2" });

      const sessions = listAgentSessions(workspaceId1);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId1);
      expect(sessions[0].backend).toBe("codex");
    });
  });

  describe("getAgentSession", () => {
    test("returns session by id", () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const sessionId = seedSession(workspaceId, { prompt: "test prompt" });

      const session = getAgentSession(sessionId);
      expect(session.id).toBe(sessionId);
      expect(session.backend).toBe("codex");
      expect(session.status).toBe("running");
      expect(session.prompt).toBe("test prompt");
    });

    test("throws NotFoundError for non-existent session", () => {
      expect(() => getAgentSession("non-existent-id")).toThrow(NotFoundError);
      expect(() => getAgentSession("non-existent-id")).toThrow(/AgentSession not found/);
    });
  });
});

describe("codex.backend", () => {
  describe("createCodexBackend", () => {
    test("returns an AgentBackend shape", () => {
      const backend = createCodexBackend({ sessionId: randomUUID() });
      expect(backend.name).toBe("codex");
      expect(typeof backend.start).toBe("function");
      expect(typeof backend.sendPrompt).toBe("function");
      expect(typeof backend.stop).toBe("function");
      expect(typeof backend.onUpdate).toBe("function");
    });

    test("sendPrompt before start rejects", async () => {
      const backend = createCodexBackend({ sessionId: randomUUID() });
      await expect(backend.sendPrompt("hi")).rejects.toThrow(/not started/);
    });

    test("stop before start is a no-op", async () => {
      const backend = createCodexBackend({ sessionId: randomUUID() });
      await expect(backend.stop()).resolves.toBeUndefined();
    });
  });
});

describe("mapCodexNotification", () => {
  test("item/started with a tool itemType maps to tool_call", () => {
    const update = mapCodexNotification("item/started", {
      itemId: "item-1",
      itemType: "exec",
      title: "run ls",
    });
    expect(update).toEqual({
      kind: "tool_call",
      toolCallId: "item-1",
      title: "run ls",
      toolKind: "exec",
      status: "in_progress",
    });
  });

  test("item/started falls back to itemType for title when title is absent", () => {
    const update = mapCodexNotification("item/started", {
      itemId: "item-2",
      itemType: "read",
    });
    expect(update).toMatchObject({ kind: "tool_call", title: "read", toolKind: "read" });
  });

  test("item/started with itemType=agentMessage returns null", () => {
    expect(
      mapCodexNotification("item/started", {
        itemId: "item-3",
        itemType: "agentMessage",
      }),
    ).toBeNull();
  });

  test("item/agentMessage/delta maps to message", () => {
    const update = mapCodexNotification("item/agentMessage/delta", { delta: "Hello" });
    expect(update).toEqual({ kind: "message", text: "Hello" });
  });

  test("item/agentMessage/delta with empty delta returns null", () => {
    expect(mapCodexNotification("item/agentMessage/delta", { delta: "" })).toBeNull();
  });

  test("item/completed with a tool itemType maps to tool_call_update", () => {
    const update = mapCodexNotification("item/completed", {
      itemId: "item-4",
      itemType: "exec",
    });
    expect(update).toEqual({
      kind: "tool_call_update",
      toolCallId: "item-4",
      status: "completed",
      title: null,
    });
  });

  test("item/completed with itemType=agentMessage returns null", () => {
    expect(
      mapCodexNotification("item/completed", {
        itemId: "item-5",
        itemType: "agentMessage",
      }),
    ).toBeNull();
  });

  test("unknown method returns null", () => {
    expect(mapCodexNotification("some/other/method", {})).toBeNull();
  });
});
