import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Utils } from "electrobun/bun";
import { createLogger } from "../utils/logger";
import { runMigrations } from "./migrate";
import * as relations from "./relations";
import * as schema from "./schema";

const log = createLogger("database");

const dataDir = Utils.paths.userData;
mkdirSync(dataDir, { recursive: true });
const DB_PATH = join(dataDir, "piloto.db");

const sqlite = new Database(DB_PATH, { create: true });

sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA foreign_keys = ON");

export const db = drizzle({
  client: sqlite,
  schema: { ...schema, ...relations },
});

runMigrations(db);

log.info(`Database initialized at ${DB_PATH}`);
