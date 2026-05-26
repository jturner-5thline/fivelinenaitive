import * as React from "react";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { SectionHeader, StatusBadge, OutcomeBadge, ConfidenceMeter } from "./ui";
import { aiActions, type AIAction } from "./mockData";
import { Search, FileText, ShieldAlert, ShieldCheck, ArrowRight } from "lucide-react";

const OUTCOMES = ["success", "edited", "overridden", "failed", "pending_review"] as const;
const BANDS = ["high", "medium", "low"] as const;

export function AIActionsPage() {
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [band, setBand] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState<AIAction | null>(null);

  const filtered = aiActions.filter(a => {
    if (outcome && a.outcome !== outcome) return false;
    if (band && a.confidenceBand !== band) return false;
    if (q && !`${a.actionType} ${a.account} ${a.workflow} ${a.reason}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Operational oversight"
        title="AI Actions"
        description="Every autonomous or assisted action, with the evidence that justified it and the outcome that followed."
        right={
          <div className="relative w-[260px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search actions…" className="h-8 pl-7 text-xs" />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={outcome === null} onClick={() => setOutcome(null)}>All outcomes</Chip>
        {OUTCOMES.map(o => (
          <Chip key={o} active={outcome === o} onClick={() => setOutcome(outcome === o ? null : o)}>{o}</Chip>
        ))}
        <span className="mx-2 h-3 w-px bg-border" />
        <Chip active={band === null} onClick={() => setBand(null)}>All confidence</Chip>
        {BANDS.map(b => (
          <Chip key={b} active={band === b} onClick={() => setBand(band === b ? null : b)}>{b}</Chip>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/20">
                <th className="py-2.5 px-4 font-medium">Action</th>
                <th className="py-2.5 px-4 font-medium">Evidence</th>
                <th className="py-2.5 px-4 font-medium w-[150px]">Confidence</th>
                <th className="py-2.5 px-4 font-medium">Result</th>
                <th className="py-2.5 px-4 font-medium">Human override</th>
                <th className="py-2.5 px-4 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.id}
                  onClick={() => setActive(a)}
                  className="border-b border-border/40 last:border-0 hover:bg-muted/20 cursor-pointer align-top"
                >
                  <td className="py-3 px-4">
                    <div className="font-medium leading-tight">{a.actionType}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{a.workflow} · {a.account}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-1.5 text-[12px] text-foreground/85 leading-snug">
                      <FileText className="h-3 w-3 mt-0.5 text-teal-300/70 shrink-0" />
                      <span className="font-mono text-[11px] truncate max-w-[220px]">{a.evidenceSource}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[260px]">{a.reason}</div>
                  </td>
                  <td className="py-3 px-4">
                    <ConfidenceMeter value={a.confidence} band={a.confidenceBand} />
                    <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{a.confidenceBand}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col items-start gap-1">
                      <OutcomeBadge outcome={a.outcome} />
                      <ValueDeltaBadge v={a.valueDelta} />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {a.humanOverride ? (
                      <div className="flex items-start gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-amber-200">{a.owner}</div>
                          <div className="text-[10px] text-muted-foreground leading-snug truncate max-w-[200px]">
                            {a.overrideReason ?? "Edited before send"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
                        Autonomous
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {new Date(a.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    <div className="text-teal-300/60 mt-1 inline-flex items-center gap-0.5 opacity-0 hover:opacity-100"><ArrowRight className="h-3 w-3"/></div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No matching actions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!active} onOpenChange={o => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{active.actionType}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <OutcomeBadge outcome={active.outcome} />
                  <BandPill band={active.confidenceBand} value={active.confidence} />
                  <ValueDeltaBadge v={active.valueDelta} />
                  {active.humanOverride && <StatusBadge tone="warn">Human override</StatusBadge>}
                </div>
                <Row k="Workflow" v={active.workflow} />
                <Row k="Account" v={active.account} />
                <Row k="Reason" v={active.reason} />
                <Row k="Evidence source" v={active.evidenceSource} mono />
                <Row k="Input summary" v={active.inputSummary} mono />
                <Row k="Model" v={active.model} mono />
                <Row k="Prompt version" v={active.promptVersion} mono />
                <Row k="Owner" v={active.owner} />
                <Row k="Timestamp" v={new Date(active.timestamp).toLocaleString()} />
                {active.overrideReason && <Row k="Override reason" v={active.overrideReason} />}
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Outcome note</div>
                  <div className="rounded-md bg-muted/30 p-3 text-sm leading-relaxed">{active.outcomeNote}</div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{v}</div>
    </div>
  );
}

function BandPill({ band, value }: { band: string; value: number }) {
  const tone = band === "high" ? "ok" : band === "medium" ? "warn" : "danger";
  return <StatusBadge tone={tone as never}>{(value * 100).toFixed(0)}% · {band}</StatusBadge>;
}

function ValueDeltaBadge({ v }: { v: string }) {
  const map: Record<string, { tone: Parameters<typeof StatusBadge>[0]["tone"]; label: string }> = {
    value: { tone: "ok", label: "Value" },
    delay: { tone: "warn", label: "Delay" },
    risk: { tone: "danger", label: "Risk" },
    escalation: { tone: "info", label: "Escalation" },
    neutral: { tone: "neutral", label: "Neutral" },
  };
  const m = map[v];
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
      {String(children).replace(/_/g, " ")}
    </button>
  );
}