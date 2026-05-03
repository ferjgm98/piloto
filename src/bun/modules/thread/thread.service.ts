import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AgentBackendName, AgentStatus, AgentUpdateDTO } from "shared/rpc";
import { getDb } from "../../db/database";
import { activeWorktrees, sessions, threadRepos, threads, workspaceRepos } from "../../db/schema";
import { InternalError, NotFoundError, ValidationError } from "../../utils/errors";
import { createLogger } from "../../utils/logger";
import { createClaudeBackend } from "./backends/claude.backend";
import { createCodexBackend } from "./backends/codex.backend";
import {
  cleanupThreadSessionDir,
  createThreadSessionDir,
} from "./thread-session-dir/thread-session-dir.service";
import type {
  StartThreadInput,
  ThreadBackend,
  ThreadBindingInput,
  ThreadRepoRow,
  ThreadRow,
  ThreadStatusChange,
} from "./thread.types";

const log = createLogger("thread");

export const MAX_CONCURRENT_THREADS = 5;

type ThreadUpdateListener = (payload: { threadId: string; chunk: AgentUpdateDTO }) => void;
type ThreadStatusListener = (payload: ThreadStatusChange) => void;

let updateListener: ThreadUpdateListener | null = null;
let statusListener: ThreadStatusListener | null = null;

export function setThreadUpdateNotifier(listener: ThreadUpdateListener | null): void {
  updateListener = listener;
}

export function setThreadStatusNotifier(listener: ThreadStatusListener | null): void {
  statusListener = listener;
}

interface RegistryEntry {
  backend: ThreadBackend | null;
  workspaceId: string;
  sessionId: string;
  worktreeIds: string[];
  promptsSent: number;
  stopping: boolean;
}

const registry = new Map<string, RegistryEntry>();

// Per-thread ring buffer of streamed updates so a freshly-mounted view (or a
// view re-mounted after switching threads) can hydrate the log instead of
// starting empty. Capped to bound memory; oldest chunks are dropped.
const OUTPUT_BUFFER_LIMIT = 1000;
const outputBuffers = new Map<string, AgentUpdateDTO[]>();

function appendToOutputBuffer(threadId: string, chunk: AgentUpdateDTO): void {
  const buf = outputBuffers.get(threadId) ?? [];
  buf.push(chunk);
  if (buf.length > OUTPUT_BUFFER_LIMIT) buf.splice(0, buf.length - OUTPUT_BUFFER_LIMIT);
  outputBuffers.set(threadId, buf);
}

export function getThreadOutput(threadId: string): AgentUpdateDTO[] {
  return outputBuffers.get(threadId)?.slice() ?? [];
}

type BackendFactory = (backend: AgentBackendName, threadId: string) => ThreadBackend;

let backendFactory: BackendFactory | null = null;

export function setBackendFactoryForTests(factory: BackendFactory | null): void {
  backendFactory = factory;
}

export function _resetRegistryForTests(): void {
  registry.clear();
  outputBuffers.clear();
}

function isBackendName(v: string): v is AgentBackendName {
  return v === "claude" || v === "codex";
}

function countActiveRegistryEntries(): number {
  let n = 0;
  for (const e of registry.values()) if (!e.stopping) n++;
  return n;
}

function findRunningThreadForWorktree(worktreeId: string): string | null {
  for (const [threadId, e] of registry.entries()) {
    if (!e.stopping && e.worktreeIds.includes(worktreeId)) return threadId;
  }
  return null;
}

function lookupThreadScope(threadId: string): { workspaceId: string; sessionId: string } | null {
  const entry = registry.get(threadId);
  if (entry) return { workspaceId: entry.workspaceId, sessionId: entry.sessionId };
  const db = getDb();
  const row = db
    .select({ sessionId: threads.sessionId, workspaceId: sessions.workspaceId })
    .from(threads)
    .innerJoin(sessions, eq(sessions.id, threads.sessionId))
    .where(eq(threads.id, threadId))
    .get();
  return row ?? null;
}

