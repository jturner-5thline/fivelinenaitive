import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { AlertTriangle, Video, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ClaapUsageDrilldownDialog,
  type ClaapDrilldownSelection,
} from "@/components/admin/ClaapUsageDrilldownDialog";

interface ClaapUsageRow {
  usage_date: string;
  calls_made: number;
  daily_limit: number;
  first_429_at: string | null;
  last_429_at: string | null;
  last_call_at: string | null;
  reset_at: string;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Claap has a hard per-day API call ceiling that the nAItive syncs share.
 * This surfaces today's burn-down plus the trailing 30 days so throttling
 * is visible before a 429 storm takes the sync offline.
 */
export function ClaapApiUsageCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const [rows, setRows] = useState<ClaapUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ClaapDrilldownSelection | null>(null);

  const openDay = (usageDate: string) => {
    const d = new Date(`${usageDate}T00:00:00Z`);
    setSelection({
      start: d,
      end: d,
      label: d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    });
  };

  const openRange = () => {
    const end = new Date();
    const start = new Date(Date.now() - 29 * 86_400_000);
    setSelection({ start, end, label: "Last 30 days" });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const { data, error: qErr } = await supabase
        .from("claap_api_usage")
        .select("usage_date, calls_made, daily_limit, first_429_at, last_429_at, last_call_at, reset_at")
        .gte("usage_date", since)
        .order("usage_date", { ascending: true });
      if (cancelled) return;
      if (qErr) setError(qErr.message);
      else setRows((data as ClaapUsageRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const today = useMemo(() => {
    const key = new Date().toISOString().slice(0, 10);
    return rows.find((r) => r.usage_date === key) ?? rows[rows.length - 1] ?? null;
  }, [rows]);

  const stats = useMemo(() => {
    if (!rows.length) return { peak: 0, avg: 0, throttledDays: 0 };
    const calls = rows.map((r) => Number(r.calls_made || 0));
    return {
      peak: Math.max(...calls),
      avg: calls.reduce((a, b) => a + b, 0) / calls.length,
      throttledDays: rows.filter((r) => r.first_429_at).length,
    };
  }, [rows]);

  const limit = Number(today?.daily_limit ?? 1000);
  const used = Number(today?.calls_made ?? 0);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-emerald-400";

  const chartData = rows.map((r) => ({
    label: dayLabel(r.usage_date),
    usageDate: r.usage_date,
    calls: Number(r.calls_made || 0),
    throttled: !!r.first_429_at,
  }));

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">Claap API quota</h2>
            <p className="text-xs text-muted-foreground">
              Daily call ceiling shared by every nAItive Claap sync. Resets{" "}
              {today ? new Date(today.reset_at).toLocaleString() : "daily at 00:00 UTC"}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {today?.last_429_at ? (
            <Badge variant="outline" className="border-red-500/50 text-red-400">
              <AlertTriangle className="h-3 w-3 mr-1" /> Rate limited today
            </Badge>
          ) : (
            <Badge variant="outline" className="capitalize">
              {loading ? "loading" : "healthy"}
            </Badge>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openRange}>
            <BarChart3 className="h-3 w-3 mr-1" /> Drilldown
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <div>
          <div className="flex items-baseline justify-between">
            <span className={`text-2xl font-semibold ${tone}`}>
              {fmt(used)} <span className="text-sm text-muted-foreground">/ {fmt(limit)} calls today</span>
            </span>
            <span className="text-xs text-muted-foreground">{pct.toFixed(1)}% of quota</span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {today?.last_call_at
              ? `Last call ${new Date(today.last_call_at).toLocaleString()}`
              : "No calls recorded yet today."}
            {today?.first_429_at
              ? ` · First 429 at ${new Date(today.first_429_at).toLocaleTimeString()}`
              : ""}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Peak day (30d)" value={fmt(stats.peak)} />
          <MiniStat label="Avg / day (30d)" value={fmt(stats.avg)} />
          <MiniStat
            label="Days throttled"
            value={fmt(stats.throttledDays)}
            tone={stats.throttledDays > 0 ? "text-red-400" : undefined}
          />
        </div>

        <div className="h-[220px]">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(Number(v))} width={60} />
                <Tooltip
                  formatter={(value: number) => [fmt(value), "Calls"]}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <ReferenceLine
                  y={limit}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 4"
                  label={{ value: "Daily limit", position: "insideTopRight", fontSize: 10 }}
                />
                <Bar
                  dataKey="calls"
                  radius={[2, 2, 0, 0]}
                  cursor="pointer"
                  onClick={(d: any) => d?.payload?.usageDate && openDay(d.payload.usageDate)}
                >
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.throttled ? "hsl(var(--destructive))" : "hsl(210 90% 60%)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "No Claap API usage recorded."}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Click any day to see the syncs and actions that spent the quota.
        </p>
      </div>

      <ClaapUsageDrilldownDialog
        selection={selection}
        onOpenChange={(open) => !open && setSelection(null)}
      />
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
