import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2, Lightbulb, ChevronDown, ChevronRight, Copy, Check, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  claapSourceLabel,
  promptForClaapRecommendation,
  recommendationsForClaapRow,
  recommendationsForClaapSelection,
  type ClaapDrilldownRow,
  type ClaapRecommendation,
  type ClaapQuotaDay,
} from "@/lib/claapUsageRecommendations";
import { toast } from "@/hooks/use-toast";

export interface ClaapDrilldownSelection {
  start: Date;
  end: Date;
  label: string;
}

interface ClaapCallRow {
  occurred_at: string;
  source: string;
  operation: string;
  outcome: string;
  skipped_reason: string | null;
  priority: string | null;
  external_id: string | null;
  latency_ms: number | null;
  error_message: string | null;
}

const ALL = "__all__";

const SEVERITY_STYLES: Record<ClaapRecommendation["severity"], string> = {
  high: "border-red-500/40 text-red-300",
  medium: "border-amber-500/40 text-amber-300",
  low: "border-emerald-500/40 text-emerald-300",
};

const OUTCOME_STYLES: Record<string, string> = {
  call: "border-sky-500/40 text-sky-300",
  skipped: "border-emerald-500/40 text-emerald-300",
  rate_limited: "border-red-500/40 text-red-300",
  error: "border-amber-500/40 text-amber-300",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(Number(n)));
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function RecommendationPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Prompt copied", description: "Paste it into Lovable to implement the fix." });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="mt-2 rounded-md border border-white/10 bg-white/5 p-2">
      <div className="flex items-start justify-between gap-2">
        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground font-mono max-h-40 overflow-auto flex-1">
          {text}
        </pre>
        <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={copy}>
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Mirrors the Anthropic API drilldown, but for the Claap daily call ceiling:
 * which sync/action spent the quota, how many of those calls were avoidable,
 * and copy-paste prompts to cut them without losing any user-facing data.
 */
