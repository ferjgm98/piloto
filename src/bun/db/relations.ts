import { relations } from "drizzle-orm";
import { activeWorktrees, agentSessions, workspaceRepos, workspaces } from "./schema";

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  repos: many(workspaceRepos),
  sessions: many(agentSessions),
}));

export const workspaceReposRelations = relations(workspaceRepos, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [workspaceRepos.workspaceId],
    references: [workspaces.id],
  }),
  worktrees: many(activeWorktrees),
}));

export const agentSessionsRelations = relations(agentSessions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [agentSessions.workspaceId],
    references: [workspaces.id],
  }),
}));

export const activeWorktreesRelations = relations(activeWorktrees, ({ one }) => ({
  repo: one(workspaceRepos, {
    fields: [activeWorktrees.repoId],
    references: [workspaceRepos.id],
  }),
  agentSession: one(agentSessions, {
    fields: [activeWorktrees.agentSessionId],
    references: [agentSessions.id],
  }),
}));
