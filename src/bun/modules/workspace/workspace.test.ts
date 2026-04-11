import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, initializeDatabase } from "../../db/database";
import { agentSessions, workspaceRepos, workspaces } from "../../db/schema";
import { resetTestDb } from "../../utils/test-setup";
import { createWorkspace, deleteWorkspace, listWorkspaces } from "./workspace.service";

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
    db.insert(agentSessions)
      .values({
        id: randomUUID(),
        workspaceId: workspace.id,
        backend: "codex",
        status: "idle",
      })
      .run();

    deleteWorkspace(workspace.id);

    expect(
      db.select().from(workspaces).where(eq(workspaces.id, workspace.id)).get(),
    ).toBeUndefined();
    expect(
      db.select().from(workspaceRepos).where(eq(workspaceRepos.workspaceId, workspace.id)).all(),
    ).toEqual([]);
    expect(
      db.select().from(agentSessions).where(eq(agentSessions.workspaceId, workspace.id)).all(),
    ).toEqual([]);
  });
});
