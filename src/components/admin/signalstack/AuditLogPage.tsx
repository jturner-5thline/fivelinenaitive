import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SectionHeader, OutcomeBadge, StatusBadge } from "./ui";
import { auditEvents } from "./mockData";
import { Download, Search } from "lucide-react";

export function AuditLogPage() {
  const [q, setQ] = React.useState("");

  const rows = auditEvents.filter(e =>
    !q ||
    `${e.action} ${e.customer} ${e.model} ${e.promptVersion} ${e.workflow} ${e.reviewer}`
      .toLowerCase().includes(q.toLowerCase())
  );

  const csv = () => {
    const head = ["timestamp", "model", "promptVersion", "action", "outcome", "customer", "workflow", "reviewer", "overrideReason", "evidence", "input"];
    const lines = [head.join(",")].concat(
      rows.map(r =>
        [r.timestamp, r.model, r.promptVersion, r.action, r.outcome, r.customer, r.workflow, r.reviewer, r.overrideReason ?? "", r.sourceEvidence, r.inputSummary]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "signalstack-audit.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Compliance & traceability"
        title="Audit Log"
        description="Every AI-related action, with model, prompt version, evidence, outcome, and reviewer."
        right={
          <div className="flex items-center gap-2">
            <div className="relative w-[240px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search audit…" className="h-8 pl-7 text-xs" />
            </div>
            <Button size="sm" variant="outline" onClick={csv} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          </div>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/20">
                <th className="py-2.5 px-3 font-medium">Time</th>
                <th className="py-2.5 px-3 font-medium">Model</th>
                <th className="py-2.5 px-3 font-medium">Prompt</th>
                <th className="py-2.5 px-3 font-medium">Action</th>
                <th className="py-2.5 px-3 font-medium">Customer</th>
                <th className="py-2.5 px-3 font-medium">Workflow</th>
                <th className="py-2.5 px-3 font-medium">Outcome</th>
                <th className="py-2.5 px-3 font-medium">Reviewer</th>
                <th className="py-2.5 px-3 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/10 align-top">
                  <td className="py-2 px-3 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px]">{r.model}</td>
                  <td className="py-2 px-3 font-mono text-[11px]">{r.promptVersion}</td>
                  <td className="py-2 px-3 font-medium">{r.action}</td>
                  <td className="py-2 px-3">{r.customer}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.workflow}</td>
                  <td className="py-2 px-3"><OutcomeBadge outcome={r.outcome} /></td>
                  <td className="py-2 px-3">
                    {r.reviewer === "—" ? (
                      <StatusBadge tone="neutral">Autonomous</StatusBadge>
                    ) : (
                      <span className="text-xs">{r.reviewer}</span>
                    )}
                    {r.overrideReason && (
                      <div className="text-[10px] text-amber-300/80 mt-0.5 max-w-[180px]">
                        {r.overrideReason}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-[11px] text-muted-foreground font-mono max-w-[200px] truncate" title={r.sourceEvidence}>
                    {r.sourceEvidence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}