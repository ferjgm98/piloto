import { relations } from "drizzle-orm";
import { agentSessions, workspaceRepos, workspaces } from "./schema";

export const workspacesRelations = relations(workspaces, ({ many }) => ({
	repos: many(workspaceRepos),
	sessions: many(agentSessions),
}));

export const workspaceReposRelations = relations(workspaceRepos, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceRepos.workspaceId],
		references: [workspaces.id],
	}),
}));

export const agentSessionsRelations = relations(agentSessions, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [agentSessions.workspaceId],
		references: [workspaces.id],
	}),
}));
