import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { AgentBackendName } from "shared/rpc";
import { getDb, initializeDatabase } from "../../db/database";
import {
  activeWorktrees,
  sessions,
  threadRepos,
  threads,
  workspaceRepos,
  workspaces,
} from "../../db/schema";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { resetTestDb } from "../../utils/test-setup";
import { cleanupThreadSessionDir } from "./thread-session-dir/thread-session-dir.service";
import {
  MAX_CONCURRENT_THREADS,
  _resetRegistryForTests,
  getThread,
  isWorktreeBoundToActiveThread,
  sendPrompt,
  setBackendFactoryForTests,
  startThread,
  stopAllThreads,
  stopAllThreadsGlobal,
  stopThread,
  updateThreadSettings,
} from "./thread.service";
import type { ThreadBackend } from "./thread.types";

const createdThreadIds: string[] = [];
const tmpDirs: string[] = [];

function fakeBackendFactory(name: AgentBackendName): ThreadBackend {
  return {
    name,
    start: async () => ({ sessionId: "fake" }),
    sendPrompt: async () => {},
    stop: async () => {},
    onUpdate: () => {},
  };
}

async function seedFixture(): Promise<{
  workspaceId: string;
  sessionId: string;
  repoId: string;
  worktreeId: string;
  worktreePath: string;
}> {
  const db = getDb();
  const tmp = await mkdtemp(join(tmpdir(), "piloto-thread-"));
  tmpDirs.push(tmp);
  const worktreePath = join(tmp, "wt");
  await mkdir(worktreePath, { recursive: true });

  const workspaceId = randomUUID();
  const sessionId = randomUUID();
  const repoId = randomUUID();
  const worktreeId = randomUUID();
  const now = new Date().toISOString();

  db.insert(workspaces)
    .values({
      id: workspaceId,
      name: "Test ws",
      description: null,
      defaultBranch: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(sessions)
    .values({
      id: sessionId,
      workspaceId,
      name: "Test session",
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
      defaultBranch: null,
      order: 0,
    })
    .run();
  db.insert(activeWorktrees)
    .values({
      id: worktreeId,
      repoId,
      featureName: "feat",
      branch: "feat-branch",
      path: worktreePath,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return { workspaceId, sessionId, repoId, worktreeId, worktreePath };
}

async function spawn(sessionId: string, repoId: string, worktreeId: string): Promise<string> {
  const result = await startThread({
    sessionId,
    backend: "claude",
    bindings: [{ repoId, worktreeId }],
  });
  createdThreadIds.push(result.threadId);
  return result.threadId;
}

describe("thread.service", () => {
  beforeAll(async () => {
    await initializeDatabase({ path: ":memory:" });
  });

  beforeEach(() => {
    resetTestDb(getDb());
    _resetRegistryForTests();
    setBackendFactoryForTests(fakeBackendFactory);
  });

  afterEach(async () => {
    setBackendFactoryForTests(null);
    while (createdThreadIds.length > 0) {
      const id = createdThreadIds.pop();
      if (id) await cleanupThreadSessionDir(id).catch(() => {});
    }
    while (tmpDirs.length > 0) {
      const d = tmpDirs.pop();
      if (d) await rm(d, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("startThread inserts thread + thread_repos and registers entry", async () => {
    const f = await seedFixture();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);

    const db = getDb();
    const row = db.select().from(threads).where(eq(threads.id, threadId)).get();
    expect(row?.status).toBe("running");
    expect(row?.backend).toBe("claude");

    const repos = db.select().from(threadRepos).where(eq(threadRepos.threadId, threadId)).all();
    expect(repos).toHaveLength(1);
    expect(repos[0].alias).toBe("test-repo");
    expect(repos[0].worktreeId).toBe(f.worktreeId);
  });

  test("startThread alias falls back to basename when repo.name is null", async () => {
    const db = getDb();
    const f = await seedFixture();
    db.update(workspaceRepos)
      .set({ name: null, path: "/tmp/anon" })
      .where(eq(workspaceRepos.id, f.repoId))
      .run();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    const repos = db.select().from(threadRepos).where(eq(threadRepos.threadId, threadId)).all();
    expect(repos[0].alias).toBe("anon");
  });

  test("startThread rejects bindings with worktree not in repo", async () => {
    const f = await seedFixture();
    const otherRepo = randomUUID();
    const db = getDb();
    db.insert(workspaceRepos)
      .values({
        id: otherRepo,
        workspaceId: f.workspaceId,
        path: "/tmp/other",
        name: "other",
        defaultBranch: null,
        order: 1,
      })
      .run();

    await expect(
      startThread({
        sessionId: f.sessionId,
        backend: "claude",
        bindings: [{ repoId: otherRepo, worktreeId: f.worktreeId }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  test("startThread rejects empty bindings", async () => {
    const f = await seedFixture();
    await expect(
      startThread({ sessionId: f.sessionId, backend: "claude", bindings: [] }),
    ).rejects.toThrow(ValidationError);
  });

  test("startThread enforces concurrency cap", async () => {
    const fixtures = [];
    for (let i = 0; i < MAX_CONCURRENT_THREADS; i++) {
      fixtures.push(await seedFixture());
    }
    for (const f of fixtures) {
      await spawn(f.sessionId, f.repoId, f.worktreeId);
    }

    const overflow = await seedFixture();
    await expect(spawn(overflow.sessionId, overflow.repoId, overflow.worktreeId)).rejects.toThrow(
      ValidationError,
    );
  });

  test("startThread rejects duplicate worktree binding while another is running", async () => {
    const f = await seedFixture();
    await spawn(f.sessionId, f.repoId, f.worktreeId);

    const otherSession = randomUUID();
    const now = new Date().toISOString();
    getDb()
      .insert(sessions)
      .values({
        id: otherSession,
        workspaceId: f.workspaceId,
        name: "Other",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await expect(
      startThread({
        sessionId: otherSession,
        backend: "claude",
        bindings: [{ repoId: f.repoId, worktreeId: f.worktreeId }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  test("isWorktreeBoundToActiveThread reflects running threads", async () => {
    const f = await seedFixture();
    expect(isWorktreeBoundToActiveThread(f.worktreeId)).toBe(false);
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    expect(isWorktreeBoundToActiveThread(f.worktreeId)).toBe(true);
    await stopThread(threadId);
    expect(isWorktreeBoundToActiveThread(f.worktreeId)).toBe(false);
  });

  test("sendPrompt throws NotFoundError when threadId missing", async () => {
    await expect(sendPrompt("missing-id", "hi")).rejects.toThrow(NotFoundError);
  });

  test("sendPrompt throws NotFoundError after thread is stopped", async () => {
    const f = await seedFixture();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    await stopThread(threadId);
    await expect(sendPrompt(threadId, "hi")).rejects.toThrow(NotFoundError);
  });

  test("updateThreadSettings forbids backend change after first message", async () => {
    const f = await seedFixture();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    await sendPrompt(threadId, "hello");
    expect(() => updateThreadSettings({ threadId, backend: "codex" })).toThrow(ValidationError);
  });

  test("updateThreadSettings allows model/reasoning/fast/plan changes", async () => {
    const f = await seedFixture();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    const updated = updateThreadSettings({
      threadId,
      model: "sonnet",
      reasoningLevel: "high",
      fastMode: true,
      planMode: false,
    });
    expect(updated.model).toBe("sonnet");
    expect(updated.reasoningLevel).toBe("high");
    expect(updated.fastMode).toBe(true);
    expect(updated.planMode).toBe(false);
  });

  test("stopThread is idempotent on already-stopped threads", async () => {
    const f = await seedFixture();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    await stopThread(threadId);
    await stopThread(threadId);
  });

  test("stopAllThreads only stops threads in the given workspace", async () => {
    const a = await seedFixture();
    const b = await seedFixture();
    const tA = await spawn(a.sessionId, a.repoId, a.worktreeId);
    const tB = await spawn(b.sessionId, b.repoId, b.worktreeId);

    const result = await stopAllThreads(a.workspaceId);
    expect(result.stopped).toBe(1);

    expect(isWorktreeBoundToActiveThread(a.worktreeId)).toBe(false);
    expect(isWorktreeBoundToActiveThread(b.worktreeId)).toBe(true);

    await stopThread(tB);
    void tA;
  });

  test("stopAllThreads is idempotent", async () => {
    const f = await seedFixture();
    await spawn(f.sessionId, f.repoId, f.worktreeId);
    const first = await stopAllThreads(f.workspaceId);
    expect(first.stopped).toBe(1);
    const second = await stopAllThreads(f.workspaceId);
    expect(second.stopped).toBe(0);
  });

  test("stopAllThreadsGlobal stops every running thread", async () => {
    const a = await seedFixture();
    const b = await seedFixture();
    await spawn(a.sessionId, a.repoId, a.worktreeId);
    await spawn(b.sessionId, b.repoId, b.worktreeId);
    const result = await stopAllThreadsGlobal();
    expect(result.stopped).toBe(2);
    const again = await stopAllThreadsGlobal();
    expect(again.stopped).toBe(0);
  });

  test("getThread returns thread with workspaceId and repos", async () => {
    const f = await seedFixture();
    const threadId = await spawn(f.sessionId, f.repoId, f.worktreeId);
    const result = getThread(threadId);
    expect(result.thread.id).toBe(threadId);
    expect(result.workspaceId).toBe(f.workspaceId);
    expect(result.repos).toHaveLength(1);
  });

  test("getThread throws NotFoundError when missing", () => {
    expect(() => getThread("missing-id")).toThrow(NotFoundError);
  });
});
