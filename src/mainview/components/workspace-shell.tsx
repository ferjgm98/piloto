import { useThreads } from "@/hooks";
import { useEffect, useState } from "react";
import { ThreadView } from "./thread-view";
import { ThreadsSidebar } from "./threads-sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { WorktreeDashboard } from "./worktree-dashboard";

interface WorkspaceShellProps {
  workspaceId: string;
  workspaceName: string;
}

export function WorkspaceShell({ workspaceId, workspaceName }: WorkspaceShellProps) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const { data: threads } = useThreads({ workspaceId });

  useEffect(() => {
    if (!activeThreadId) return;
    if (!threads) return;
    if (!threads.some((t) => t.id === activeThreadId)) {
      setActiveThreadId(null);
    }
  }, [threads, activeThreadId]);

  return (
    <Tabs defaultValue="threads" className="flex h-full flex-col">
      <TabsList className="mx-5 mt-3 self-start">
        <TabsTrigger value="threads">Threads</TabsTrigger>
        <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
      </TabsList>

      <TabsContent value="threads" className="flex flex-1 overflow-hidden">
        <ThreadsSidebar
          workspaceId={workspaceId}
          activeThreadId={activeThreadId}
          onSelect={setActiveThreadId}
        />
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {activeThreadId ? (
            <ThreadView threadId={activeThreadId} />
          ) : (
            <div className="m-auto max-w-md rounded-md border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">No thread selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a thread from the sidebar or start a new one.
              </p>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="worktrees" className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-5 py-6">
          <WorktreeDashboard workspaceId={workspaceId} workspaceName={workspaceName} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
