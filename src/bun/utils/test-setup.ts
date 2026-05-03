import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { AppDatabase } from "../db/database";
import { runMigrations } from "../db/migrate";
import * as relations from "../db/relations";
import {
  activeWorktrees,
  sessions,
  threadRepos,
  threads,
  workspaceRepos,
  workspaces,
} from "../db/schema";
import * as schema from "../db/schema";

export function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");

  const db = drizzle({
    client: sqlite,
    schema: { ...schema, ...relations },
  }) as AppDatabase;

  runMigrations(db);
  return db;
}

export function resetTestDb(db: AppDatabase): void {
  db.delete(threadRepos).run();
  db.delete(threads).run();
  db.delete(sessions).run();
  db.delete(activeWorktrees).run();
  db.delete(workspaceRepos).run();
  db.delete(workspaces).run();
}
