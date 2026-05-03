import { useCreateSession, useDeleteSession, useStartThread, useWorkspaceWorktrees } from "@/hooks";
import { useState } from "react";
import type { AgentBackendName } from "shared/rpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";

interface NewSessionDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (threadId: string) => void;
  /**
   * When set, the dialog skips session creation and starts a thread under
   * the provided session. Used by the workspace tree's "+ new thread"
   * affordance. PIL-51 will replace this whole dialog with an inline
   * empty-thread tab; treat the prop as throwaway scaffolding.
   */
  presetSessionId?: string;
}

export function NewSessionDialog({
  workspaceId,
  open,
  onOpenChange,
  onCreated,
  presetSessionId,
}: NewSessionDialogProps) {
  const { data: worktrees, loading: worktreesLoading } = useWorkspaceWorktrees(workspaceId);
  const {
    mutate: createSession,
    loading: creatingSession,
    error: createError,
  } = useCreateSession();
  const { mutate: startThread, loading: starting, error: startError } = useStartThread();
  const { mutate: deleteSession } = useDeleteSession();

  const [name, setName] = useState("");
  const [backend, setBackend] = useState<AgentBackendName>("claude");
  const [worktreeId, setWorktreeId] = useState<string>("");
  const [prompt, setPrompt] = useState("");

  const threadOnly = Boolean(presetSessionId);
  const busy = creatingSession || starting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worktreeId) return;
    const wt = worktrees?.find((w) => w.id === worktreeId);
    if (!wt) return;

    let sessionId = presetSessionId ?? null;
    let createdSessionId: string | null = null;

    if (!sessionId) {
      const sessionName = name.trim();
      if (!sessionName) return;
      const session = await createSession({ workspaceId, name: sessionName });
      if (!session) return;
      sessionId = session.id;
      createdSessionId = session.id;
    }

    let result: { threadId: string } | undefined;
    try {
      result = await startThread({
        sessionId,
        backend,
        bindings: [{ repoId: wt.repoId, worktreeId: wt.id }],
        prompt: prompt.trim() || undefined,
      });
    } catch {
      // useStartThread already surfaces the error via startError.
    }

    if (!result?.threadId) {
      // Roll back any orphan session we created so the user can retry
      // without leaking empty sessions.
      if (createdSessionId) {
        await deleteSession({ id: createdSessionId }).catch(() => {});
      }
      return;
    }

    onCreated(result.threadId);
    setName("");
    setPrompt("");
    setWorktreeId("");
    onOpenChange(false);
  };

  const canSubmit = (threadOnly || name.trim().length > 0) && worktreeId.length > 0 && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{threadOnly ? "New thread" : "New session"}</DialogTitle>
          <DialogDescription>
            {threadOnly
              ? "Start a new thread bound to a worktree under this session."
              : "Create a session with one thread bound to a worktree."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!threadOnly && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-session-name" className="text-xs font-medium text-foreground">
                Session name
              </label>
              <input
                id="new-session-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Refactor auth"
                className="rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-session-backend" className="text-xs font-medium text-foreground">
              Backend
            </label>
            <div className="inline-grid grid-cols-[1fr_--spacing(8)]">
              <select
                id="new-session-backend"
                name="backend"
                value={backend}
                onChange={(e) => setBackend(e.target.value as AgentBackendName)}
                className="col-span-full row-start-1 appearance-none rounded-md border border-input bg-transparent py-2 pr-8 pl-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="claude">Claude Code</option>
                <option value="codex">Codex CLI</option>
              </select>
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none col-start-2 row-start-1 place-self-center text-muted-foreground"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
              </svg>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-session-worktree" className="text-xs font-medium text-foreground">
              Worktree
            </label>
            <div className="inline-grid grid-cols-[1fr_--spacing(8)]">
              <select
                id="new-session-worktree"
                name="worktreeId"
                value={worktreeId}
                onChange={(e) => setWorktreeId(e.target.value)}
                disabled={worktreesLoading}
                className="col-span-full row-start-1 appearance-none rounded-md border border-input bg-transparent py-2 pr-8 pl-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <option value="">Select a worktree…</option>
                {worktrees?.map((wt) => (
                  <option key={wt.id} value={wt.id}>
                    {wt.featureName ?? wt.branch} — {wt.path}
                  </option>
                ))}
              </select>
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none col-start-2 row-start-1 place-self-center text-muted-foreground"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
              </svg>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-session-prompt" className="text-xs font-medium text-foreground">
              Initial prompt (optional)
            </label>
            <Textarea
              id="new-session-prompt"
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="What should the agent work on?"
            />
          </div>

          {(createError || startError) && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span className="font-mono font-semibold">{(createError ?? startError)?.code}</span>:{" "}
              {(createError ?? startError)?.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {busy ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
