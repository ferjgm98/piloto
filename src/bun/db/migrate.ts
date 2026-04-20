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
  {
    sql: [
      "PRAGMA foreign_keys=OFF;",
      `CREATE TABLE \`__new_agent_sessions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`backend\` text NOT NULL,
	\`status\` text DEFAULT 'idle',
	\`created_at\` text DEFAULT (datetime('now')),
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`,
      `INSERT INTO \`__new_agent_sessions\`("id", "workspace_id", "backend", "status", "created_at") SELECT "id", "workspace_id", "backend", "status", "created_at" FROM \`agent_sessions\`;`,
      "DROP TABLE `agent_sessions`;",
      "ALTER TABLE `__new_agent_sessions` RENAME TO `agent_sessions`;",
      "PRAGMA foreign_keys=ON;",
      `CREATE TABLE \`__new_workspace_repos\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`path\` text NOT NULL,
	\`name\` text,
	\`default_branch\` text DEFAULT 'main',
	\`order\` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`,
      `INSERT INTO \`__new_workspace_repos\`("id", "workspace_id", "path", "name", "default_branch", "order") SELECT "id", "workspace_id", "path", NULL, "default_branch", 0 FROM \`workspace_repos\`;`,
      "DROP TABLE `workspace_repos`;",
      "ALTER TABLE `__new_workspace_repos` RENAME TO `workspace_repos`;",
      "ALTER TABLE `workspaces` ADD `description` text;",
      `ALTER TABLE \`workspaces\` ADD \`default_branch\` text DEFAULT 'main';`,
    ],
    bps: true,
    folderMillis: 1776053032063,
    hash: "",
  },
  {
    sql: [
      `CREATE TABLE \`active_worktrees\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`repo_id\` text NOT NULL,
	\`feature_name\` text,
	\`branch\` text NOT NULL,
	\`path\` text NOT NULL,
	\`agent_session_id\` text,
	\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
	\`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (\`repo_id\`) REFERENCES \`workspace_repos\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`agent_session_id\`) REFERENCES \`agent_sessions\`(\`id\`) ON UPDATE no action ON DELETE set null
);`,
    ],
    bps: true,
    folderMillis: 1776557419471,
    hash: "",
  },
  {
    sql: [
      "PRAGMA foreign_keys=OFF;",
      `CREATE TABLE \`__new_agent_sessions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`workspace_id\` text NOT NULL,
	\`worktree_id\` text,
	\`backend\` text NOT NULL,
	\`status\` text DEFAULT 'idle' NOT NULL,
	\`prompt\` text,
	\`error_message\` text,
	\`created_at\` text DEFAULT (datetime('now')) NOT NULL,
	\`updated_at\` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`,
      `INSERT INTO \`__new_agent_sessions\`("id", "workspace_id", "worktree_id", "backend", "status", "prompt", "error_message", "created_at", "updated_at") SELECT "id", "workspace_id", NULL, "backend", COALESCE("status", 'idle'), NULL, NULL, "created_at", "created_at" FROM \`agent_sessions\`;`,
      "DROP TABLE `agent_sessions`;",
      "ALTER TABLE `__new_agent_sessions` RENAME TO `agent_sessions`;",
      "PRAGMA foreign_keys=ON;",
    ],
    bps: true,
    folderMillis: 1776651417174,
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
