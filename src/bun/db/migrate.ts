import { createHash } from "node:crypto";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

/**
 * Embedded migrations for environments where filesystem access to migration
 * files is unavailable at runtime (e.g. Electrobun bundles to a temp file).
 *
 * When adding a new migration:
 * 1. Run `bun run db:generate` to create the .sql file
 * 2. Add the SQL content and journal metadata here
 */
const migrations: MigrationMeta[] = [
  {
    sql: [
      `CREATE TABLE IF NOT EXISTS \`agent_sessions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`backend\` text NOT NULL,
	\`status\` text DEFAULT 'idle',
	\`created_at\` text DEFAULT (datetime('now')),
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE TABLE IF NOT EXISTS \`workspace_repos\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`path\` text NOT NULL,
	\`default_branch\` text DEFAULT 'main',
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE no action
);`,
      `CREATE TABLE IF NOT EXISTS \`workspaces\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
	\`updated_at\` text DEFAULT (datetime('now')) NOT NULL
);`,
    ],
    bps: true,
    folderMillis: 1775050731233,
    hash: "",
  },
];

type EmbeddedMigrationDatabase = BunSQLiteDatabase<Record<string, unknown>> & {
  dialect: Pick<SQLiteSyncDialect, "migrate">;
  session: Parameters<SQLiteSyncDialect["migrate"]>[1];
};

// Compute hashes from the SQL content (same algorithm as drizzle-orm's readMigrationFiles)
for (const m of migrations) {
  const fullSql = m.sql.join("--> statement-breakpoint");
  m.hash = createHash("sha256").update(fullSql).digest("hex");
}

export function runMigrations(db: BunSQLiteDatabase<Record<string, unknown>>) {
  // Keep using embedded SQL because the bundled app does not ship the migrations
  // folder required by Drizzle's filesystem-based Bun migrator.
  const embeddedDb = db as EmbeddedMigrationDatabase;
  embeddedDb.dialect.migrate(migrations, embeddedDb.session);
}
