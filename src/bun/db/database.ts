import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { createLogger } from "../utils/logger";
import { runMigrations } from "./migrate";
import * as relations from "./relations";
import * as schema from "./schema";

const log = createLogger("database");
export type AppDatabase = BunSQLiteDatabase<typeof schema & typeof relations>;

let db: AppDatabase | undefined;

export async function initializeDatabase(options?: { path?: string }): Promise<AppDatabase> {
  if (db) {
    return db;
  }

  let dbPath = options?.path;
  if (!dbPath) {
    const { Utils } = await import("electrobun/bun");
    dbPath = join(Utils.paths.userData, "piloto.db");
  }

  if (dbPath !== ":memory:") {
    const dataDir = dirname(dbPath);
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(dbPath, { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const initializedDb = drizzle({
    client: sqlite,
    schema: { ...schema, ...relations },
  });

  runMigrations(initializedDb);
  db = initializedDb;

  // Mark any threads left "running" by a previous process as errored. The
  // in-memory thread registry is the source of truth for "is X actually
  // alive"; on a fresh boot it's empty, so any DB row claiming "running"
  // is necessarily stale. Without this sweep, startThread's MAX_CONCURRENT
  // and per-worktree-uniqueness admission checks (which gate off the
  // registry) would correctly admit new threads, but UI queries reading
  // straight from `threads` would still surface the orphan as live.
  const result = sqlite
    .query(
      `UPDATE threads
         SET status = 'error',
             error_message = 'orphaned at restart',
             updated_at = datetime('now')
       WHERE status = 'running'`,
    )
    .run();
  if (result.changes > 0) {
    log.info(`Reset ${result.changes} orphan running thread(s) at startup`);
  }

  log.info(`Database initialized at ${dbPath}`);

  return db;
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error("Database has not been initialized");
  }

  return db;
}
