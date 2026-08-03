import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiUsageDrilldownDialog,
  type DrilldownSelection,
} from "@/components/admin/ApiUsageDrilldownDialog";
import { ClaapApiUsageCard } from "@/components/admin/ClaapApiUsageCard";

// Internal-only cross-provider LLM usage observability.
// Data comes from SECURITY DEFINER RPCs that re-check
// public.is_fifth_line_internal_admin(), so the route itself is not the gate.

interface SeriesRow {
  bucket: string;
  provider: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  errors: number;
}

interface FeatureRow {
  feature: string;
  provider: string;
  model: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  errors: number;
  last_call_at: string;
}

interface FrequencyRow {
  feature: string;
  provider: string;
  calls: number;
  active_days: number;
  active_hours: number;
  calls_per_day: number;
  calls_per_active_day: number;
  peak_hour_calls: number;
  peak_hour_at: string | null;
  median_gap_minutes: number | null;
  min_gap_seconds: number | null;
  burst_calls: number;
  distinct_users: number;
  first_call_at: string;
  last_call_at: string;
}

/** Human-readable cadence, e.g. "every 12 min" or "every 3.2 h". */
function cadence(medianGapMinutes: number | null | undefined): string {
  const m = Number(medianGapMinutes ?? 0);
  if (!medianGapMinutes || m <= 0) return "—";
  if (m < 1) return `every ${Math.round(m * 60)} s`;
  if (m < 90) return `every ${m < 10 ? m.toFixed(1) : Math.round(m)} min`;
  const h = m / 60;
  if (h < 48) return `every ${h.toFixed(1)} h`;
  return `every ${(h / 24).toFixed(1)} d`;
}

type RangeKey = "24h" | "72h" | "7d" | "30d" | "quarter";

const RANGES: { key: RangeKey; label: string; hours: number; bucket: "hour" | "day" }[] = [
  { key: "24h", label: "24 hours", hours: 24, bucket: "hour" },
  { key: "72h", label: "72 hours", hours: 72, bucket: "hour" },
  { key: "7d", label: "7 days", hours: 24 * 7, bucket: "day" },
  { key: "30d", label: "30 days", hours: 24 * 30, bucket: "day" },
  { key: "quarter", label: "By quarter", hours: 24 * 365 * 2, bucket: "day" },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "hsl(24 90% 60%)",
  openai: "hsl(160 70% 45%)",
  google: "hsl(210 90% 60%)",
  perplexity: "hsl(280 70% 65%)",
  other: "hsl(220 10% 60%)",
};

