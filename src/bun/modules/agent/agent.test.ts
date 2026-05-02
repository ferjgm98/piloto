import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AgentBackendName } from "shared/rpc";
import { getDb, initializeDatabase } from "../../db/database";
import { activeWorktrees, agentSessions, workspaceRepos, workspaces } from "../../db/schema";
import { AgentBinaryNotFoundError, NotFoundError, ValidationError } from "../../utils/errors";
import { resetTestDb } from "../../utils/test-setup";
import {
  MAX_CONCURRENT_AGENTS,
  _resetRegistryForTests,
  getAgentSession,
  listAgentSessions,
  sendPrompt,
  setAgentStatusNotifier,
  setAgentUpdateNotifier,
  setBackendFactoryForTests,
  startAgent,
  stopAgent,
  stopAllAgents,
  stopAllAgentsGlobal,
} from "./agent.service";
import type { AgentBackend } from "./agent.types";
import { createCodexBackend, mapCodexNotification } from "./backends/codex.backend";

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = original;
}

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

function seedWorktree(repoId: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb()
    .insert(activeWorktrees)
    .values({
      id,
      repoId,
      featureName: `feat-${id.slice(0, 6)}`,
      branch: `feature/${id.slice(0, 6)}`,
      path: `/tmp/test-worktree-${id.slice(0, 6)}`,
      agentSessionId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

interface MockBackendOptions {
  stopDelayMs?: number;
  stopThrows?: boolean;
  blockStop?: boolean;
  recordPrompts?: string[];
}

function makeMockBackend(opts: MockBackendOptions = {}): AgentBackend {
  return {
    name: "codex",
    start: async () => ({ sessionId: "" }),
    sendPrompt: async (prompt: string) => {
      opts.recordPrompts?.push(prompt);
    },
    stop: async () => {
      if (opts.blockStop) await new Promise(() => {});
      if (opts.stopDelayMs) await new Promise((r) => setTimeout(r, opts.stopDelayMs));
      if (opts.stopThrows) throw new Error("mock stop boom");
    },
    onUpdate: () => {},
  };
}

function installMockFactory(opts: MockBackendOptions = {}): void {
  setBackendFactoryForTests((_backend: AgentBackendName, _sessionId: string) =>
    makeMockBackend(opts),
  );
}

function seedSession(
  workspaceId: string,
  overrides: Partial<{
    backend: "claude" | "codex";
    status: "running" | "stopped" | "error";
    prompt: string;
    updatedAt: string;
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
      updatedAt: overrides.updatedAt ?? now,
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
    _resetRegistryForTests();
  });

  afterEach(() => {
    setAgentUpdateNotifier(null);
    setAgentStatusNotifier(null);
    setBackendFactoryForTests(null);
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
        restoreEnv("PILOTO_CODEX_BIN", originalBin);
        restoreEnv("LOG_LEVEL", originalLogLevel);
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

    test("sorts running sessions first, then by updatedAt desc", () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const olderRunning = seedSession(workspaceId, {
        status: "running",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
      const newerRunning = seedSession(workspaceId, {
        status: "running",
        updatedAt: "2026-01-02T00:00:00.000Z",
      });
      const newerStopped = seedSession(workspaceId, {
        status: "stopped",
        updatedAt: "2026-01-03T00:00:00.000Z",
      });
      const olderError = seedSession(workspaceId, {
        status: "error",
        updatedAt: "2026-01-01T12:00:00.000Z",
      });

      const ids = listAgentSessions(workspaceId).map((s) => s.id);
      expect(ids).toEqual([newerRunning, olderRunning, newerStopped, olderError]);
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

  describe("PIL-42 concurrency control", () => {
    test(`6th startAgent throws ValidationError when ${MAX_CONCURRENT_AGENTS} are running`, async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      installMockFactory();

      for (let i = 0; i < MAX_CONCURRENT_AGENTS; i++) {
        await startAgent({ workspaceId, backend: "codex", prompt: `p${i}` });
      }

      const overflow = startAgent({ workspaceId, backend: "codex", prompt: "overflow" });
      await expect(overflow).rejects.toBeInstanceOf(ValidationError);
      await expect(overflow).rejects.toThrow(
        new RegExp(`Maximum ${MAX_CONCURRENT_AGENTS} concurrent agents`),
      );
    });

    test("second startAgent on same worktree throws ValidationError", async () => {
      const { workspaceId, repoId } = seedWorkspaceWithRepo();
      const worktreeId = seedWorktree(repoId);
      installMockFactory();

      await startAgent({ workspaceId, worktreeId, backend: "codex", prompt: "first" });

      const second = startAgent({ workspaceId, worktreeId, backend: "codex", prompt: "second" });
      await expect(second).rejects.toBeInstanceOf(ValidationError);
      await expect(second).rejects.toThrow(/Worktree already has a running agent/);
    });

    test("stopping a session frees a slot for a new agent", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      installMockFactory();

      const sessions: string[] = [];
      for (let i = 0; i < MAX_CONCURRENT_AGENTS; i++) {
        const { sessionId } = await startAgent({
          workspaceId,
          backend: "codex",
          prompt: `p${i}`,
        });
        sessions.push(sessionId);
      }

      await stopAgent(sessions[0]);

      const { sessionId: freshId } = await startAgent({
        workspaceId,
        backend: "codex",
        prompt: "after-stop",
      });
      expect(freshId).toBeDefined();
    });

    test("workspaceId-only path (no worktree) does not clash on per-worktree check", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      installMockFactory();

      const a = await startAgent({ workspaceId, backend: "codex", prompt: "a" });
      const b = await startAgent({ workspaceId, backend: "codex", prompt: "b" });
      expect(a.sessionId).not.toBe(b.sessionId);
    });
  });

  describe("PIL-44 sendPrompt", () => {
    test("throws NotFoundError when registry has no entry", async () => {
      await expect(sendPrompt("missing-session-id", "hi")).rejects.toBeInstanceOf(NotFoundError);
    });

    test("throws ValidationError when entry is stopping", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const recorded: string[] = [];
      setBackendFactoryForTests(() =>
        makeMockBackend({ blockStop: true, recordPrompts: recorded }),
      );

      const { sessionId } = await startAgent({
        workspaceId,
        backend: "codex",
        prompt: "init",
      });

      void stopAgent(sessionId);
      await Promise.resolve();

      const call = sendPrompt(sessionId, "queued");
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toThrow(/is not running/);
      expect(recorded).not.toContain("queued");
    });

    test("delegates to backend.sendPrompt with the same prompt", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      const recorded: string[] = [];
      setBackendFactoryForTests(() => makeMockBackend({ recordPrompts: recorded }));

      const { sessionId } = await startAgent({
        workspaceId,
        backend: "codex",
        prompt: "init",
      });

      const result = await sendPrompt(sessionId, "hello agent");
      expect(result.success).toBe(true);
      expect(recorded).toContain("hello agent");
    });
  });

  describe("PIL-43 bulk teardown", () => {
    test("stopAllAgents stops every running session in workspace and returns count", async () => {
      const { workspaceId: wsA } = seedWorkspaceWithRepo();
      const { workspaceId: wsB } = seedWorkspaceWithRepo();
      installMockFactory();

      await startAgent({ workspaceId: wsA, backend: "codex", prompt: "a1" });
      await startAgent({ workspaceId: wsA, backend: "codex", prompt: "a2" });
      const { sessionId: bId } = await startAgent({
        workspaceId: wsB,
        backend: "codex",
        prompt: "b1",
      });

      const result = await stopAllAgents(wsA);
      expect(result.stopped).toBe(2);

      const wsARows = getDb()
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.workspaceId, wsA))
        .all();
      expect(wsARows.every((r) => r.status === "stopped")).toBe(true);

      const bRow = getDb().select().from(agentSessions).where(eq(agentSessions.id, bId)).get();
      expect(bRow?.status).toBe("running");
    });

    test("stopAllAgents is idempotent — second call returns { stopped: 0 }", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();
      installMockFactory();

      await startAgent({ workspaceId, backend: "codex", prompt: "a" });
      await startAgent({ workspaceId, backend: "codex", prompt: "b" });

      const first = await stopAllAgents(workspaceId);
      expect(first.stopped).toBe(2);

      const second = await stopAllAgents(workspaceId);
      expect(second.stopped).toBe(0);
    });

    test("stopAllAgentsGlobal stops sessions across every workspace", async () => {
      const { workspaceId: wsA } = seedWorkspaceWithRepo();
      const { workspaceId: wsB } = seedWorkspaceWithRepo();
      installMockFactory();

      await startAgent({ workspaceId: wsA, backend: "codex", prompt: "a1" });
      await startAgent({ workspaceId: wsB, backend: "codex", prompt: "b1" });
      await startAgent({ workspaceId: wsB, backend: "codex", prompt: "b2" });

      const result = await stopAllAgentsGlobal();
      expect(result.stopped).toBe(3);

      const allRows = getDb().select().from(agentSessions).all();
      expect(allRows.every((r) => r.status === "stopped")).toBe(true);
    });

    test("Promise.allSettled isolates a throwing backend.stop()", async () => {
      const { workspaceId } = seedWorkspaceWithRepo();

      let callCount = 0;
      setBackendFactoryForTests(() => {
        callCount += 1;
        return makeMockBackend({ stopThrows: callCount === 2 });
      });

      const a = await startAgent({ workspaceId, backend: "codex", prompt: "a" });
      const b = await startAgent({ workspaceId, backend: "codex", prompt: "b" });
      const c = await startAgent({ workspaceId, backend: "codex", prompt: "c" });

      const result = await stopAllAgents(workspaceId);
      expect(result.stopped).toBe(2);

      const rowA = getDb()
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, a.sessionId))
        .get();
      const rowB = getDb()
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, b.sessionId))
        .get();
      const rowC = getDb()
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.id, c.sessionId))
        .get();
      expect(rowA?.status).toBe("stopped");
      expect(rowB?.status).toBe("error");
      expect(rowB?.errorMessage).toContain("teardown failed");
      expect(rowC?.status).toBe("stopped");
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
