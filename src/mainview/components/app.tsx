import { useRPCMutation, useRPCQuery } from "@/hooks";
import type { RPCClientError } from "@/lib/rpc-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function RPCErrorDisplay({ error }: { error: RPCClientError }) {
  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span className="font-mono font-semibold">{error.code}</span>:{" "}
      {error.message}
    </div>
  );
}

function RPCDemo() {
  const {
    data: greeting,
    loading: greetingLoading,
    error: greetingError,
  } = useRPCQuery<string>("getGreeting");

  const {
    data: workspaces,
    loading: wsLoading,
    error: wsError,
    refetch,
  } = useRPCQuery<Workspace[]>("listWorkspaces");

  const {
    mutate: createWorkspace,
    loading: creating,
    error: createError,
  } = useRPCMutation<Workspace, { name: string; repoPaths: string[] }>(
    "createWorkspace",
  );

  const handleCreate = async () => {
    const name = `Workspace ${new Date().toLocaleTimeString()}`;
    const result = await createWorkspace({ name, repoPaths: ["/tmp/repo"] });
    if (result) refetch();
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-4">
      <div>
        <p className="text-xs text-muted-foreground">
          getGreeting → useRPCQuery
        </p>
        <p className="font-mono text-sm text-foreground">
          {greetingLoading ? "Loading…" : greeting}
        </p>
        {greetingError && <RPCErrorDisplay error={greetingError} />}
      </div>

      <Separator />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            listWorkspaces → useRPCQuery
          </p>
          <Badge variant="outline" className="text-xs">
            {workspaces?.length ?? 0}
          </Badge>
        </div>
        {wsLoading ? (
          <p className="font-mono text-xs text-muted-foreground">
            Loading workspaces…
          </p>
        ) : workspaces && workspaces.length > 0 ? (
          <ul className="space-y-1 font-mono text-xs">
            {workspaces.map((ws) => (
              <li key={ws.id} className="text-foreground">
                • {ws.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            No workspaces yet.
          </p>
        )}
        {wsError && <RPCErrorDisplay error={wsError} />}
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          createWorkspace → useRPCMutation
        </p>
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          {creating ? "Creating…" : "Create Workspace"}
        </Button>
        {createError && <RPCErrorDisplay error={createError} />}
      </div>
    </div>
  );
}

function ColorSwatch({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`h-12 w-12 rounded-md border border-border ${className}`}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mock Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-card p-3">
        <span className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Workspaces
        </span>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md bg-accent/50 px-2.5 py-1.5 text-sm text-foreground transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-primary" />
          piloto
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          conductor
        </button>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          kargo
        </button>

        <Separator className="my-3" />

        <span className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Agents
        </span>
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Claude Code
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
          Codex CLI
        </div>

        <div className="mt-auto">
          <Separator className="mb-3" />
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              F
            </div>
            <span className="text-sm text-foreground">fernando</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Piloto Design System
            </h1>
            <p className="mt-1 text-muted-foreground">
              Validation demo — amber/gold accent on near-black backgrounds with
              Geist typography.
            </p>
          </div>

          <Separator />

          {/* RPC Demo */}
          <Section title="RPC Demo (PIL-15)">
            <RPCDemo />
          </Section>

          <Separator />

          {/* Colors */}
          <Section title="Background Tiers">
            <div className="flex gap-4">
              <ColorSwatch label="background" className="bg-background" />
              <ColorSwatch label="card" className="bg-card" />
              <ColorSwatch label="popover" className="bg-popover" />
              <ColorSwatch label="secondary" className="bg-secondary" />
            </div>
          </Section>

          <Section title="Accent & Semantic Colors">
            <div className="flex gap-4">
              <ColorSwatch label="primary" className="bg-primary" />
              <ColorSwatch label="destructive" className="bg-destructive" />
              <ColorSwatch label="success" className="bg-success" />
              <ColorSwatch label="warning" className="bg-warning" />
              <ColorSwatch label="info" className="bg-info" />
            </div>
          </Section>

          <Section title="Diff Colors">
            <div className="flex gap-4">
              <ColorSwatch label="diff-add" className="bg-diff-add" />
              <ColorSwatch label="diff-remove" className="bg-diff-remove" />
            </div>
          </Section>

          <Separator />

          {/* Typography */}
          <Section title="Typography">
            <div className="space-y-3 rounded-md border border-border bg-card p-4">
              <p className="text-lg font-semibold">
                Page Title — Geist Sans 18px/600
              </p>
              <p className="text-sm font-semibold">
                Section Heading — 14px/600
              </p>
              <p className="text-sm">
                Body text — 14px/400. The quick brown fox jumps over the lazy
                dog.
              </p>
              <p className="text-xs text-muted-foreground">
                Small label — 12px/400 muted
              </p>
              <p className="font-mono text-sm">Inline code — Geist Mono 14px</p>
              <p className="font-mono text-xs text-muted-foreground">
                Terminal output — Geist Mono 12px muted
              </p>
            </div>
          </Section>

          <Separator />

          {/* Buttons */}
          <Section title="Button Variants">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">+</Button>
            </div>
          </Section>

          <Separator />

          {/* Badges */}
          <Section title="Badges">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="success">Running</Badge>
              <Badge variant="warning">Pending</Badge>
              <Badge variant="info">Info</Badge>
            </div>
          </Section>

          <Separator />

          {/* Inputs */}
          <Section title="Form Elements">
            <div className="max-w-sm space-y-3">
              <Input placeholder="Search workspaces..." />
              <Textarea
                placeholder="Describe what you want the agent to do..."
                rows={3}
              />
            </div>
          </Section>

          <Separator />

          {/* Tabs */}
          <Section title="Tabs">
            <Tabs defaultValue="changes" className="max-w-md">
              <TabsList>
                <TabsTrigger value="changes">Changes</TabsTrigger>
                <TabsTrigger value="terminal">Terminal</TabsTrigger>
                <TabsTrigger value="output">Output</TabsTrigger>
              </TabsList>
              <TabsContent value="changes" className="mt-3">
                <div className="space-y-1.5 rounded-md border border-border bg-card p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-diff-add-text">
                      + src/mainview/index.css
                    </span>
                    <Badge variant="outline" className="text-xs">
                      modified
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-diff-add-text">
                      + src/mainview/components/app.tsx
                    </span>
                    <Badge variant="outline" className="text-xs">
                      modified
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-diff-remove-text">
                      - src/old-file.ts
                    </span>
                    <Badge variant="outline" className="text-xs">
                      deleted
                    </Badge>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="terminal" className="mt-3">
                <div className="rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
                  <p>$ bun run dev:hmr</p>
                  <p className="text-success">VITE v6.4.1 ready in 142 ms</p>
                  <p>Local: http://localhost:5173/</p>
                </div>
              </TabsContent>
              <TabsContent value="output" className="mt-3">
                <p className="text-sm text-muted-foreground">
                  Agent output will appear here.
                </p>
              </TabsContent>
            </Tabs>
          </Section>

          <Separator />

          {/* Mock Panel Layout */}
          <Section title="Panel Layout Preview">
            <div className="flex h-64 overflow-hidden rounded-md border border-border">
              {/* Mini sidebar */}
              <div className="w-36 shrink-0 border-r border-border bg-card p-2">
                <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Repos
                </div>
                <div className="space-y-0.5">
                  <div className="rounded px-2 py-1 text-xs bg-accent/50 text-foreground">
                    api/
                  </div>
                  <div className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50">
                    web/
                  </div>
                  <div className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50">
                    shared/
                  </div>
                </div>
              </div>
              {/* Main panel */}
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">
                    Diff View
                  </span>
                  <Badge variant="outline" className="text-xs">
                    3 files
                  </Badge>
                </div>
                <div className="flex-1 bg-background p-3 font-mono text-xs">
                  <div className="rounded bg-diff-add px-2 py-0.5 text-diff-add-text">
                    + export function WorkspaceService() &#123;
                  </div>
                  <div className="px-2 py-0.5 text-muted-foreground">
                    &nbsp;&nbsp;const db = useDatabase();
                  </div>
                  <div className="rounded bg-diff-remove px-2 py-0.5 text-diff-remove-text">
                    - export function OldService() &#123;
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Borders */}
          <Section title="Border Treatment">
            <div className="flex gap-4">
              <div className="rounded-md border border-border bg-card p-4 text-sm">
                Default border (8% white)
              </div>
              <div className="rounded-md border border-input bg-card p-4 text-sm">
                Input border (12% white)
              </div>
              <div className="rounded-md border border-ring/50 bg-card p-4 text-sm">
                Ring border (accent)
              </div>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
