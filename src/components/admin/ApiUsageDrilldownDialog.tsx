import { useEffect, useMemo, useState } from "react";
import { Loader2, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  recommendationsForSelection,
  type DrilldownRow,
  type UsageRecommendation,
} from "@/lib/apiUsageRecommendations";

export interface DrilldownSelection {
  start: Date;
  end: Date;
  provider: string | null;
  label: string;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n)));
}

const SEVERITY_STYLES: Record<UsageRecommendation["severity"], string> = {
  high: "border-red-500/40 text-red-300",
  medium: "border-amber-500/40 text-amber-300",
  low: "border-emerald-500/40 text-emerald-300",
};

export function ApiUsageDrilldownDialog({
  selection,
  onOpenChange,
}: {
  selection: DrilldownSelection | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<DrilldownRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("api_usage_drilldown", {
        _start: selection.start.toISOString(),
        _end: selection.end.toISOString(),
        _provider: selection.provider,
      });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      setRows(((data as DrilldownRow[]) ?? []).map((r) => ({ ...r, calls: Number(r.calls) })));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          calls: acc.calls + Number(r.calls || 0),
          input: acc.input + Number(r.input_tokens || 0),
          output: acc.output + Number(r.output_tokens || 0),
          repeats: acc.repeats + Number(r.repeat_calls || 0),
        }),
        { calls: 0, input: 0, output: 0, repeats: 0 },
      ),
    [rows],
  );

  const advice = useMemo(() => recommendationsForSelection(rows), [rows]);

  return (
    <Dialog open={!!selection} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {selection?.label}
            {selection?.provider && (
              <Badge variant="outline" className="capitalize">
                {selection.provider}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {selection
              ? `${selection.start.toLocaleString()} → ${selection.end.toLocaleString()} · ${fmt(
                  totals.calls,
                )} calls, ${fmt(totals.input)} in / ${fmt(totals.output)} out tokens`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {error && <Card className="p-3 border-red-500/40 text-red-300 text-sm">{error}</Card>}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="animate-spin mr-2 h-4 w-4" /> Loading breakdown…
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-5">
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action / feature</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">In</TableHead>
                      <TableHead className="text-right">Out</TableHead>
                      <TableHead className="text-right">Avg in/call</TableHead>
                      <TableHead className="text-right">Cache read</TableHead>
                      <TableHead className="text-right">Repeats</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Avg ms</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                          No calls in this slice.
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((r) => (
                      <TableRow key={`${r.feature}-${r.provider}-${r.model}`}>
                        <TableCell className="font-medium">{r.feature}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.model ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.calls)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.input_tokens)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.output_tokens)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(Number(r.input_tokens) / Math.max(Number(r.calls), 1))}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(r.cache_read_tokens)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(r.repeat_calls) > 0 ? (
                            <span className="text-amber-300">{fmt(r.repeat_calls)}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(r.errors) > 0 ? (
                            <span className="text-red-400">{fmt(r.errors)}</span>
                          ) : (
                            "0"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {r.avg_latency_ms == null ? "—" : fmt(r.avg_latency_ms)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {advice.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="h-4 w-4" />
                    How to minimize these calls
                  </div>
                  {advice.map(({ row, recs }) => (
                    <Card key={`${row.feature}-${row.model}`} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{row.feature}</span>
                        <Badge variant="outline" className="text-xs">
                          {fmt(row.calls)} calls
                        </Badge>
                        <span className="text-xs text-muted-foreground">{row.model ?? "—"}</span>
                      </div>
                      <ul className="space-y-2">
                        {recs.map((rec) => (
                          <li key={rec.id} className="text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={SEVERITY_STYLES[rec.severity]}>
                                {rec.severity}
                              </Badge>
                              <span className="font-medium">{rec.title}</span>
                              {rec.savings && (
                                <span className="text-xs text-muted-foreground">{rec.savings}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{rec.detail}</p>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}