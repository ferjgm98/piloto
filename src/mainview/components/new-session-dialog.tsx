import { useStartAgent, useWorkspaceWorktrees } from "@/hooks";
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
  onCreated: (sessionId: string) => void;
}

export function NewSessionDialog({
  workspaceId,
  open,
  onOpenChange,
  onCreated,
}: NewSessionDialogProps) {
  const { data: worktrees, loading: worktreesLoading } = useWorkspaceWorktrees(workspaceId);
  const { mutate: startAgent, loading: starting, error: startError } = useStartAgent();

  const [backend, setBackend] = useState<AgentBackendName>("claude");
  const [worktreeId, setWorktreeId] = useState<string>("");
  const [prompt, setPrompt] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await startAgent({
      workspaceId,
      worktreeId: worktreeId || undefined,
      backend,
      prompt: prompt.trim() || undefined,
    });
    if (result?.sessionId) {
      onCreated(result.sessionId);
      setPrompt("");
      setWorktreeId("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New agent session</DialogTitle>
          <DialogDescription>Start a Claude or Codex agent in a worktree.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                <option value="">(workspace-only — no worktree)</option>
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

          {startError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <span className="font-mono font-semibold">{startError.code}</span>:{" "}
              {startError.message}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={starting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={starting}>
              {starting ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
