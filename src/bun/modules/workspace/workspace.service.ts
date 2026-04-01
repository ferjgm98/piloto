import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/database";
import { workspaceRepos, workspaces } from "../../db/schema";
import type { CreateWorkspaceInput, Workspace } from "./workspace.types";

export function listWorkspaces(): Workspace[] {
  return db.select().from(workspaces).orderBy(desc(workspaces.createdAt)).all();
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(workspaces)
    .values({ id, name: input.name, createdAt: now, updatedAt: now })
    .run();

  for (const path of input.repoPaths) {
    db.insert(workspaceRepos)
      .values({
        id: randomUUID(),
        workspaceId: id,
        path,
        defaultBranch: "main",
      })
      .run();
  }

  return db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get() as Workspace;
}

export function deleteWorkspace(id: string): void {
  db.delete(workspaceRepos).where(eq(workspaceRepos.workspaceId, id)).run();
  db.delete(workspaces).where(eq(workspaces.id, id)).run();
}
