import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { getDb } from "../../db/database";
import { workspaceRepos, workspaces } from "../../db/schema";

const reposOrdered = {
  repos: { orderBy: asc(workspaceRepos.order) },
} as const;
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceWithRepos,
} from "./workspace.types";

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("Workspace name must not be empty");
  }
  if (trimmed.length > 100) {
    throw new ValidationError("Workspace name must be at most 100 characters");
  }
  return trimmed;
}

function validateRepoPaths(paths: string[]): string[] {
  for (const p of paths) {
    if (!p.startsWith("/")) {
      throw new ValidationError(`Repo path must be absolute: ${p}`);
    }
  }
  return [...new Set(paths)];
}

function syncWorkspaceRepos(
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction type is complex and varies by driver
  tx: Parameters<Parameters<BunSQLiteDatabase<any>["transaction"]>[0]>[0],
  workspaceId: string,
  repoPaths: string[],
): void {
  const dedupedPaths = validateRepoPaths(repoPaths);
  tx.delete(workspaceRepos).where(eq(workspaceRepos.workspaceId, workspaceId)).run();
  for (let i = 0; i < dedupedPaths.length; i++) {
    const p = dedupedPaths[i];
    tx.insert(workspaceRepos)
      .values({
        id: randomUUID(),
        workspaceId,
        path: p,
        name: basename(p),
        order: i,
      })
      .run();
  }
}

export function getWorkspace(id: string): WorkspaceWithRepos {
  const db = getDb();
  const workspace = db.query.workspaces
    .findFirst({
      where: eq(workspaces.id, id),
      with: reposOrdered,
    })
    .sync();

  if (!workspace) {
    throw new NotFoundError("Workspace", id);
  }

  return workspace;
}

export function listWorkspaces(): WorkspaceWithRepos[] {
  const db = getDb();
  return db.query.workspaces
    .findMany({
      with: reposOrdered,
      orderBy: desc(workspaces.createdAt),
    })
    .sync();
}

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceWithRepos {
  const db = getDb();
  const id = randomUUID();
  const name = validateName(input.name);
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(workspaces)
      .values({
        id,
        name,
        description: input.description ?? null,
        defaultBranch: input.defaultBranch ?? "main",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    syncWorkspaceRepos(tx, id, input.repoPaths);
  });

  return getWorkspace(id);
}

export function updateWorkspace(id: string, input: UpdateWorkspaceInput): WorkspaceWithRepos {
  const db = getDb();

  // Verify workspace exists before updating
  const existing = db.query.workspaces
    .findFirst({
      where: eq(workspaces.id, id),
    })
    .sync();
  if (!existing) {
    throw new NotFoundError("Workspace", id);
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    updates.name = validateName(input.name);
  }
  if (input.description !== undefined) {
    updates.description = input.description;
  }
  if (input.defaultBranch !== undefined) {
    updates.defaultBranch = input.defaultBranch;
  }

  db.transaction((tx) => {
    // When only repoPaths changed and no scalar fields were provided,
    // explicitly set updatedAt so the workspace row reflects the change.
    // (Drizzle rejects .set({}) with "No values to set", and $onUpdate
    // only fires when .set() is called with actual fields.)
    if (input.repoPaths !== undefined && Object.keys(updates).length === 0) {
      updates.updatedAt = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      tx.update(workspaces).set(updates).where(eq(workspaces.id, id)).run();
    }

    if (input.repoPaths !== undefined) {
      syncWorkspaceRepos(tx, id, input.repoPaths);
    }
  });

  return getWorkspace(id);
}

export function deleteWorkspace(id: string): void {
  const db = getDb();
  db.delete(workspaces).where(eq(workspaces.id, id)).run();
}
