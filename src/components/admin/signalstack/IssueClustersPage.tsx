import * as React from "react";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SectionHeader, SeverityDot, StatusBadge, ConvergenceBar } from "./ui";
import { issueClusters, feedbackItems, aiActions, type IssueCluster } from "./mockData";

const STATUS = ["open", "in_progress", "monitoring", "resolved"] as const;

export function IssueClustersPage() {
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<IssueCluster | null>(null);

  const rows = issueClusters
    .filter(c => !statusFilter || c.status === statusFilter)
    .sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Prioritization workspace"
        title="Issue Clusters"
        description="Where behavior, feedback, AI failure, and business impact converge. Assign owners. Track closed-loop improvement."
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={statusFilter === null} onClick={() => setStatusFilter(null)}>All</Chip>
            {STATUS.map(s => (
              <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>{s.replace("_", " ")}</Chip>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map(c => (
          <Card key={c.id} className="p-5 cursor-pointer hover:ring-1 hover:ring-teal-500/30 transition" onClick={() => setActive(c)}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <SeverityDot severity={c.severity} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.workflow} · owner {c.owner}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums leading-none">{c.score}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">severity</div>
              </div>
            </div>
            <ConvergenceBar signals={c.signals} />
            <div className="grid grid-cols-4 gap-2 mt-3 text-[11px]">
              <Mini label="Users" value={c.impactedUsers} />
              <Mini label="Feedback" value={c.feedbackCount} />
              <Mini label="AI fail" value={c.aiFailures} />
              <Mini label="Evidence" value={c.evidenceCount} />
            </div>
            <div className="flex items-center justify-between mt-3">
              <ClusterStatusBadge status={c.status} />
              <span className="text-[11px] text-muted-foreground">
                {c.experiments.length > 0 ? c.experiments.join(", ") : "No active experiment"}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={!!active} onOpenChange={o => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-base">
                  <SeverityDot severity={active.severity} /> {active.title}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <ClusterStatusBadge status={active.status} />
                  <StatusBadge tone="neutral">{active.workflow}</StatusBadge>
                  <StatusBadge tone="info">Owner: {active.owner}</StatusBadge>
                </div>

                <ConvergenceBar signals={active.signals} />
                <div className="grid grid-cols-4 text-[11px] text-muted-foreground">
                  <div>Behavior {active.signals.behavior}</div>
                  <div>Feedback {active.signals.feedback}</div>
                  <div>AI {active.signals.aiFailure}</div>
                  <div>Business {active.signals.business}</div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Linked feedback</div>
                  <div className="space-y-1.5">
                    {feedbackItems.filter(f => active.linkedFeedback.includes(f.id)).map(f => (
                      <div key={f.id} className="text-xs rounded border border-border/60 bg-muted/20 p-2">
                        <div className="text-foreground/90">"{f.quote}"</div>
                        <div className="text-[10px] text-muted-foreground mt-1">{f.author} · {f.source}</div>
                      </div>
                    ))}
                    {active.linkedFeedback.length === 0 && <div className="text-xs text-muted-foreground">None</div>}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Linked AI actions</div>
                  <div className="space-y-1.5">
                    {aiActions.filter(a => active.linkedActions.includes(a.id)).map(a => (
                      <div key={a.id} className="text-xs rounded border border-border/60 bg-muted/20 p-2 flex items-center justify-between gap-2">
                        <span className="truncate">{a.actionType} · {a.account}</span>
                        <StatusBadge tone={a.outcome === "success" ? "ok" : a.outcome === "failed" ? "danger" : "warn"}>{a.outcome}</StatusBadge>
                      </div>
                    ))}
                    {active.linkedActions.length === 0 && <div className="text-xs text-muted-foreground">None</div>}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Experiments / fixes</div>
                  {active.experiments.length > 0 ? (
                    <ul className="text-sm space-y-1">
                      {active.experiments.map(e => <li key={e} className="text-foreground/90">• {e}</li>)}
                    </ul>
                  ) : (
                    <div className="text-xs text-muted-foreground">No experiment linked yet.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border/60 bg-muted/10 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ClusterStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Parameters<typeof StatusBadge>[0]["tone"]; label: string }> = {
    open: { tone: "danger", label: "Open" },
    in_progress: { tone: "info", label: "In progress" },
    monitoring: { tone: "warn", label: "Monitoring" },
    resolved: { tone: "ok", label: "Resolved" },
  };
  const m = map[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset capitalize ${
        active
          ? "bg-teal-500/15 text-teal-200 ring-teal-500/30"
          : "bg-muted/30 text-muted-foreground ring-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}