import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/database";
import { agentSessions, workspaceRepos, workspaces } from "../../db/schema";
import { NotFoundError } from "../../utils/errors";
import type { CreateWorkspaceInput, Workspace } from "./workspace.types";

export function listWorkspaces(): Workspace[] {
  const db = getDb();
  return db.select().from(workspaces).orderBy(desc(workspaces.createdAt)).all();
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(workspaces)
      .values({ id, name: input.name, createdAt: now, updatedAt: now })
      .run();

    for (const path of input.repoPaths) {
      tx.insert(workspaceRepos)
        .values({
          id: randomUUID(),
          workspaceId: id,
          path,
          defaultBranch: "main",
        })
        .run();
    }
  });

  const workspace = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();

  if (!workspace) {
    throw new NotFoundError("Workspace", id);
  }

  return workspace;
}

export function deleteWorkspace(id: string): void {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(agentSessions).where(eq(agentSessions.workspaceId, id)).run();
    tx.delete(workspaceRepos).where(eq(workspaceRepos.workspaceId, id)).run();
    tx.delete(workspaces).where(eq(workspaces.id, id)).run();
  });
}
