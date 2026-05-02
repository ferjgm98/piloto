import { randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
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

export const MAX_CONCURRENT_AGENTS = 5;

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
  backend: AgentBackend | null;
  workspaceId: string;
  worktreeId: string | null;
  stopping: boolean;
}

const registry = new Map<string, RegistryEntry>();

type BackendFactory = (backend: AgentBackendName, sessionId: string) => AgentBackend;

let backendFactory: BackendFactory | null = null;

export function setBackendFactoryForTests(factory: BackendFactory | null): void {
  backendFactory = factory;
}

export function _resetRegistryForTests(): void {
  registry.clear();
}

function isBackendName(v: string): v is AgentBackendName {
  return v === "claude" || v === "codex";
}

function countActiveRegistryEntries(): number {
  let n = 0;
  for (const e of registry.values()) if (!e.stopping) n++;
  return n;
}

function findRunningEntryForWorktree(worktreeId: string): string | null {
  for (const [sessionId, e] of registry.entries()) {
    if (!e.stopping && e.worktreeId === worktreeId) return sessionId;
  }
  return null;
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
  if (backendFactory) return backendFactory(backend, sessionId);
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

  if (countActiveRegistryEntries() >= MAX_CONCURRENT_AGENTS) {
    throw new ValidationError(
      `Maximum ${MAX_CONCURRENT_AGENTS} concurrent agents already running; stop one before starting another`,
    );
  }

  if (input.worktreeId) {
    const existingId = findRunningEntryForWorktree(input.worktreeId);
    if (existingId) {
      throw new ValidationError(`Worktree already has a running agent (session ${existingId})`);
    }
  }

  const sessionId = randomUUID();

  registry.set(sessionId, {
    backend: null,
    workspaceId: input.workspaceId,
    worktreeId: input.worktreeId ?? null,
    stopping: false,
  });

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
    registry.delete(sessionId);
    const message = err instanceof Error ? err.message : String(err);
    updateSessionStatus(sessionId, "error", message);
    log.error(`startAgent failed for session ${sessionId}: ${message}`);
    throw err;
  }

  const entry = registry.get(sessionId);
  if (entry) entry.backend = backend;
  setWorktreeAgentBinding(input.worktreeId ?? null, sessionId);
  statusListener?.({ sessionId, status: "running" });

  return { sessionId };
}

async function _stopAllInRegistry(
  predicate: (entry: RegistryEntry, sessionId: string) => boolean,
): Promise<{ stopped: string[]; failed: string[] }> {
  const matched: Array<[string, RegistryEntry]> = [];
  for (const [id, e] of registry.entries()) {
    if (!e.stopping && predicate(e, id)) {
      e.stopping = true;
      matched.push([id, e]);
    }
  }

  const results = await Promise.allSettled(
    matched.map(async ([id, e]) => {
      if (e.backend) await e.backend.stop();
      return id;
    }),
  );

  const stopped: string[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const [id, e] = matched[i];
    registry.delete(id);
    setWorktreeAgentBinding(e.worktreeId, null);
    if (r.status === "fulfilled") {
      stopped.push(id);
      updateSessionStatus(id, "stopped");
    } else {
      failed.push(id);
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      log.warn(`stopAll teardown failed for ${id}: ${reason}`);
      updateSessionStatus(id, "error", `teardown failed: ${reason}`);
    }
  });

  return { stopped, failed };
}

export async function stopAllAgents(workspaceId: string): Promise<{ stopped: number }> {
  const { stopped } = await _stopAllInRegistry((e) => e.workspaceId === workspaceId);
  return { stopped: stopped.length };
}

export async function stopAllAgentsGlobal(): Promise<{ stopped: number }> {
  const { stopped } = await _stopAllInRegistry(() => true);
  return { stopped: stopped.length };
}

export async function sendPrompt(sessionId: string, prompt: string): Promise<{ success: boolean }> {
  const entry = registry.get(sessionId);
  if (!entry) throw new NotFoundError("AgentSession", sessionId);
  if (entry.stopping || !entry.backend) {
    throw new ValidationError(`Cannot send prompt: session ${sessionId} is not running`);
  }
  await entry.backend.sendPrompt(prompt);
  return { success: true };
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
  if (entry.backend) {
    try {
      await entry.backend.stop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`stopAgent backend.stop threw: ${message}`);
    }
  }

  registry.delete(sessionId);
  setWorktreeAgentBinding(entry.worktreeId, null);
  updateSessionStatus(sessionId, "stopped");
  return { success: true };
}

export function listAgentSessions(workspaceId: string): AgentSessionRow[] {
  const db = getDb();
  return db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.workspaceId, workspaceId))
    .orderBy(
      sql`CASE WHEN ${agentSessions.status} = 'running' THEN 0 ELSE 1 END`,
      desc(agentSessions.updatedAt),
    )
    .all();
}

export function getAgentSession(sessionId: string): AgentSessionRow {
  const db = getDb();
  const row = db.select().from(agentSessions).where(eq(agentSessions.id, sessionId)).get();
  if (!row) throw new NotFoundError("AgentSession", sessionId);
  return row;
}
