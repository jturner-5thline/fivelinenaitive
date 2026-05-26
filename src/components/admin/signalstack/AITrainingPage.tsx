import * as React from "react";
import { Card } from "@/components/ui/card";
import { SectionHeader, StatusBadge, TEAL } from "./ui";
import { promptVersions } from "./mockData";
import { GitBranch, AlertOctagon, Sparkles } from "lucide-react";

export function AITrainingPage() {
  const [selectedId, setSelectedId] = React.useState(promptVersions[0].id);
  const selected = promptVersions.find(p => p.id === selectedId)!;

  const stalest = [...promptVersions].sort((a, b) => b.corpusFreshnessDays - a.corpusFreshnessDays)[0];
  const weakestCov = [...promptVersions].sort((a, b) => a.coverage - b.coverage)[0];
  const worstFail = [...promptVersions].sort((a, b) => b.failureRate - a.failureRate)[0];

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="AI readiness"
        title="AI Training"
        description="Prompt library, training freshness, coverage, and failure rate — by workflow."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FlagCard
          icon={<AlertOctagon className="h-4 w-4 text-amber-300" />}
          label="Stalest corpus"
          title={stalest.name}
          detail={`${stalest.corpusFreshnessDays} days since refresh`}
        />
        <FlagCard
          icon={<GitBranch className="h-4 w-4 text-rose-300" />}
          label="Weakest grounding"
          title={weakestCov.name}
          detail={`Coverage ${weakestCov.coverage}% of ${weakestCov.workflow}`}
        />
        <FlagCard
          icon={<Sparkles className="h-4 w-4 text-teal-300" />}
          label="Highest failure rate"
          title={worstFail.name}
          detail={`${(worstFail.failureRate * 100).toFixed(0)}% failures · ${worstFail.lowConfidence} low-confidence`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <SectionHeader title="Prompt library" eyebrow="Versions in flight" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <th className="py-2 font-medium">Prompt</th>
                  <th className="py-2 font-medium">Workflow</th>
                  <th className="py-2 font-medium">Version</th>
                  <th className="py-2 font-medium">Coverage</th>
                  <th className="py-2 font-medium">Failure</th>
                  <th className="py-2 font-medium">Freshness</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {promptVersions.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`border-b border-border/40 last:border-0 cursor-pointer transition-colors ${
                      selectedId === p.id ? "bg-teal-500/5" : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="py-2.5 font-medium">{p.name}</td>
                    <td className="py-2.5 text-muted-foreground">{p.workflow}</td>
                    <td className="py-2.5 tabular-nums text-xs">
                      <span>{p.version}</span>
                      <span className="text-muted-foreground"> ← {p.prevVersion}</span>
                    </td>
                    <td className="py-2.5">
                      <Meter value={p.coverage} good={70} />
                    </td>
                    <td className="py-2.5">
                      <Meter value={p.failureRate * 100} good={10} inverse />
                    </td>
                    <td className="py-2.5 text-xs tabular-nums">
                      <span className={p.corpusFreshnessDays > 30 ? "text-amber-300" : "text-muted-foreground"}>
                        {p.corpusFreshnessDays}d
                      </span>
                    </td>
                    <td className="py-2.5">
                      <StatusBadge
                        tone={
                          p.status === "production" ? "ok" :
                          p.status === "staging" ? "info" :
                          p.status === "drafting" ? "warn" : "neutral"
                        }
                      >
                        {p.status}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title={selected.name} eyebrow="Detail" />
          <div className="space-y-3 text-sm">
            <DetailRow label="Workflow" value={selected.workflow} />
            <DetailRow label="Current version" value={selected.version} />
            <DetailRow label="Previous version" value={selected.prevVersion} />
            <DetailRow label="Owner" value={selected.owner} />
            <DetailRow label="Updated" value={selected.updated} />
            <DetailRow label="Corpus freshness" value={`${selected.corpusFreshnessDays} days`} />
            <DetailRow label="Coverage" value={`${selected.coverage}% of workflow`} />
            <DetailRow label="Failure rate" value={`${(selected.failureRate * 100).toFixed(0)}%`} />
            <DetailRow label="Hallucination flags" value={String(selected.hallucinationFlags)} />
            <DetailRow label="Low-confidence runs" value={String(selected.lowConfidence)} />
            <div className="pt-2 border-t border-border/60">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Recent failure example
              </div>
              <div className="rounded-md bg-muted/30 p-2.5 text-xs leading-relaxed text-foreground/85">
                Input referenced a revised LOI from 2026-05-22 that the model omitted.
                Logged as a negative training example; queued for next corpus refresh.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FlagCard({ icon, label, title, detail }: { icon: React.ReactNode; label: string; title: string; detail: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-base font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
    </Card>
  );
}

function Meter({ value, good, inverse = false }: { value: number; good: number; inverse?: boolean }) {
  const healthy = inverse ? value < good : value >= good;
  const color = healthy ? "bg-emerald-500" : value < good * 0.6 || (inverse && value > good * 2) ? "bg-rose-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 bg-muted/40 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{value.toFixed(0)}%</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground/90">{value}</span>
    </div>
  );
}