import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultBranch: text("default_branch").default("main"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

export const workspaceRepos = sqliteTable("workspace_repos", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  name: text("name"),
  defaultBranch: text("default_branch").default("main"),
  order: integer("order").notNull().default(0),
});

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  backend: text("backend").notNull(),
  status: text("status").default("idle"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const activeWorktrees = sqliteTable("active_worktrees", {
  id: text("id").primaryKey(),
  repoId: text("repo_id")
    .notNull()
    .references(() => workspaceRepos.id, { onDelete: "cascade" }),
  featureName: text("feature_name"),
  branch: text("branch").notNull(),
  path: text("path").notNull(),
  agentSessionId: text("agent_session_id").references(() => agentSessions.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
