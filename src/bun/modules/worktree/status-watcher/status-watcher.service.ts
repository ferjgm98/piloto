import { type FSWatcher, watch } from "node:fs";
import { relative, resolve } from "node:path";
import { createLogger } from "../../../utils/logger";
import type {
  StatusWatcher,
  StatusWatcherDeps,
  StatusWatcherEvent,
  StatusWatcherSubscriber,
} from "./status-watcher.types";

const DEFAULT_DEBOUNCE_MS = 100;
const log = createLogger("worktree-status-watcher");

interface WatcherEntry {
  path: string;
  fsWatcher: FSWatcher;
  timeoutId: ReturnType<typeof setTimeout> | null;
  // Bumped whenever the entry is removed; lets in-flight refreshes detect
  // that they belong to a stopped/superseded watcher and skip emitting.
  generation: number;
}

function defaultShouldIgnore(worktreePath: string, eventPath: string): boolean {
  const relativePath = relative(worktreePath, eventPath);
  if (relativePath.startsWith("..")) return true;

  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized === ".DS_Store" || normalized.endsWith("/.DS_Store")) return true;

  const parts = normalized.split("/").filter(Boolean);
  return (
    parts.includes(".git") ||
    parts.includes("node_modules") ||
    parts.includes("build") ||
    parts.includes("dist")
  );
}

export function createStatusWatcher(deps: StatusWatcherDeps): StatusWatcher {
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const shouldIgnore = deps.shouldIgnore ?? defaultShouldIgnore;
  const entries = new Map<string, WatcherEntry>();
  const subscribers = new Set<StatusWatcherSubscriber>();

  function emit(event: StatusWatcherEvent): void {
    for (const listener of subscribers) {
      try {
        listener(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`subscriber threw: ${message}`);
      }
    }
  }

  function refreshAndEmit(worktreeId: string, path: string, generation: number): void {
    void deps
      .computeStatus(path)
      .then((status) => {
        const current = entries.get(worktreeId);
        if (!current || current.generation !== generation) return;
        emit({ worktreeId, status });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`computeStatus failed for ${worktreeId}: ${message}`);
      });
  }

  function queueRefresh(worktreeId: string): void {
    const entry = entries.get(worktreeId);
    if (!entry) return;
    if (entry.timeoutId !== null) clearTimeout(entry.timeoutId);
    const generation = entry.generation;
    entry.timeoutId = setTimeout(() => {
      entry.timeoutId = null;
      refreshAndEmit(worktreeId, entry.path, generation);
    }, debounceMs);
  }

  async function stopWatching(worktreeId: string): Promise<void> {
    const entry = entries.get(worktreeId);
    if (!entry) return;
    entries.delete(worktreeId);
    entry.generation += 1;
    if (entry.timeoutId !== null) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }
    entry.fsWatcher.close();
  }

  return {
    startWatching(worktreeId, path) {
      if (entries.has(worktreeId)) return;
      const resolvedPath = resolve(path);
      const fsWatcher = watch(resolvedPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const absolute = resolve(resolvedPath, filename.toString());
        if (shouldIgnore(resolvedPath, absolute)) return;
        queueRefresh(worktreeId);
      });
      fsWatcher.on("error", (error) => {
        log.error(`watcher error for ${worktreeId}: ${error.message}`);
      });
      entries.set(worktreeId, {
        path: resolvedPath,
        fsWatcher,
        timeoutId: null,
        generation: 0,
      });
    },

    stopWatching,

    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },

    notify(worktreeId, status) {
      emit({ worktreeId, status });
    },

    async shutdown() {
      const ids = [...entries.keys()];
      await Promise.all(ids.map((id) => stopWatching(id)));
      subscribers.clear();
    },

    has(worktreeId) {
      return entries.has(worktreeId);
    },
  };
}