function updateThreadStatus(threadId: string, status: AgentStatus, errorMessage?: string): void {
  const db = getDb();
  db.update(threads)
    .set({
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(threads.id, threadId))
    .run();
  const scope = lookupThreadScope(threadId);
  if (scope) {
    statusListener?.({ threadId, ...scope, status, error: errorMessage });
  }
}

function assertSafeAlias(alias: string): void {
  if (
    alias === "." ||
    alias === ".." ||
    alias.includes("/") ||
    alias.includes("\\") ||
    alias.includes("\0")
  ) {
    throw new ValidationError(
      `Alias '${alias}' is invalid: must be a single path segment without separators`,
    );
  }
}

function defaultAliasFor(repoId: string): string {
  const db = getDb();
  const repo = db.select().from(workspaceRepos).where(eq(workspaceRepos.id, repoId)).get();
  if (!repo) throw new NotFoundError("WorkspaceRepo", repoId);
  const fromName = repo.name?.trim();
  if (fromName) return fromName;
  const fromPath = basename(repo.path).trim();
  if (!fromPath) throw new ValidationError(`Cannot derive alias for repo ${repoId}`);
  return fromPath;
}

interface ResolvedBinding {
  repoId: string;
  worktreeId: string;
  alias: string;
  worktreePath: string;
}

function resolveBindings(workspaceId: string, bindings: ThreadBindingInput[]): ResolvedBinding[] {
  if (bindings.length === 0) {
    throw new ValidationError("At least one binding is required to start a thread");
  }
  const db = getDb();
  const seenAlias = new Set<string>();
  const seenWorktree = new Set<string>();
  const resolved: ResolvedBinding[] = [];

  for (const b of bindings) {
    const repo = db.select().from(workspaceRepos).where(eq(workspaceRepos.id, b.repoId)).get();
    if (!repo) throw new NotFoundError("WorkspaceRepo", b.repoId);
    if (repo.workspaceId !== workspaceId) {
      throw new ValidationError(`Repo ${b.repoId} does not belong to workspace ${workspaceId}`);
    }

    const worktree = db
      .select()
      .from(activeWorktrees)
      .where(eq(activeWorktrees.id, b.worktreeId))
      .get();
    if (!worktree) throw new NotFoundError("ActiveWorktree", b.worktreeId);
    if (worktree.repoId !== b.repoId) {
      throw new ValidationError(`Worktree ${b.worktreeId} does not belong to repo ${b.repoId}`);
    }

    const alias = (b.alias?.trim() || defaultAliasFor(b.repoId)).trim();
    if (!alias) {
      throw new ValidationError(`Alias cannot be empty for repo ${b.repoId}`);
    }
    assertSafeAlias(alias);
    if (seenAlias.has(alias)) {
      throw new ValidationError(`Alias '${alias}' is duplicated within bindings`);
    }
    if (seenWorktree.has(b.worktreeId)) {
      throw new ValidationError(`Worktree ${b.worktreeId} is duplicated within bindings`);
    }
    seenAlias.add(alias);
    seenWorktree.add(b.worktreeId);
    resolved.push({
      repoId: b.repoId,
      worktreeId: b.worktreeId,
      alias,
      worktreePath: worktree.path,
    });
  }
  return resolved;
}

function handleBackendExit(threadId: string, code: number | null): void {
  const entry = registry.get(threadId);
  if (!entry || entry.stopping) return;
  entry.stopping = true;
  const status: AgentStatus = code === 0 ? "stopped" : "error";
  const message = code === 0 ? undefined : `thread process exited with code ${code}`;
  updateThreadStatus(threadId, status, message);
  registry.delete(threadId);
  void cleanupThreadSessionDir(threadId).catch((err: Error) => {
    log.warn(`cleanupThreadSessionDir(${threadId}) failed: ${err.message}`);
  });
}

function instantiateBackend(backend: AgentBackendName, threadId: string): ThreadBackend {
  if (backendFactory) return backendFactory(backend, threadId);
  const onExit = ({ code }: { code: number | null }) => handleBackendExit(threadId, code);
  if (backend === "claude") {
    return createClaudeBackend({ sessionId: threadId, onExit });
  }
  return createCodexBackend({ sessionId: threadId, onExit });
}

export async function startThread(input: StartThreadInput): Promise<{ threadId: string }> {
  if (!isBackendName(input.backend)) {
    throw new ValidationError(`Unsupported agent backend: ${input.backend}`);
  }

  const db = getDb();
  const session = db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get();
  if (!session) throw new NotFoundError("Session", input.sessionId);

  const resolved = resolveBindings(session.workspaceId, input.bindings);

  if (countActiveRegistryEntries() >= MAX_CONCURRENT_THREADS) {
    throw new ValidationError(
      `Maximum ${MAX_CONCURRENT_THREADS} concurrent threads already running; stop one before starting another`,
    );
  }

  for (const b of resolved) {
    const existingId = findRunningThreadForWorktree(b.worktreeId);
    if (existingId) {
      throw new ValidationError(
        `Worktree ${b.worktreeId} is already bound to a running thread (${existingId})`,
      );
    }
  }

  const threadId = randomUUID();

  registry.set(threadId, {
    backend: null,
    workspaceId: session.workspaceId,
    sessionId: input.sessionId,
    worktreeIds: resolved.map((b) => b.worktreeId),
    promptsSent: 0,
    stopping: false,
  });

  const now = new Date().toISOString();
  try {
    db.transaction((tx) => {
      tx.insert(threads)
        .values({
          id: threadId,
          sessionId: input.sessionId,
          backend: input.backend,
          model: null,
          status: "running",
          prompt: input.prompt ?? null,
          errorMessage: null,
          reasoningLevel: null,
          fastMode: null,
          planMode: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const b of resolved) {
        tx.insert(threadRepos)
          .values({
            id: randomUUID(),
            threadId,
            repoId: b.repoId,
            worktreeId: b.worktreeId,
            alias: b.alias,
          })
          .run();
      }
    });
  } catch (err) {
    registry.delete(threadId);
    throw err;
  }

  let workingDir: string;
  try {
    workingDir = await createThreadSessionDir(
      threadId,
      resolved.map((b) => ({ alias: b.alias, worktreePath: b.worktreePath })),
    );
  } catch (err) {
    registry.delete(threadId);
    const message = err instanceof Error ? err.message : String(err);
    updateThreadStatus(threadId, "error", message);
    throw err;
  }

  let backend: ThreadBackend;
  try {
    backend = instantiateBackend(input.backend, threadId);
    backend.onUpdate((update) => {
      appendToOutputBuffer(threadId, update);
      updateListener?.({ threadId, chunk: update });
    });
    await backend.start({ workingDir, prompt: input.prompt ?? "" });
  } catch (err) {
    registry.delete(threadId);
    const message = err instanceof Error ? err.message : String(err);
    updateThreadStatus(threadId, "error", message);
    await cleanupThreadSessionDir(threadId).catch(() => {});
    log.error(`startThread failed for thread ${threadId}: ${message}`);
    throw err;
  }

  const entry = registry.get(threadId);
  if (entry) {
    entry.backend = backend;
    if (input.prompt && input.prompt.length > 0) entry.promptsSent += 1;
  }
  statusListener?.({
    threadId,
    workspaceId: session.workspaceId,
    sessionId: input.sessionId,
    status: "running",
  });

  return { threadId };
}

async function _stopAllInRegistry(
  predicate: (entry: RegistryEntry, threadId: string) => boolean,
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
    const [id] = matched[i];
    registry.delete(id);
    void cleanupThreadSessionDir(id).catch((err: Error) => {
      log.warn(`cleanupThreadSessionDir(${id}) failed: ${err.message}`);
    });
    if (r.status === "fulfilled") {
      stopped.push(id);
      updateThreadStatus(id, "stopped");
    } else {
      failed.push(id);
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      log.warn(`stopAll teardown failed for ${id}: ${reason}`);
      updateThreadStatus(id, "error", `teardown failed: ${reason}`);
    }
  });

  return { stopped, failed };
}

