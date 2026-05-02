import { useAgents } from "@/hooks";
import { useEffect, useState } from "react";
import { AgentSessionView } from "./agent-session-view";
import { AgentSessionsSidebar } from "./agent-sessions-sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { WorktreeDashboard } from "./worktree-dashboard";

interface WorkspaceShellProps {
  workspaceId: string;
  workspaceName: string;
}

export function WorkspaceShell({ workspaceId, workspaceName }: WorkspaceShellProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const { data: sessions } = useAgents(workspaceId);

  useEffect(() => {
    if (!activeSessionId) return;
    if (!sessions) return;
    if (!sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(null);
    }
  }, [sessions, activeSessionId]);

  return (
    <Tabs defaultValue="agents" className="flex h-full flex-col">
      <TabsList className="mx-5 mt-3 self-start">
        <TabsTrigger value="agents">Agents</TabsTrigger>
        <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
      </TabsList>

      <TabsContent value="agents" className="flex flex-1 overflow-hidden">
        <AgentSessionsSidebar
          workspaceId={workspaceId}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
        />
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {activeSessionId ? (
            <AgentSessionView sessionId={activeSessionId} />
          ) : (
            <div className="m-auto max-w-md rounded-md border border-dashed border-border p-6 text-center">
              <p className="text-sm font-medium text-foreground">No session selected</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a session from the sidebar or start a new one.
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
