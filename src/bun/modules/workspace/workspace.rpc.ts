import * as workspaceService from "./workspace.service";
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceWithRepos,
} from "./workspace.types";

export const workspaceHandlers = {
  requests: {
    listWorkspaces: async (): Promise<WorkspaceWithRepos[]> => {
      return workspaceService.listWorkspaces();
    },
    getWorkspace: async ({ id }: { id: string }): Promise<WorkspaceWithRepos> => {
      return workspaceService.getWorkspace(id);
    },
    createWorkspace: async (input: CreateWorkspaceInput): Promise<WorkspaceWithRepos> => {
      return workspaceService.createWorkspace(input);
    },
    updateWorkspace: async ({
      id,
      input,
    }: { id: string; input: UpdateWorkspaceInput }): Promise<WorkspaceWithRepos> => {
      return workspaceService.updateWorkspace(id, input);
    },
    deleteWorkspace: async ({ id }: { id: string }): Promise<undefined> => {
      workspaceService.deleteWorkspace(id);
      return undefined;
    },
  },
  messages: {},
};
