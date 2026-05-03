import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  backend: text("backend", { enum: ["claude", "codex"] }).notNull(),
  model: text("model"),
  status: text("status", { enum: ["idle", "running", "stopped", "error"] })
    .notNull()
    .default("idle"),
  prompt: text("prompt"),
  errorMessage: text("error_message"),
  reasoningLevel: text("reasoning_level"),
  fastMode: integer("fast_mode", { mode: "boolean" }),
  planMode: integer("plan_mode", { mode: "boolean" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`)
    .$onUpdate(() => new Date().toISOString()),
});

export const threadRepos = sqliteTable(
  "thread_repos",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    repoId: text("repo_id")
      .notNull()
      .references(() => workspaceRepos.id, { onDelete: "cascade" }),
    worktreeId: text("worktree_id")
      .notNull()
      .references(() => activeWorktrees.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (t) => [
    uniqueIndex("thread_repos_thread_alias_idx").on(t.threadId, t.alias),
    // Non-unique: rows persist for stopped threads as history. Per-worktree
    // active-thread uniqueness is enforced at the service layer
    // (findRunningThreadForWorktree + isWorktreeBoundToActiveThread).
    // SQLite partial indexes can't reference threads.status across tables.
    index("thread_repos_worktree_idx").on(t.worktreeId),
  ],
);

export const activeWorktrees = sqliteTable("active_worktrees", {
  id: text("id").primaryKey(),
  repoId: text("repo_id")
    .notNull()
    .references(() => workspaceRepos.id, { onDelete: "cascade" }),
  featureName: text("feature_name"),
  branch: text("branch").notNull(),
  path: text("path").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
