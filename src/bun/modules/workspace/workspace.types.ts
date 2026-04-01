import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { workspaceRepos, workspaces } from "../../db/schema";

export type Workspace = InferSelectModel<typeof workspaces>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;
export type WorkspaceRepo = InferSelectModel<typeof workspaceRepos>;

export interface CreateWorkspaceInput {
  name: string;
  repoPaths: string[];
}
