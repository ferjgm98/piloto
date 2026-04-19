import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRPCSubscription, useRefreshWorktreeStatus, useWorkspaceWorktrees } from "@/hooks";
import { RefreshCw } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import type { ActiveWorktreeDTO, WorktreeStatus } from "shared/rpc";

interface WorktreeStatusChangedMessage {
  worktreeId: string;
  status: WorktreeStatus;
}

function formatLastFetch(lastFetch: string | null): string {
  if (!lastFetch) return "Never fetched";
  return new Date(lastFetch).toLocaleString();
}

function getRepoLabel(worktree: ActiveWorktreeDTO): string {
  const parts = worktree.repo.path.split(/[\\/]/);
  return parts[parts.length - 1] || worktree.repo.path;
}

function WorktreeCard({
  worktree,
  refreshing,
  onRefresh,
}: {
  worktree: ActiveWorktreeDTO;
  refreshing: boolean;
  onRefresh: (worktreeId: string) => void;
}) {
  const dirty = worktree.status.hasChanges;
  const branchName = worktree.status.branchName ?? worktree.branch;

  return (
    <article className="rounded-xl border border-border bg-card/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {getRepoLabel(worktree)}
          </p>
          <h3 className="mt-2 truncate font-mono text-sm text-foreground">{branchName}</h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">{worktree.path}</p>
        </div>

        <Badge variant={dirty ? "warning" : "success"}>{dirty ? "Dirty" : "Clean"}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border/60 bg-background/70 p-3">
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Changed</dt>
          <dd className="mt-1 font-mono text-lg text-foreground">{worktree.status.changedFiles}</dd>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/70 p-3">
          <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Sync</dt>
          <dd className="mt-1 font-mono text-lg text-foreground">
            +{worktree.status.ahead} / -{worktree.status.behind}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Last fetch:{" "}
          <span className="text-foreground">{formatLastFetch(worktree.status.lastFetch)}</span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => {
            onRefresh(worktree.id);
          }}
        >
          <RefreshCw className={`mr-2 size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </article>
  );
}

export function WorktreeDashboard({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const { data, error, loading, refetch } = useWorkspaceWorktrees(workspaceId);
  const { mutate: refreshStatus } = useRefreshWorktreeStatus();
  const [worktrees, setWorktrees] = useState<ActiveWorktreeDTO[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setWorktrees(data ?? []);
    });
  }, [data]);

  useEffect(() => {
    if (!workspaceId) {
      startTransition(() => {
        setWorktrees([]);
      });
      return;
    }

    startTransition(() => {
      setWorktrees([]);
    });
  }, [workspaceId]);

  useRPCSubscription<WorktreeStatusChangedMessage>(
    "worktreeStatusChanged",
    ({ worktreeId, status }) => {
      startTransition(() => {
        setWorktrees((current) =>
          current.map((worktree) =>
            worktree.id === worktreeId ? { ...worktree, status } : worktree,
          ),
        );
      });
    },
    [workspaceId],
  );

  async function handleRefresh(worktreeId: string) {
    setRefreshingId(worktreeId);
    try {
      const status = await refreshStatus({ worktreeId });
      if (status) {
        startTransition(() => {
          setWorktrees((current) =>
            current.map((worktree) =>
              worktree.id === worktreeId ? { ...worktree, status } : worktree,
            ),
          );
        });
      }
    } finally {
      setRefreshingId(null);
    }
  }

  if (loading && data === undefined) {
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Loading worktree status for {workspaceName}…
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-destructive/50 bg-destructive/10 p-6">
        <p className="text-sm text-destructive">Failed to load worktrees: {error.message}</p>
        <Button className="mt-4" size="sm" variant="outline" onClick={refetch}>
          Retry
        </Button>
      </section>
    );
  }

  if (worktrees.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-foreground">No tracked worktrees in {workspaceName} yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a feature worktree set first, then this dashboard will stream status updates here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Worktree status
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{workspaceName}</h2>
        </div>
        <Badge variant="outline">{worktrees.length} tracked</Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {worktrees.map((worktree) => (
          <WorktreeCard
            key={worktree.id}
            worktree={worktree}
            refreshing={refreshingId === worktree.id}
            onRefresh={handleRefresh}
          />
        ))}
      </div>
    </section>
  );
}