export async function stopAllThreads(workspaceId: string): Promise<{ stopped: number }> {
  const { stopped } = await _stopAllInRegistry((e) => e.workspaceId === workspaceId);
  return { stopped: stopped.length };
}

export async function stopAllThreadsGlobal(): Promise<{ stopped: number }> {
  const { stopped } = await _stopAllInRegistry(() => true);
  return { stopped: stopped.length };
}

export async function stopAllThreadsInSession(sessionId: string): Promise<{ stopped: number }> {
  const db = getDb();
  const rows = db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.sessionId, sessionId))
    .all();
  const ids = new Set(rows.map((r) => r.id));
  const { stopped } = await _stopAllInRegistry((_e, threadId) => ids.has(threadId));
  return { stopped: stopped.length };
}

export async function sendPrompt(threadId: string, prompt: string): Promise<{ success: boolean }> {
  const entry = registry.get(threadId);
  if (!entry) throw new NotFoundError("Thread", threadId);
  if (entry.stopping || !entry.backend) {
    throw new ValidationError(`Cannot send prompt: thread ${threadId} is not running`);
  }
  await entry.backend.sendPrompt(prompt);
  entry.promptsSent += 1;
  const db = getDb();
  db.update(threads)
    .set({ prompt, updatedAt: new Date().toISOString() })
    .where(eq(threads.id, threadId))
    .run();
  return { success: true };
}

export async function stopThread(threadId: string): Promise<{ success: boolean }> {
  const entry = registry.get(threadId);
  if (!entry) {
    const db = getDb();
    const row = db.select().from(threads).where(eq(threads.id, threadId)).get();
    if (!row) throw new NotFoundError("Thread", threadId);
    if (row.status === "running") {
      updateThreadStatus(threadId, "stopped");
    }
    await cleanupThreadSessionDir(threadId).catch(() => {});
    return { success: true };
  }

  entry.stopping = true;
  if (entry.backend) {
    try {
      await entry.backend.stop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`stopThread backend.stop threw: ${message}`);
    }
  }

  registry.delete(threadId);
  await cleanupThreadSessionDir(threadId).catch((err: Error) => {
    log.warn(`cleanupThreadSessionDir(${threadId}) failed: ${err.message}`);
  });
  updateThreadStatus(threadId, "stopped");
  return { success: true };
}

