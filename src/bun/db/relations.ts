import { relations } from "drizzle-orm";
import {
  activeWorktrees,
  sessions,
  threadRepos,
  threads,
  workspaceRepos,
  workspaces,
} from "./schema";

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  repos: many(workspaceRepos),
  sessions: many(sessions),
}));

export const workspaceReposRelations = relations(workspaceRepos, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [workspaceRepos.workspaceId],
    references: [workspaces.id],
  }),
  worktrees: many(activeWorktrees),
  threadRepos: many(threadRepos),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [sessions.workspaceId],
    references: [workspaces.id],
  }),
  threads: many(threads),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  session: one(sessions, {
    fields: [threads.sessionId],
    references: [sessions.id],
  }),
  repos: many(threadRepos),
}));

export const threadReposRelations = relations(threadRepos, ({ one }) => ({
  thread: one(threads, {
    fields: [threadRepos.threadId],
    references: [threads.id],
  }),
  repo: one(workspaceRepos, {
    fields: [threadRepos.repoId],
    references: [workspaceRepos.id],
  }),
  worktree: one(activeWorktrees, {
    fields: [threadRepos.worktreeId],
    references: [activeWorktrees.id],
  }),
}));

export const activeWorktreesRelations = relations(activeWorktrees, ({ one, many }) => ({
  repo: one(workspaceRepos, {
    fields: [activeWorktrees.repoId],
    references: [workspaceRepos.id],
  }),
  threadRepos: many(threadRepos),
}));
