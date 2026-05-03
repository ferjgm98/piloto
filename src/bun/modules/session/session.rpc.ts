import type { SessionDTO } from "shared/rpc";
import * as sessionService from "./session.service";
import type { SessionRow } from "./session.types";

function toSessionDTO(row: SessionRow): SessionDTO {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const sessionHandlers = {
  requests: {
    listSessions: async ({ workspaceId }: { workspaceId: string }): Promise<SessionDTO[]> => {
      return sessionService.listSessionsByWorkspace(workspaceId).map(toSessionDTO);
    },
    getSession: async ({ id }: { id: string }): Promise<SessionDTO> => {
      return toSessionDTO(sessionService.getSession(id));
    },
    createSession: async ({
      workspaceId,
      name,
    }: {
      workspaceId: string;
      name: string;
    }): Promise<SessionDTO> => {
      return toSessionDTO(sessionService.createSession({ workspaceId, name }));
    },
    renameSession: async ({ id, name }: { id: string; name: string }): Promise<SessionDTO> => {
      return toSessionDTO(sessionService.renameSession({ id, name }));
    },
    deleteSession: async ({ id }: { id: string }): Promise<undefined> => {
      await sessionService.deleteSession(id);
      return undefined;
    },
  },
  messages: {},
};