const METRICS = [
  { key: "calls" as const, label: "Calls" },
  { key: "input_tokens" as const, label: "Input tokens" },
  { key: "output_tokens" as const, label: "Output tokens" },
];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function labelForBucket(iso: string, range: RangeKey): string {
  const d = new Date(iso);
  if (range === "quarter") {
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  }
  if (range === "24h" || range === "72h") {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ApiUsageAdmin() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [range, setRange] = useState<RangeKey>("24h");
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [frequency, setFrequency] = useState<FrequencyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selection, setSelection] = useState<DrilldownSelection | null>(null);

  const openSlice = (bucketIso: string, provider: string | null) => {
    const start = new Date(bucketIso);
    const end = new Date(start);
    if (range === "quarter") end.setUTCMonth(end.getUTCMonth() + 3);
    else if (range === "24h" || range === "72h") end.setUTCHours(end.getUTCHours() + 1);
    else end.setUTCDate(end.getUTCDate() + 1);
    setSelection({
      start,
      end,
      provider,
      label: labelForBucket(bucketIso, range),
    });
  };

  const openRange = (provider: string | null, label: string) => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const end = new Date();
    const start = new Date(end.getTime() - cfg.hours * 3600_000);
    setSelection({ start, end, provider, label });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("is_fifth_line_internal_admin");
      if (cancelled) return;
      setAllowed(!rpcError && !!data);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const cfg = RANGES.find((r) => r.key === range)!;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const seriesPromise =
          range === "quarter"
            ? supabase.rpc("api_usage_by_quarter", { _quarters: 8 })
            : supabase.rpc("api_usage_timeseries", { _hours: cfg.hours, _bucket: cfg.bucket });
        const freqEnd = new Date();
        const freqStart = new Date(freqEnd.getTime() - cfg.hours * 3600_000);
        const [seriesRes, featureRes, freqRes] = await Promise.all([
          seriesPromise,
          supabase.rpc("api_usage_by_feature", { _hours: cfg.hours }),
          supabase.rpc("api_usage_frequency", {
            _start: freqStart.toISOString(),
            _end: freqEnd.toISOString(),
            _provider: null,
          }),
        ]);
        if (cancelled) return;
        if (seriesRes.error) throw seriesRes.error;
        if (featureRes.error) throw featureRes.error;
        setSeries((seriesRes.data as SeriesRow[]) ?? []);
        setFeatures((featureRes.data as FeatureRow[]) ?? []);
        setFrequency((freqRes.data as FrequencyRow[]) ?? []);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, range, reloadKey]);

  const providers = useMemo(() => {
    const set = new Set<string>();
    series.forEach((r) => set.add(r.provider));
    features.forEach((r) => set.add(r.provider));
    return Array.from(set).sort();
  }, [series, features]);

  // One row per bucket, one numeric column per provider, for each metric.
  const chartData = useMemo(() => {
    const byMetric: Record<string, Record<string, string | number>[]> = {};
    for (const metric of METRICS) {
      const map = new Map<string, Record<string, string | number>>();
      for (const row of series) {
        const existing = map.get(row.bucket) ?? {
          bucket: row.bucket,
          label: labelForBucket(row.bucket, range),
        };
        existing[row.provider] = Number(existing[row.provider] ?? 0) + Number(row[metric.key] ?? 0);
        map.set(row.bucket, existing);
      }
      byMetric[metric.key] = Array.from(map.values()).sort((a, b) =>
        String(a.bucket) < String(b.bucket) ? -1 : 1,
      );
    }
    return byMetric;
  }, [series, range]);

  const totals = useMemo(() => {
    return features.reduce(
      (acc, r) => ({
        calls: acc.calls + Number(r.calls || 0),
        input: acc.input + Number(r.input_tokens || 0),
        output: acc.output + Number(r.output_tokens || 0),
        errors: acc.errors + Number(r.errors || 0),
      }),
      { calls: 0, input: 0, output: 0, errors: 0 },
    );
  }, [features]);

  const byProvider = useMemo(() => {
    const map = new Map<string, { calls: number; input: number; output: number }>();
    for (const r of features) {
      const cur = map.get(r.provider) ?? { calls: 0, input: 0, output: 0 };
      cur.calls += Number(r.calls || 0);
      cur.input += Number(r.input_tokens || 0);
      cur.output += Number(r.output_tokens || 0);
      map.set(r.provider, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].calls - a[1].calls);
  }, [features]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2 h-4 w-4" /> Checking access…
      </div>
    );
  }
  if (!allowed) return <Navigate to="/pipeline" replace />;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">API Usage</h1>
          <p className="text-sm text-muted-foreground">
            Every LLM call across providers — which action made it and what it cost in tokens.{" "}
            <Link to="/admin/claude-usage" className="underline underline-offset-2">
              Claude cache detail →
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={range === r.key ? "default" : "outline"}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && <Card className="p-4 border-red-500/40 text-red-300 text-sm">{error}</Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Calls" value={fmt(totals.calls)} sub={`${features.length} actions`} />
        <KpiCard label="Input tokens" value={fmt(totals.input)} />
        <KpiCard label="Output tokens" value={fmt(totals.output)} />
        <KpiCard
          label="Errors"
          value={fmt(totals.errors)}
          sub={totals.calls ? `${((totals.errors / totals.calls) * 100).toFixed(1)}% of calls` : undefined}
        />
      </div>

      <Tabs defaultValue="calls">
        <TabsList>
          {METRICS.map((m) => (
            <TabsTrigger key={m.key} value={m.key}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {METRICS.map((m) => (
          <TabsContent key={m.key} value={m.key} className="mt-4">
            <Card className="p-4">
              <div className="h-[320px]">
                {chartData[m.key]?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData[m.key]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(Number(v))} width={70} />
                      <Tooltip
                        formatter={(value: number, name: string) => [fmt(value), name]}
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          color: "hsl(var(--popover-foreground))",
                        }}
                      />
                      <Legend />
                      {providers.map((p) => (
                        <Bar
                          key={p}
                          dataKey={p}
                          stackId="a"
                          fill={PROVIDER_COLORS[p] ?? PROVIDER_COLORS.other}
                          radius={[2, 2, 0, 0]}
                          cursor="pointer"
                          onClick={(entry: { payload?: { bucket?: string } }) => {
                            const bucket = entry?.payload?.bucket;
                            if (bucket) openSlice(bucket, p);
                          }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No calls recorded in this range."}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Click any bar segment to drill into the actions, models and token breakdown behind it.
              </p>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {byProvider.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {byProvider.map(([provider, v]) => (
            <Card
              key={provider}
              className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openRange(provider, `${provider} — ${RANGES.find((r) => r.key === range)!.label}`)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.other }}
                />
                <span className="text-sm font-medium capitalize">{provider}</span>
              </div>
              <div className="text-2xl font-semibold mt-1">{fmt(v.calls)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {fmt(v.input)} in / {fmt(v.output)} out
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60">
          <h2 className="text-sm font-medium">Actions that called the LLM</h2>
          <p className="text-xs text-muted-foreground">
            Grouped by feature and provider for the selected range.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action / feature</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">In tokens</TableHead>
              <TableHead className="text-right">Out tokens</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead>Last call</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && features.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && features.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  No LLM calls recorded in this range.
                </TableCell>
              </TableRow>
            )}
            {features.map((r) => (
              <TableRow
                key={`${r.feature}-${r.provider}`}
                className="cursor-pointer"
                onClick={() => openRange(r.provider, r.feature)}
              >
                <TableCell className="font-medium">{r.feature}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {r.provider}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.model ?? "—"}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.calls)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.input_tokens)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.output_tokens)}</TableCell>
                <TableCell className="text-right font-mono">
                  {Number(r.errors) > 0 ? <span className="text-red-400">{fmt(r.errors)}</span> : "0"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(r.last_call_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <FrequencyCard
        rows={frequency}
        loading={loading}
        rangeLabel={RANGES.find((r) => r.key === range)!.label}
        onSelect={(provider, feature) => openRange(provider, feature)}
      />

      <ClaapApiUsageCard reloadKey={reloadKey} />

      <ApiUsageDrilldownDialog
        selection={selection}
        onOpenChange={(open) => !open && setSelection(null)}
      />
    </div>
  );
}

function FrequencyCard({
  rows,
  loading,
  rangeLabel,
  onSelect,
}: {
  rows: FrequencyRow[];
  loading: boolean;
  rangeLabel: string;
  onSelect: (provider: string, feature: string) => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-medium">How often each action runs</h2>
        <p className="text-xs text-muted-foreground">
          Cadence over the last {rangeLabel}: average per day, typical gap between calls, busiest
          hour and back-to-back bursts (calls under 60s apart).
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action / feature</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Per day</TableHead>
            <TableHead className="text-right">Per active day</TableHead>
            <TableHead>Typical cadence</TableHead>
            <TableHead className="text-right">Busiest hour</TableHead>
            <TableHead className="text-right">Bursts &lt;60s</TableHead>
            <TableHead className="text-right">Active days</TableHead>
            <TableHead className="text-right">Users</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                No LLM calls recorded in this range.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow
              key={`freq-${r.feature}-${r.provider}`}
              className="cursor-pointer"
              onClick={() => onSelect(r.provider, r.feature)}
            >
              <TableCell className="font-medium">{r.feature}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {r.provider}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{fmt(r.calls)}</TableCell>
              <TableCell className="text-right font-mono">
                {Number(r.calls_per_day).toFixed(1)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {Number(r.calls_per_active_day).toFixed(1)}
              </TableCell>
              <TableCell className="text-xs">{cadence(r.median_gap_minutes)}</TableCell>
              <TableCell className="text-right text-xs">
                {r.peak_hour_at ? (
                  <span>
                    <span className="font-mono">{fmt(r.peak_hour_calls)}</span>{" "}
                    <span className="text-muted-foreground">
                      @ {new Date(r.peak_hour_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                      })}
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {Number(r.burst_calls) > 0 ? (
                  <span className="text-amber-300">{fmt(r.burst_calls)}</span>
                ) : (
                  "0"
                )}
              </TableCell>
              <TableCell className="text-right font-mono">{fmt(r.active_days)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(r.distinct_users)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
