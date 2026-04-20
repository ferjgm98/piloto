import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { AgentBackendName, AgentStatus, AgentUpdateDTO } from "shared/rpc";
import { getDb } from "../../db/database";
import { activeWorktrees, agentSessions, workspaceRepos } from "../../db/schema";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { createLogger } from "../../utils/logger";
import type {
  AgentBackend,
  AgentSessionRow,
  AgentStatusChange,
  StartAgentInput,
} from "./agent.types";
import { createClaudeBackend } from "./backends/claude.backend";
import { createCodexBackend } from "./backends/codex.backend";

const log = createLogger("agent");

type AgentUpdateListener = (payload: { sessionId: string; chunk: AgentUpdateDTO }) => void;
type AgentStatusListener = (payload: AgentStatusChange) => void;

let updateListener: AgentUpdateListener | null = null;
let statusListener: AgentStatusListener | null = null;

export function setAgentUpdateNotifier(listener: AgentUpdateListener | null): void {
  updateListener = listener;
}

export function setAgentStatusNotifier(listener: AgentStatusListener | null): void {
  statusListener = listener;
}

interface RegistryEntry {
  backend: AgentBackend;
  workspaceId: string;
  worktreeId: string | null;
  stopping: boolean;
}

const registry = new Map<string, RegistryEntry>();

function isBackendName(v: string): v is AgentBackendName {
  return v === "claude" || v === "codex";
}

function updateSessionStatus(sessionId: string, status: AgentStatus, errorMessage?: string): void {
  const db = getDb();
  db.update(agentSessions)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agentSessions.id, sessionId))
    .run();
  statusListener?.({ sessionId, status, error: errorMessage });
}

function setWorktreeAgentBinding(worktreeId: string | null, sessionId: string | null): void {
  if (!worktreeId) return;
  const db = getDb();
  db.update(activeWorktrees)
    .set({ agentSessionId: sessionId, updatedAt: new Date().toISOString() })
    .where(eq(activeWorktrees.id, worktreeId))
    .run();
}

function resolveWorkingDir(input: StartAgentInput): string {
  const db = getDb();
  if (input.worktreeId) {
    const worktree = db
      .select()
      .from(activeWorktrees)
      .where(eq(activeWorktrees.id, input.worktreeId))
      .get();
    if (!worktree) throw new NotFoundError("ActiveWorktree", input.worktreeId);
    return worktree.path;
  }

  const firstRepo = db
    .select()
    .from(workspaceRepos)
    .where(eq(workspaceRepos.workspaceId, input.workspaceId))
    .orderBy(asc(workspaceRepos.order))
    .get();
  if (!firstRepo) {
    throw new ValidationError(
      `Workspace ${input.workspaceId} has no repos; cannot start an agent without a working directory`,
    );
  }
  return firstRepo.path;
}

function handleBackendExit(sessionId: string, code: number | null): void {
  const entry = registry.get(sessionId);
  if (!entry || entry.stopping) return;
  entry.stopping = true;
  setWorktreeAgentBinding(entry.worktreeId, null);
  const status: AgentStatus = code === 0 ? "stopped" : "error";
  const message = code === 0 ? undefined : `agent process exited with code ${code}`;
  updateSessionStatus(sessionId, status, message);
  registry.delete(sessionId);
}

function instantiateBackend(backend: AgentBackendName, sessionId: string): AgentBackend {
  const onExit = ({ code }: { code: number | null }) => handleBackendExit(sessionId, code);
  if (backend === "claude") {
    return createClaudeBackend({ sessionId, onExit });
  }
  return createCodexBackend({ sessionId, onExit });
}

export async function startAgent(input: StartAgentInput): Promise<{ sessionId: string }> {
  if (!isBackendName(input.backend)) {
    throw new ValidationError(`Unsupported agent backend: ${input.backend}`);
  }

  const workingDir = resolveWorkingDir(input);
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const db = getDb();

  db.insert(agentSessions)
    .values({
      id: sessionId,
      workspaceId: input.workspaceId,
      worktreeId: input.worktreeId ?? null,
      backend: input.backend,
      status: "running",
      prompt: input.prompt ?? null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  let backend: AgentBackend;
  try {
    backend = instantiateBackend(input.backend, sessionId);
    backend.onUpdate((update) => {
      updateListener?.({ sessionId, chunk: update });
    });
    await backend.start({ workingDir, prompt: input.prompt ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateSessionStatus(sessionId, "error", message);
    log.error(`startAgent failed for session ${sessionId}: ${message}`);
    throw err;
  }

  registry.set(sessionId, {
    backend,
    workspaceId: input.workspaceId,
    worktreeId: input.worktreeId ?? null,
    stopping: false,
  });
  setWorktreeAgentBinding(input.worktreeId ?? null, sessionId);
  statusListener?.({ sessionId, status: "running" });

  return { sessionId };
}

export async function stopAgent(sessionId: string): Promise<{ success: boolean }> {
  const entry = registry.get(sessionId);
  if (!entry) {
    const db = getDb();
    const row = db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).get();
    if (!row) throw new NotFoundError("AgentSession", sessionId);
    if (row.status === "running") {
      setWorktreeAgentBinding(row.worktreeId, null);
      updateSessionStatus(sessionId, "stopped");
    }
    return { success: true };
  }

  entry.stopping = true;
  try {
    await entry.backend.stop();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`stopAgent backend.stop threw: ${message}`);
  }

  registry.delete(sessionId);
  setWorktreeAgentBinding(entry.worktreeId, null);
  updateSessionStatus(sessionId, "stopped");
  return { success: true };
}

export function listAgentSessions(workspaceId: string): AgentSessionRow[] {
  const db = getDb();
  return db.select().from(agentSessions).where(eq(agentSessions.workspaceId, workspaceId)).all();
}

export function getAgentSession(sessionId: string): AgentSessionRow {
  const db = getDb();
  const row = db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).get();
  if (!row) throw new NotFoundError("AgentSession", sessionId);
  return row;
}