export interface UpdateThreadInput {
  threadId: string;
  backend?: AgentBackendName;
  model?: string | null;
  reasoningLevel?: string | null;
  fastMode?: boolean | null;
  planMode?: boolean | null;
}

export function updateThreadSettings(input: UpdateThreadInput): ThreadRow {
  const db = getDb();
  const row = db.select().from(threads).where(eq(threads.id, input.threadId)).get();
  if (!row) throw new NotFoundError("Thread", input.threadId);

  if (input.backend !== undefined && input.backend !== row.backend) {
    if (!isBackendName(input.backend)) {
      throw new ValidationError(`Unsupported agent backend: ${input.backend}`);
    }
    const entry = registry.get(input.threadId);
    const promptsSent = entry?.promptsSent ?? 0;
    if (promptsSent > 0) {
      throw new ValidationError(
        `Cannot change backend on thread ${input.threadId} after first message`,
      );
    }
  }

  db.update(threads)
    .set({
      backend: input.backend ?? row.backend,
      model: input.model === undefined ? row.model : input.model,
      reasoningLevel:
        input.reasoningLevel === undefined ? row.reasoningLevel : input.reasoningLevel,
      fastMode: input.fastMode === undefined ? row.fastMode : input.fastMode,
      planMode: input.planMode === undefined ? row.planMode : input.planMode,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(threads.id, input.threadId))
    .run();

  const updated = db.select().from(threads).where(eq(threads.id, input.threadId)).get();
  if (!updated) throw new InternalError("Failed to read back updated thread");
  return updated;
}

function getThreadReposRows(threadIds: string[]): Map<string, ThreadRepoRow[]> {
  const map = new Map<string, ThreadRepoRow[]>();
  if (threadIds.length === 0) return map;
  const db = getDb();
  const rows = db.select().from(threadRepos).where(inArray(threadRepos.threadId, threadIds)).all();
  for (const r of rows) {
    const list = map.get(r.threadId) ?? [];
    list.push(r);
    map.set(r.threadId, list);
  }
  return map;
}

export interface ThreadWithRepos {
  thread: ThreadRow;
  workspaceId: string;
  repos: ThreadRepoRow[];
}

export function listThreadsBySession(sessionId: string): ThreadWithRepos[] {
  const db = getDb();
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) throw new NotFoundError("Session", sessionId);
  const rows = db
    .select()
    .from(threads)
    .where(eq(threads.sessionId, sessionId))
    .orderBy(
      sql`CASE WHEN ${threads.status} = 'running' THEN 0 ELSE 1 END`,
      desc(threads.updatedAt),
    )
    .all();
  const repoMap = getThreadReposRows(rows.map((r) => r.id));
  return rows.map((r) => ({
    thread: r,
    workspaceId: session.workspaceId,
    repos: repoMap.get(r.id) ?? [],
  }));
}

export function listThreadsByWorkspace(workspaceId: string): ThreadWithRepos[] {
  const db = getDb();
  const wsSessions = db
    .select()
    .from(sessions)
    .where(eq(sessions.workspaceId, workspaceId))
    .orderBy(asc(sessions.createdAt))
    .all();
  if (wsSessions.length === 0) return [];
  const sessionIds = wsSessions.map((s) => s.id);
  const sessionWs = new Map(wsSessions.map((s) => [s.id, s.workspaceId]));
  const rows = db
    .select()
    .from(threads)
    .where(inArray(threads.sessionId, sessionIds))
    .orderBy(
      sql`CASE WHEN ${threads.status} = 'running' THEN 0 ELSE 1 END`,
      desc(threads.updatedAt),
    )
    .all();
  const repoMap = getThreadReposRows(rows.map((r) => r.id));
  return rows.map((r) => ({
    thread: r,
    workspaceId: sessionWs.get(r.sessionId) ?? workspaceId,
    repos: repoMap.get(r.id) ?? [],
  }));
}

export function getThread(threadId: string): ThreadWithRepos {
  const db = getDb();
  const row = db.select().from(threads).where(eq(threads.id, threadId)).get();
  if (!row) throw new NotFoundError("Thread", threadId);
  const session = db.select().from(sessions).where(eq(sessions.id, row.sessionId)).get();
  if (!session) throw new NotFoundError("Session", row.sessionId);
  const repoRows = db.select().from(threadRepos).where(eq(threadRepos.threadId, threadId)).all();
  return { thread: row, workspaceId: session.workspaceId, repos: repoRows };
}

export function isWorktreeBoundToActiveThread(worktreeId: string): boolean {
  const db = getDb();
  const rows = db
    .select({ id: threadRepos.id, status: threads.status })
    .from(threadRepos)
    .innerJoin(threads, eq(threadRepos.threadId, threads.id))
    .where(eq(threadRepos.worktreeId, worktreeId))
    .all();
  return rows.some((r) => r.status === "running");
}