export function ClaapUsageDrilldownDialog({
  selection,
  onOpenChange,
}: {
  selection: ClaapDrilldownSelection | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<ClaapDrilldownRow[]>([]);
  const [quotaDays, setQuotaDays] = useState<ClaapQuotaDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [calls, setCalls] = useState<ClaapCallRow[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>(ALL);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setOpenKey(null);
      setCalls([]);
      const [{ data, error: qErr }, quotaRes] = await Promise.all([
        supabase.rpc("claap_usage_drilldown", {
          _start: dateKey(selection.start),
          _end: dateKey(selection.end),
        }),
        supabase
          .from("claap_api_usage")
          .select("usage_date, calls_made, daily_limit, first_429_at, last_429_at")
          .gte("usage_date", dateKey(selection.start))
          .lte("usage_date", dateKey(selection.end))
          .order("usage_date", { ascending: true }),
      ]);
      if (cancelled) return;
      if (qErr) setError(qErr.message);
      else setRows(((data as ClaapDrilldownRow[]) ?? []).map((r) => ({ ...r })));
      setQuotaDays((quotaRes.data as ClaapQuotaDay[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const summary = useMemo(
    () => recommendationsForClaapSelection(rows, quotaDays),
    [rows, quotaDays],
  );

  const loadCalls = async (row: ClaapDrilldownRow) => {
    if (!selection) return;
    const key = `${row.source}::${row.operation}`;
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    setCallsLoading(true);
    setSearch("");
    setOutcomeFilter(ALL);
    const { data, error: qErr } = await supabase
      .from("claap_api_call_log")
      .select("occurred_at, source, operation, outcome, skipped_reason, priority, external_id, latency_ms, error_message")
      .eq("source", row.source)
      .eq("operation", row.operation)
      .gte("usage_date", dateKey(selection.start))
      .lte("usage_date", dateKey(selection.end))
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (qErr) toast({ title: "Could not load calls", description: qErr.message, variant: "destructive" });
    setCalls((data as ClaapCallRow[]) ?? []);
    setCallsLoading(false);
  };

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (outcomeFilter !== ALL && c.outcome !== outcomeFilter) return false;
      if (!q) return true;
      return [c.external_id, c.skipped_reason, c.error_message, c.priority]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [calls, search, outcomeFilter]);

  return (
    <Dialog open={!!selection} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Claap API quota drilldown</DialogTitle>
          <DialogDescription>
            {selection?.label} — what drove Claap calls, and how to cut them without losing data.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading usage…
          </div>
        ) : error ? (
          <p className="text-sm text-red-400 py-8">{error}</p>
        ) : (
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Billable calls" value={fmt(summary.totals.billable)} />
                <Stat label="Calls avoided" value={fmt(summary.totals.skipped)} tone="text-emerald-400" />
                <Stat label="Redundant fetches" value={fmt(summary.totals.repeats)} tone={summary.totals.repeats ? "text-amber-400" : undefined} />
                <Stat label="Rate limited" value={fmt(summary.totals.rateLimited)} tone={summary.totals.rateLimited ? "text-red-400" : undefined} />
                <Stat
                  label="Days at limit"
                  value={`${fmt(summary.totals.saturatedDays)}${summary.totals.peakUtilizationPct ? ` · peak ${summary.totals.peakUtilizationPct.toFixed(0)}%` : ""}`}
                  tone={summary.totals.saturatedDays ? "text-red-400" : summary.totals.nearLimitDays ? "text-amber-400" : undefined}
                />
                <Stat label="Errors" value={fmt(summary.totals.errors)} tone={summary.totals.errors ? "text-amber-400" : undefined} />
              </div>

              <Card className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-medium">How to minimize calls</h3>
                </div>
                <div className="space-y-2">
                  {summary.recommendations.map((rec) => (
                    <div key={rec.id} className="rounded-md border border-border/60 p-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={SEVERITY_STYLES[rec.severity]}>
                          {rec.severity}
                        </Badge>
                        <span className="text-sm font-medium">{rec.title}</span>
                        {rec.savings && (
                          <span className="text-xs text-muted-foreground">· {rec.savings}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{rec.detail}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[240px]">Source</TableHead>
                      <TableHead>Operation</TableHead>
                      <TableHead className="text-right">Billable</TableHead>
                      <TableHead className="text-right">Avoided</TableHead>
                      <TableHead className="text-right">Recordings</TableHead>
                      <TableHead className="text-right">Repeats</TableHead>
                      <TableHead className="text-right">429s</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="text-right">Avg ms</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                          No Claap calls recorded in this window.
                        </TableCell>
                      </TableRow>
                    )}
                    {rows.map((row) => {
                      const key = `${row.source}::${row.operation}`;
                      const isOpen = openKey === key;
                      const recs = recommendationsForClaapRow(row);
                      return (
                        <Fragment key={key}>
                          <TableRow className="cursor-pointer" onClick={() => loadCalls(row)}>
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-1">
                                {isOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {claapSourceLabel(row.source)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.operation}</TableCell>
                            <TableCell className="text-right">{fmt(row.billable_calls)}</TableCell>
                            <TableCell className="text-right text-emerald-400">{fmt(row.skipped_calls)}</TableCell>
                            <TableCell className="text-right">{fmt(row.distinct_recordings)}</TableCell>
                            <TableCell className="text-right">{fmt(row.repeat_recordings)}</TableCell>
                            <TableCell className="text-right">{fmt(row.rate_limited)}</TableCell>
                            <TableCell className="text-right">{fmt(row.errors)}</TableCell>
                            <TableCell className="text-right">{fmt(row.avg_latency_ms)}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow>
                              <TableCell colSpan={9} className="bg-white/[0.02]">
                                <div className="space-y-3 py-2">
                                  <div>
                                    {recs.map((rec) => (
                                      <div key={rec.id} className="rounded-md border border-border/60 p-2 mb-2">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className={SEVERITY_STYLES[rec.severity]}>
                                            {rec.severity}
                                          </Badge>
                                          <span className="text-sm font-medium">{rec.title}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">{rec.detail}</p>
                                        <RecommendationPrompt text={promptForClaapRecommendation(rec, row)} />
                                      </div>
                                    ))}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="relative flex-1 min-w-[200px]">
                                      <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                      <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search recording id, reason, error…"
                                        className="pl-7 h-8 text-xs"
                                      />
                                    </div>
                                    <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                                      <SelectTrigger className="h-8 w-[160px] text-xs">
                                        <SelectValue placeholder="Outcome" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={ALL}>All outcomes</SelectItem>
                                        <SelectItem value="call">Billable call</SelectItem>
                                        <SelectItem value="skipped">Avoided</SelectItem>
                                        <SelectItem value="rate_limited">Rate limited</SelectItem>
                                        <SelectItem value="error">Error</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {callsLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading calls…
                                    </div>
                                  ) : (
                                    <div className="max-h-[320px] overflow-auto rounded-md border border-border/60">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">When</TableHead>
                                            <TableHead className="text-xs">Outcome</TableHead>
                                            <TableHead className="text-xs">Reason</TableHead>
                                            <TableHead className="text-xs">Recording</TableHead>
                                            <TableHead className="text-xs">Priority</TableHead>
                                            <TableHead className="text-xs text-right">ms</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {filteredCalls.length === 0 && (
                                            <TableRow>
                                              <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                                No calls match these filters.
                                              </TableCell>
                                            </TableRow>
                                          )}
                                          {filteredCalls.map((c, i) => (
                                            <TableRow key={i}>
                                              <TableCell className="text-xs whitespace-nowrap">
                                                {new Date(c.occurred_at).toLocaleString()}
                                              </TableCell>
                                              <TableCell>
                                                <Badge variant="outline" className={`text-[10px] ${OUTCOME_STYLES[c.outcome] ?? ""}`}>
                                                  {c.outcome}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                                                {c.skipped_reason ?? c.error_message ?? "—"}
                                              </TableCell>
                                              <TableCell className="text-xs font-mono text-muted-foreground max-w-[180px] truncate">
                                                {c.external_id ?? "—"}
                                              </TableCell>
                                              <TableCell className="text-xs text-muted-foreground">{c.priority ?? "—"}</TableCell>
                                              <TableCell className="text-xs text-right">{fmt(c.latency_ms)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
