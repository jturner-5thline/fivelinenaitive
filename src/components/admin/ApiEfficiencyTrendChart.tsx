import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Time-series companion to the efficiency table: the table answers "how
 * efficient is this activity right now?", this answers "which direction is it
 * moving?". Tokens per call (cost weight of each request) and error rate are
 * plotted on the same bucketed timeline so a regression shows up as a slope
 * rather than as a single delta arrow.
 */

interface TrendRow {
  bucket_start: string;
  bucket: string;
  feature: string;
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  errors: number;
  tokens_per_call: number | null;
  error_rate: number | null;
}

type Grain = "auto" | "hour" | "day";

const ALL = "__all__";

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function labelFor(iso: string, grain: string): string {
  const d = new Date(iso);
  return grain === "hour"
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ApiEfficiencyTrendChart({
  start,
  end,
  rangeLabel,
  userIds,
  dealClasses,
  engagementTypes,
  reloadKey,
}: {
  start: Date;
  end: Date;
  rangeLabel: string;
  userIds: string[] | null;
  dealClasses: string[] | null;
  engagementTypes: string[] | null;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feature, setFeature] = useState<string>(ALL);
  const [grain, setGrain] = useState<Grain>("auto");

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const filterKey = JSON.stringify([userIds, dealClasses, engagementTypes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [uids, classes, engagements] = JSON.parse(filterKey) as [
          string[] | null,
          string[] | null,
          string[] | null,
        ];
        const { data, error: rpcError } = await supabase.rpc(
          "api_usage_efficiency_timeseries" as never,
          {
            _start: startIso,
            _end: endIso,
            _user_ids: uids,
            _deal_classes: classes,
            _engagement_types: engagements,
            _bucket: grain === "auto" ? null : grain,
          } as never,
        );
        if (cancelled) return;
        if (rpcError) throw rpcError;
        setRows((data as unknown as TrendRow[]) ?? []);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trend");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startIso, endIso, filterKey, grain, reloadKey]);

  // Activity picker options, busiest first.
  const features = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) {
      totals.set(r.feature, (totals.get(r.feature) ?? 0) + Number(r.calls ?? 0));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([f, calls]) => ({ f, calls }));
  }, [rows]);

  // Re-derive the ratios after filtering so "All activities" is a true weighted
  // average rather than an average of per-activity averages.
  const { series, grainUsed } = useMemo(() => {
    const scoped = feature === ALL ? rows : rows.filter((r) => r.feature === feature);
    const byBucket = new Map<
      string,
      { calls: number; tokens: number; errors: number }
    >();
    for (const r of scoped) {
      const key = r.bucket_start;
      const agg = byBucket.get(key) ?? { calls: 0, tokens: 0, errors: 0 };
      agg.calls += Number(r.calls ?? 0);
      agg.tokens += Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0);
      agg.errors += Number(r.errors ?? 0);
      byBucket.set(key, agg);
    }
    const g = scoped[0]?.bucket ?? rows[0]?.bucket ?? "day";
    const points = [...byBucket.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucketStart, agg]) => ({
        bucketStart,
        label: labelFor(bucketStart, g),
        calls: agg.calls,
        tokensPerCall: agg.calls ? Math.round(agg.tokens / agg.calls) : 0,
        errorRate: agg.calls ? Number(((100 * agg.errors) / agg.calls).toFixed(2)) : 0,
      }));
    return { series: points, grainUsed: g };
  }, [rows, feature]);

  const totals = useMemo(() => {
    const calls = series.reduce((s, p) => s + p.calls, 0);
    const tokens = series.reduce((s, p) => s + p.tokensPerCall * p.calls, 0);
    const errors = series.reduce((s, p) => s + (p.errorRate / 100) * p.calls, 0);
    return {
      calls,
      tokensPerCall: calls ? Math.round(tokens / calls) : 0,
      errorRate: calls ? (100 * errors) / calls : 0,
    };
  }, [series]);

  return (
    <div className="px-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Efficiency over time</h3>
          <p className="text-xs text-muted-foreground">
            Tokens per call and error rate per {grainUsed === "hour" ? "hour" : "day"} across the
            last {rangeLabel}. A rising tokens-per-call line means each request is carrying more
            context — that's the cost curve, independent of how many calls you make.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={feature} onValueChange={setFeature}>
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="All activities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All activities</SelectItem>
              {features.map(({ f, calls }) => (
                <SelectItem key={f} value={f}>
                  {f} · {fmtInt(calls)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-md border border-border/60 p-0.5">
            {(["auto", "hour", "day"] as Grain[]).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={grain === g ? "secondary" : "ghost"}
                className="h-7 px-2 text-xs capitalize"
                onClick={() => setGrain(g)}
              >
                {g}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="py-3 text-sm text-red-300">{error}</div>}

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          Avg tokens / call:{" "}
          <span className="text-foreground font-medium">{fmtInt(totals.tokensPerCall)}</span>
        </span>
        <span>
          Avg error rate:{" "}
          <span className="text-foreground font-medium">{totals.errorRate.toFixed(2)}%</span>
        </span>
        <span>
          Calls: <span className="text-foreground font-medium">{fmtInt(totals.calls)}</span>
        </span>
      </div>

      <div className="mt-2 h-[240px]">
        {loading && !series.length ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading trend…
          </div>
        ) : !series.length ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No model calls in this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                yAxisId="tokens"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
              />
              <YAxis
                yAxisId="errors"
                orientation="right"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, (max: number) => Math.max(5, Math.ceil(max))]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <ReTooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) =>
                  name === "Error rate"
                    ? [`${Number(value).toFixed(2)}%`, name]
                    : [fmtInt(Number(value)), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="tokens"
                type="monotone"
                dataKey="tokensPerCall"
                name="Tokens / call"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="errors"
                type="monotone"
                dataKey="errorRate"
                name="Error rate"
                stroke="#f87171"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
