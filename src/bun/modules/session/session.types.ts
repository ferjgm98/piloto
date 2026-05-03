import type { InferSelectModel } from "drizzle-orm";
import type { sessions } from "../../db/schema";

export type SessionRow = InferSelectModel<typeof sessions>;

export interface CreateSessionInput {
  workspaceId: string;
  name: string;
}

export interface RenameSessionInput {
  id: string;
  name: string;
}
