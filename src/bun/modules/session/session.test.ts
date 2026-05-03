import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
import {
  createSession,
  deleteSession,
  getSession,
  listSessionsByWorkspace,
  renameSession,
} from "./session.service";

function seedWorkspace(): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(workspaces)
    .values({
      id,
      name: "Test",
      description: null,
      defaultBranch: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("session.service", () => {
  beforeAll(async () => {
    await initializeDatabase({ path: ":memory:" });
  });

  beforeEach(() => {
    resetTestDb(getDb());
  });

  test("createSession persists row with workspace + name", () => {
    const wsId = seedWorkspace();
    const session = createSession({ workspaceId: wsId, name: "First session" });
    expect(session.id).toBeDefined();
    expect(session.workspaceId).toBe(wsId);
    expect(session.name).toBe("First session");

    const db = getDb();
    const row = db.select().from(sessions).where(eq(sessions.id, session.id)).get();
    expect(row?.name).toBe("First session");
  });

  test("createSession trims name and rejects empty/whitespace", () => {
    const wsId = seedWorkspace();
    expect(() => createSession({ workspaceId: wsId, name: "" })).toThrow(ValidationError);
    expect(() => createSession({ workspaceId: wsId, name: "   " })).toThrow(ValidationError);
    const session = createSession({ workspaceId: wsId, name: "  Trimmed  " });
    expect(session.name).toBe("Trimmed");
  });

  test("createSession throws NotFoundError for missing workspace", () => {
    expect(() => createSession({ workspaceId: "nope", name: "x" })).toThrow(NotFoundError);
  });

  test("listSessionsByWorkspace returns sessions ordered by updatedAt desc", async () => {
    const wsId = seedWorkspace();
    const a = createSession({ workspaceId: wsId, name: "A" });
    await new Promise((r) => setTimeout(r, 5));
    const b = createSession({ workspaceId: wsId, name: "B" });

    const list = listSessionsByWorkspace(wsId);
    expect(list.map((s) => s.id)).toEqual([b.id, a.id]);
  });

  test("getSession throws NotFoundError when missing", () => {
    expect(() => getSession("missing-id")).toThrow(NotFoundError);
  });

  test("renameSession updates name and trims input", () => {
    const wsId = seedWorkspace();
    const session = createSession({ workspaceId: wsId, name: "Old" });
    const renamed = renameSession({ id: session.id, name: "  New name  " });
    expect(renamed.name).toBe("New name");
  });

  test("renameSession rejects empty name", () => {
    const wsId = seedWorkspace();
    const session = createSession({ workspaceId: wsId, name: "Old" });
    expect(() => renameSession({ id: session.id, name: "  " })).toThrow(ValidationError);
  });

  test("deleteSession cascades to threads and thread_repos", async () => {
    const db = getDb();
    const wsId = seedWorkspace();
    const session = createSession({ workspaceId: wsId, name: "Cascade" });

    const repoId = randomUUID();
    const wtId = randomUUID();
    const threadId = randomUUID();
    const trId = randomUUID();
    const now = new Date().toISOString();

    db.insert(workspaceRepos)
      .values({
        id: repoId,
        workspaceId: wsId,
        path: "/tmp/repo",
        name: "repo",
        defaultBranch: null,
        order: 0,
      })
      .run();
    db.insert(activeWorktrees)
      .values({
        id: wtId,
        repoId,
        featureName: null,
        branch: "main",
        path: "/tmp/wt",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(threads)
      .values({
        id: threadId,
        sessionId: session.id,
        backend: "claude",
        status: "idle",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(threadRepos)
      .values({ id: trId, threadId, repoId, worktreeId: wtId, alias: "repo" })
      .run();

    await deleteSession(session.id);

    expect(db.select().from(sessions).where(eq(sessions.id, session.id)).get()).toBeUndefined();
    expect(db.select().from(threads).where(eq(threads.id, threadId)).get()).toBeUndefined();
    expect(db.select().from(threadRepos).where(eq(threadRepos.id, trId)).get()).toBeUndefined();
  });

  test("deleteSession throws NotFoundError when missing", async () => {
    await expect(deleteSession("missing-id")).rejects.toThrow(NotFoundError);
  });
});
