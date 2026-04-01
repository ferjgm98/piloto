import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
	updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const workspaceRepos = sqliteTable("workspace_repos", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspaces.id),
	path: text("path").notNull(),
	defaultBranch: text("default_branch").default("main"),
});

export const agentSessions = sqliteTable("agent_sessions", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspaces.id),
	backend: text("backend").notNull(),
	status: text("status").default("idle"),
	createdAt: text("created_at").default(sql`(datetime('now'))`),
});
