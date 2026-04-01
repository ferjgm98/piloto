import * as workspaceService from "./workspace.service";
import type { CreateWorkspaceInput, Workspace } from "./workspace.types";

export const workspaceHandlers = {
	requests: {
		listWorkspaces: async (): Promise<Workspace[]> => {
			return workspaceService.listWorkspaces();
		},
		createWorkspace: async (input: CreateWorkspaceInput): Promise<Workspace> => {
			return workspaceService.createWorkspace(input);
		},
		deleteWorkspace: async ({ id }: { id: string }): Promise<undefined> => {
			workspaceService.deleteWorkspace(id);
			return undefined;
		},
	},
	messages: {},
};
