import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Utils } from "electrobun/bun";
import { createLogger } from "../utils/logger";
import { runMigrations } from "./migrate";
import * as relations from "./relations";
import * as schema from "./schema";

const log = createLogger("database");
type AppDatabase = BunSQLiteDatabase<typeof schema & typeof relations>;

let db: AppDatabase | undefined;

export async function initializeDatabase(): Promise<AppDatabase> {
  if (db) {
    return db;
  }

  const dataDir = Utils.paths.userData;
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "piloto.db");

  const sqlite = new Database(dbPath, { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const initializedDb = drizzle({
    client: sqlite,
    schema: { ...schema, ...relations },
  });

  runMigrations(initializedDb);
  db = initializedDb;

  log.info(`Database initialized at ${dbPath}`);

  return db;
}

export function getDb(): AppDatabase {
  if (!db) {
    throw new Error("Database has not been initialized");
  }

  return db;
}
