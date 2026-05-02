import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, initializeDatabase } from "../../db/database";
import { sessions, threads, workspaceRepos, workspaces } from "../../db/schema";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { resetTestDb } from "../../utils/test-setup";
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from "./workspace.service";

describe("workspace.service", () => {
  beforeAll(async () => {
    await initializeDatabase({ path: ":memory:" });
  });

  beforeEach(() => {
    resetTestDb(getDb());
  });

  test("listWorkspaces returns an empty array for a fresh database", () => {
    expect(listWorkspaces()).toEqual([]);
  });

  test("createWorkspace persists the workspace and repo paths", () => {
    const workspace = createWorkspace({
      name: "Piloto",
      repoPaths: ["/tmp/piloto-api", "/tmp/piloto-web"],
    });

    const db = getDb();
    const storedWorkspace = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspace.id))
      .get();
    const repos = db
      .select()
      .from(workspaceRepos)
      .where(eq(workspaceRepos.workspaceId, workspace.id))
      .all();

    expect(storedWorkspace?.name).toBe("Piloto");
    expect(repos.map((repo) => repo.path).sort()).toEqual(["/tmp/piloto-api", "/tmp/piloto-web"]);
    expect(listWorkspaces().map((item) => item.id)).toContain(workspace.id);
  });

  test("createWorkspace is transactional when repo insertion fails", () => {
    expect(() =>
      createWorkspace({
        name: "Rollback",
        repoPaths: ["/tmp/valid-repo", undefined as unknown as string],
      }),
    ).toThrow();

    const db = getDb();
    expect(db.select().from(workspaces).where(eq(workspaces.name, "Rollback")).all()).toEqual([]);
    expect(db.select().from(workspaceRepos).all()).toEqual([]);
  });

  test("deleteWorkspace removes the workspace and dependent rows", () => {
    const workspace = createWorkspace({
      name: "Cleanup",
      repoPaths: ["/tmp/piloto-cleanup"],
    });

    const db = getDb();
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    db.insert(sessions)
      .values({
        id: sessionId,
        workspaceId: workspace.id,
        name: "Test session",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(threads)
      .values({
        id: randomUUID(),
        sessionId,
        backend: "codex",
        status: "idle",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    deleteWorkspace(workspace.id);

    expect(
      db.select().from(workspaces).where(eq(workspaces.id, workspace.id)).get(),
    ).toBeUndefined();
    expect(
      db.select().from(workspaceRepos).where(eq(workspaceRepos.workspaceId, workspace.id)).all(),
    ).toEqual([]);
    expect(db.select().from(sessions).where(eq(sessions.workspaceId, workspace.id)).all()).toEqual(
      [],
    );
  });

  // --- getWorkspace ---

  test("getWorkspace returns workspace with repos populated", () => {
    const created = createWorkspace({
      name: "Detail",
      repoPaths: ["/tmp/repo-a", "/tmp/repo-b"],
    });

    const workspace = getWorkspace(created.id);

    expect(workspace.id).toBe(created.id);
    expect(workspace.name).toBe("Detail");
    expect(workspace.repos).toHaveLength(2);
    expect(workspace.repos.map((r) => r.path).sort()).toEqual(["/tmp/repo-a", "/tmp/repo-b"]);
  });

  test("getWorkspace throws NotFoundError for missing workspace", () => {
    expect(() => getWorkspace("nonexistent-id")).toThrow(NotFoundError);
  });

  // --- createWorkspace validation ---

  test("createWorkspace throws ValidationError for empty name", () => {
    expect(() => createWorkspace({ name: "", repoPaths: [] })).toThrow(ValidationError);
    expect(() => createWorkspace({ name: "   ", repoPaths: [] })).toThrow(ValidationError);
  });

  test("createWorkspace throws ValidationError for name exceeding 100 chars", () => {
    expect(() => createWorkspace({ name: "x".repeat(101), repoPaths: [] })).toThrow(
      ValidationError,
    );
  });

  test("createWorkspace throws ValidationError for non-absolute repo path", () => {
    expect(() => createWorkspace({ name: "Test", repoPaths: ["relative/path"] })).toThrow(
      ValidationError,
    );
  });

  test("createWorkspace deduplicates repo paths", () => {
    const workspace = createWorkspace({
      name: "Dedup",
      repoPaths: ["/tmp/same", "/tmp/same", "/tmp/other"],
    });

    expect(workspace.repos).toHaveLength(2);
    expect(workspace.repos.map((r) => r.path).sort()).toEqual(["/tmp/other", "/tmp/same"]);
  });

  test("createWorkspace persists optional description and defaultBranch", () => {
    const workspace = createWorkspace({
      name: "Full",
      description: "A test workspace",
      defaultBranch: "develop",
      repoPaths: ["/tmp/repo"],
    });

    expect(workspace.description).toBe("A test workspace");
    expect(workspace.defaultBranch).toBe("develop");
  });

  test("createWorkspace returns repos with correct order and derived name", () => {
    const workspace = createWorkspace({
      name: "Ordered",
      repoPaths: ["/projects/backend", "/projects/frontend"],
    });

    expect(workspace.repos[0].path).toBe("/projects/backend");
    expect(workspace.repos[0].name).toBe("backend");
    expect(workspace.repos[0].order).toBe(0);
    expect(workspace.repos[1].path).toBe("/projects/frontend");
    expect(workspace.repos[1].name).toBe("frontend");
    expect(workspace.repos[1].order).toBe(1);
  });

  // --- updateWorkspace ---

  test("updateWorkspace updates scalar fields", () => {
    const created = createWorkspace({ name: "Before", repoPaths: ["/tmp/repo"] });
    const updated = updateWorkspace(created.id, {
      name: "After",
      description: "Updated description",
      defaultBranch: "develop",
    });

    expect(updated.name).toBe("After");
    expect(updated.description).toBe("Updated description");
    expect(updated.defaultBranch).toBe("develop");
    expect(updated.repos).toHaveLength(1);
  });

  test("updateWorkspace supports partial updates", () => {
    const created = createWorkspace({
      name: "Original",
      description: "Original desc",
      repoPaths: ["/tmp/repo"],
    });

    const updated = updateWorkspace(created.id, { description: "New desc" });

    expect(updated.name).toBe("Original");
    expect(updated.description).toBe("New desc");
  });

  test("updateWorkspace reconciles repoPaths", () => {
    const created = createWorkspace({
      name: "Repos",
      repoPaths: ["/tmp/old-a", "/tmp/old-b"],
    });

    const updated = updateWorkspace(created.id, {
      repoPaths: ["/tmp/new-a", "/tmp/new-b", "/tmp/new-c"],
    });

    expect(updated.repos).toHaveLength(3);
    expect(updated.repos.map((r) => r.path)).toEqual(["/tmp/new-a", "/tmp/new-b", "/tmp/new-c"]);
  });

  test("updateWorkspace throws NotFoundError for missing workspace", () => {
    expect(() => updateWorkspace("nonexistent-id", { name: "Nope" })).toThrow(NotFoundError);
  });

  test("updateWorkspace throws ValidationError for empty name", () => {
    const created = createWorkspace({ name: "Valid", repoPaths: [] });
    expect(() => updateWorkspace(created.id, { name: "" })).toThrow(ValidationError);
  });

  test("updateWorkspace throws ValidationError for non-absolute repo path", () => {
    const created = createWorkspace({ name: "Valid", repoPaths: [] });
    expect(() => updateWorkspace(created.id, { repoPaths: ["relative/path"] })).toThrow(
      ValidationError,
    );
  });

  test("updateWorkspace bumps updatedAt when only repoPaths change", () => {
    const created = createWorkspace({ name: "Touch", repoPaths: ["/tmp/repo"] });
    const originalUpdatedAt = created.updatedAt;

    // Small delay to ensure different timestamp
    const start = performance.now();
    while (performance.now() - start < 5) {
      /* busy wait for 5ms */
    }

    const updated = updateWorkspace(created.id, { repoPaths: ["/tmp/new-repo"] });
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });

  test("updateWorkspace deduplicates repo paths", () => {
    const created = createWorkspace({ name: "Dedup", repoPaths: ["/tmp/repo"] });
    const updated = updateWorkspace(created.id, {
      repoPaths: ["/tmp/a", "/tmp/a", "/tmp/b"],
    });

    expect(updated.repos).toHaveLength(2);
  });

  // --- listWorkspaces ---

  test("listWorkspaces returns workspaces with repos populated", () => {
    createWorkspace({ name: "WS1", repoPaths: ["/tmp/a"] });
    createWorkspace({ name: "WS2", repoPaths: ["/tmp/b", "/tmp/c"] });

    const all = listWorkspaces();

    expect(all).toHaveLength(2);
    expect(all.every((ws) => Array.isArray(ws.repos))).toBe(true);
    const ws2 = all.find((ws) => ws.name === "WS2");
    expect(ws2?.repos).toHaveLength(2);
  });
});
