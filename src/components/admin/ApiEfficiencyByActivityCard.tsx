import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Efficiency-by-activity view. Volume alone always grows with adoption, so
 * every column here is a *ratio* (tokens per call, calls per deal, calls per
 * recording, waste/skip/error rates) plus a delta against the immediately
 * preceding period of the same length. Rising volume with flat ratios = healthy
 * growth; rising ratios = the integration is getting less efficient.
 */

interface LlmRow {
  feature: string;
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  errors: number;
  cache_read_tokens: number;
  distinct_users: number;
  distinct_deals: number;
  distinct_days: number;
  tokens_per_call: number | null;
  error_rate: number | null;
  cache_read_share: number | null;
  calls_per_deal: number | null;
  calls_per_user: number | null;
  prev_calls: number;
  prev_tokens_per_call: number | null;
  prev_calls_per_deal: number | null;
}

interface ClaapRow {
  source: string;
  operation: string;
  calls: number;
  skipped: number;
  errors: number;
  distinct_recordings: number;
  distinct_deals: number;
  distinct_days: number;
  calls_per_recording: number | null;
  redundant_calls: number;
  skip_rate: number | null;
  error_rate: number | null;
  avg_latency_ms: number | null;
  prev_calls: number;
  prev_calls_per_recording: number | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function ratio(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

/** Delta chip: lower is better for every ratio we show here. */
function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null || Number(previous) === 0) {
    return <span className="text-muted-foreground text-[11px]">new</span>;
  }
  const change = ((Number(current) - Number(previous)) / Number(previous)) * 100;
  if (Math.abs(change) < 5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" /> flat
      </span>
    );
  }
  const worse = change > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] ${
        worse ? "text-amber-300" : "text-emerald-400"
      }`}
    >
      {worse ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

export function ApiEfficiencyByActivityCard({
  start,
  end,
  rangeLabel,
  reloadKey,
  onSelectFeature,
}: {
  start: Date;
  end: Date;
  rangeLabel: string;
  reloadKey: number;
  onSelectFeature?: (provider: string, feature: string) => void;
}) {
  const [llm, setLlm] = useState<LlmRow[]>([]);
  const [claap, setClaap] = useState<ClaapRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [llmRes, claapRes] = await Promise.all([
          supabase.rpc("api_usage_efficiency_by_activity" as never, {
            _start: startIso,
            _end: endIso,
          } as never),
          supabase.rpc("claap_usage_efficiency_by_activity" as never, {
            _start: startIso,
            _end: endIso,
          } as never),
        ]);
        if (cancelled) return;
        if (llmRes.error) throw llmRes.error;
        if (claapRes.error) throw claapRes.error;
        setLlm((llmRes.data as unknown as LlmRow[]) ?? []);
        setClaap((claapRes.data as unknown as ClaapRow[]) ?? []);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load efficiency");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startIso, endIso, reloadKey]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-medium">Efficiency by activity</h2>
        <p className="text-xs text-muted-foreground">
          Cost per unit of work over the last {rangeLabel}, not raw volume — so these stay
          comparable as usage grows. Arrows compare against the previous {rangeLabel}; amber means
          the activity got less efficient.
        </p>
      </div>

      {error && <div className="px-4 py-3 text-sm text-red-300">{error}</div>}

      <Tabs defaultValue="llm">
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="llm">AI / LLM</TabsTrigger>
            <TabsTrigger value="claap">Claap</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="llm" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens / call</TableHead>
                <TableHead className="text-right">Calls / deal</TableHead>
                <TableHead className="text-right">Calls / user</TableHead>
                <TableHead className="text-right">Cache read</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && llm.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && llm.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    No LLM calls recorded in this range.
                  </TableCell>
                </TableRow>
              )}
              {llm.map((r) => (
                <TableRow
                  key={`eff-${r.feature}-${r.provider}`}
                  className={onSelectFeature ? "cursor-pointer" : undefined}
                  onClick={() => onSelectFeature?.(r.provider, r.feature)}
                >
                  <TableCell className="font-medium">{r.feature}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {r.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.calls)}
                    <div>
                      <Delta current={r.calls} previous={r.prev_calls} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.tokens_per_call)}
                    <div>
                      <Delta current={r.tokens_per_call} previous={r.prev_tokens_per_call} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {ratio(r.calls_per_deal)}
                    <div>
                      <Delta current={r.calls_per_deal} previous={r.prev_calls_per_deal} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{ratio(r.calls_per_user)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.cache_read_share == null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          Number(r.cache_read_share) >= 40 ? "text-emerald-400" : undefined
                        }
                      >
                        {pct(r.cache_read_share)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.errors) > 0 ? (
                      <span className="text-red-400">{pct(r.error_rate)}</span>
                    ) : (
                      "0%"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Tokens / call is prompt weight, calls / deal is how many times an activity re-runs on
            the same work. Both should stay flat as volume rises — a climbing ratio is where to
            cache, batch or pre-filter.
          </p>
        </TabsContent>

        <TabsContent value="claap" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Recordings</TableHead>
                <TableHead className="text-right">Calls / recording</TableHead>
                <TableHead className="text-right">Redundant</TableHead>
                <TableHead className="text-right">Skipped</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && claap.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && claap.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    No Claap calls recorded in this range.
                  </TableCell>
                </TableRow>
              )}
              {claap.map((r) => (
                <TableRow key={`claap-eff-${r.source}-${r.operation}`}>
                  <TableCell className="font-medium">{r.source}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.operation}</TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.calls)}
                    <div>
                      <Delta current={r.calls} previous={r.prev_calls} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.distinct_recordings)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {ratio(r.calls_per_recording)}
                    <div>
                      <Delta
                        current={r.calls_per_recording}
                        previous={r.prev_calls_per_recording}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.redundant_calls) > 0 ? (
                      <span className="text-amber-300">{fmt(r.redundant_calls)}</span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmt(r.skipped)}
                    <span className="text-muted-foreground text-[11px]"> ({pct(r.skip_rate)})</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(r.errors) > 0 ? (
                      <span className="text-red-400">
                        {fmt(r.errors)} ({pct(r.error_rate)})
                      </span>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.avg_latency_ms == null ? "—" : `${fmt(r.avg_latency_ms)} ms`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Calls / recording is the Claap efficiency number: 1.0 means every call fetched a new
            recording. Anything above that is re-fetching the same content — "Redundant" counts
            those calls, and skips are calls the cache avoided entirely.
          </p>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
