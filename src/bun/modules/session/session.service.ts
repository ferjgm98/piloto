import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/database";
import { sessions, workspaces } from "../../db/schema";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { createLogger } from "../../utils/logger";
import { stopAllThreadsInSession } from "../thread/thread.service";
import type { CreateSessionInput, RenameSessionInput, SessionRow } from "./session.types";

const log = createLogger("session");

export function createSession(input: CreateSessionInput): SessionRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Session name cannot be empty");

  const db = getDb();
  const ws = db.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).get();
  if (!ws) throw new NotFoundError("Workspace", input.workspaceId);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(sessions)
    .values({
      id,
      workspaceId: input.workspaceId,
      name,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  log.info(`created session ${id} in workspace ${input.workspaceId}`);
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new Error("Failed to read back inserted session");
  return row;
}

export function listSessionsByWorkspace(workspaceId: string): SessionRow[] {
  const db = getDb();
  return db
    .select()
    .from(sessions)
    .where(eq(sessions.workspaceId, workspaceId))
    .orderBy(desc(sessions.updatedAt))
    .all();
}

export function getSession(id: string): SessionRow {
  const db = getDb();
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new NotFoundError("Session", id);
  return row;
}

export function renameSession(input: RenameSessionInput): SessionRow {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Session name cannot be empty");

  const db = getDb();
  const existing = db.select().from(sessions).where(eq(sessions.id, input.id)).get();
  if (!existing) throw new NotFoundError("Session", input.id);

  db.update(sessions)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(sessions.id, input.id))
    .run();

  const row = db.select().from(sessions).where(eq(sessions.id, input.id)).get();
  if (!row) throw new Error("Failed to read back renamed session");
  return row;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new NotFoundError("Session", id);
  // Stop running threads first; otherwise their bin processes orphan and the
  // cascaded thread_repos rows disappear, leaving worktrees registered as
  // free while the backend still holds them.
  await stopAllThreadsInSession(id);
  db.delete(sessions).where(eq(sessions.id, id)).run();
  log.info(`deleted session ${id}`);
}
