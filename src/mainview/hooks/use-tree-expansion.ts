import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "piloto:workspace-tree:v1";

interface PersistedState {
  workspaces: string[];
  sessions: string[];
  activeThreadId: string | null;
}

const EMPTY_STATE: PersistedState = {
  workspaces: [],
  sessions: [],
  activeThreadId: null,
};

function readState(): PersistedState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeThreadId: typeof parsed.activeThreadId === "string" ? parsed.activeThreadId : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(state: PersistedState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota errors / disabled storage — silently degrade. Persistence is
    // a nice-to-have, not load-bearing.
  }
}

export interface UseTreeExpansionResult {
  isWorkspaceExpanded: (id: string) => boolean;
  toggleWorkspace: (id: string) => void;
  isSessionExpanded: (id: string) => boolean;
  toggleSession: (id: string) => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
}

export function useTreeExpansion(): UseTreeExpansionResult {
  const [state, setState] = useState<PersistedState>(readState);

  useEffect(() => {
    writeState(state);
  }, [state]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(readState());
    };
    globalThis.addEventListener("storage", onStorage);
    return () => {
      globalThis.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggleWorkspace = useCallback((id: string) => {
    setState((prev) => {
      const has = prev.workspaces.includes(id);
      return {
        ...prev,
        workspaces: has ? prev.workspaces.filter((x) => x !== id) : [...prev.workspaces, id],
      };
    });
  }, []);

  const toggleSession = useCallback((id: string) => {
    setState((prev) => {
      const has = prev.sessions.includes(id);
      return {
        ...prev,
        sessions: has ? prev.sessions.filter((x) => x !== id) : [...prev.sessions, id],
      };
    });
  }, []);

  const setActiveThreadId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activeThreadId: id }));
  }, []);

  const isWorkspaceExpanded = useCallback(
    (id: string) => state.workspaces.includes(id),
    [state.workspaces],
  );

  const isSessionExpanded = useCallback(
    (id: string) => state.sessions.includes(id),
    [state.sessions],
  );

  return {
    isWorkspaceExpanded,
    toggleWorkspace,
    isSessionExpanded,
    toggleSession,
    activeThreadId: state.activeThreadId,
    setActiveThreadId,
  };
}
