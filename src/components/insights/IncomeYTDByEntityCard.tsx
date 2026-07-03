import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeframeRange } from "./useTimeframeRange";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChartTypeToggle, type ChartType } from "./ChartTypeToggle";
import { ChartSwap } from "./ChartSwap";
import { usePersistentChartType } from "@/hooks/usePersistentChartType";
import { cn } from "@/lib/utils";

/**
 * Income: YTD by Entity — cumulative YTD income per entity, one line each,
 * Jan → current month, sourced from QuickBooks invoices.
 */

const ENTITIES: { realmId: string; label: string; color: string }[] = [
  { realmId: "9341451968897660", label: "Financial Services", color: "hsl(200 90% 60%)" },
  { realmId: "193514877331929", label: "Capital Advisors", color: "hsl(142 71% 50%)" },
  { realmId: "9130350272677286", label: "Technologies", color: "hsl(45 90% 60%)" },
  { realmId: "123146077561874", label: "Capital", color: "hsl(280 70% 65%)" },
];

type MetricKey = "revenue" | "gross_profit" | "operating_profit";
const METRICS: {
  key: MetricKey;
  label: string;
  field: "income_total" | "gross_profit" | "net_operating_income";
}[] = [
  { key: "revenue", label: "Revenue", field: "income_total" },
  { key: "gross_profit", label: "Gross Profit", field: "gross_profit" },
  { key: "operating_profit", label: "Operating Profit", field: "net_operating_income" },
];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtUSDFull(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function IncomeYTDByEntityCard() {
  const { user } = useAuth();
  const { rangeStart, rangeEnd, months, periodLabel } = useTimeframeRange();
  const [cumulative, setCumulative] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [chartType, setChartType] = usePersistentChartType<ChartType>("incomeByEntity", "line");
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  const realmIds = ENTITIES.map((e) => e.realmId);

  const { data, isLoading } = useQuery({
    queryKey: ["income-ytd-by-entity", user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("qbo_pnl_snapshots")
        .select("realm_id, period_start, period_end, income_total, gross_profit, net_operating_income, fetched_at, accounting_method")
        .in("realm_id", realmIds)
        .gte("period_start", rangeStart)
        .lte("period_end", rangeEnd);
      if (error) throw error;
      // Pick the snapshot with the largest period_end per (realm, month),
      // tiebreak on latest fetched_at, so we use the most complete monthly P&L.
      const best: Record<string, { period_end: string; fetched_at: string; row: any }> = {};
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.period_start || !r.realm_id) continue;
        if ((r.accounting_method ?? "Accrual") !== "Accrual") continue;
        const d = new Date(r.period_start);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const key = `${r.realm_id}::${mKey}`;
        const prev = best[key];
        const pe = r.period_end ?? r.period_start;
        const fa = r.fetched_at ?? "";
        if (!prev || pe > prev.period_end || (pe === prev.period_end && fa > prev.fetched_at)) {
          best[key] = { period_end: pe, fetched_at: fa, row: r };
        }
        if (r.fetched_at && (!lastSync || r.fetched_at > lastSync)) lastSync = r.fetched_at;
      }
      // monthly[realmId][monthKey] -> { income_total, gross_profit, net_operating_income }
      const monthly: Record<string, Record<string, { income_total: number; gross_profit: number; net_operating_income: number }>> = {};
      for (const e of ENTITIES) monthly[e.realmId] = {};
      for (const key of Object.keys(best)) {
        const [realm, mKey] = key.split("::");
        const row = best[key].row;
        if (!monthly[realm]) continue;
        monthly[realm][mKey] = {
          income_total: Number(row.income_total ?? 0),
          gross_profit: Number(row.gross_profit ?? 0),
          net_operating_income: Number(row.net_operating_income ?? 0),
        };
      }
      return { monthly, lastSync };
    },
  });

  const chartData = useMemo(() => {
    const monthly = data?.monthly;
    const running: Record<string, number> = {};
    for (const e of ENTITIES) running[e.realmId] = 0;
    return months.map((mo) => {
      const row: Record<string, number | string> = { month: mo.label };
      for (const e of ENTITIES) {
        const amt = monthly?.[e.realmId]?.[mo.key]?.[activeMetric.field] ?? 0;
        if (cumulative) {
          running[e.realmId] += amt;
          row[e.label] = running[e.realmId];
        } else {
          row[e.label] = amt;
        }
      }
      return row;
    });
  }, [data, months, cumulative, activeMetric.field]);

  const hasAnyData = chartData.some((row) =>
    ENTITIES.some((e) => Math.abs(Number(row[e.label] ?? 0)) > 0)
  );

  return (
    <div
      className="w-full flex flex-col rounded-[10px] overflow-hidden relative"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg,transparent,hsla(213,90%,70%,0.4),transparent)",
        }}
      />
      <div
        className="px-3 py-2 flex items-center justify-between gap-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Income by Entity · {activeMetric.label}
        </div>
        <div className="flex items-center gap-3">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
          <div className="flex items-center gap-1.5">
            <Switch
              id="income-entity-cumulative"
              checked={cumulative}
              onCheckedChange={setCumulative}
            />
            <Label
              htmlFor="income-entity-cumulative"
              className="text-[10px] font-semibold uppercase tracking-wider text-white/70 cursor-pointer"
            >
              Cumulative
            </Label>
          </div>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            QuickBooks ·{" "}
            {data?.lastSync
              ? `synced ${formatDistanceToNow(new Date(data.lastSync), { addSuffix: true })}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div
            className="text-[10px] tracking-wide"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {cumulative ? `Cumulative ${activeMetric.label.toLowerCase()}` : `Monthly ${activeMetric.label.toLowerCase()}`} · {periodLabel}
          </div>
          <div
            className="inline-flex rounded-md overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}
            role="tablist"
            aria-label="Metric"
          >
            {METRICS.map((m) => {
              const active = m.key === metric;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMetric(m.key)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:text-white/85 hover:bg-white/5",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="h-[300px] rounded bg-white/5 animate-pulse" />
        ) : !hasAnyData ? (
          <div
            className="h-[300px] flex items-center justify-center text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[300px] w-full overflow-hidden">
            <ChartSwap chartType={chartType}>
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "line" ? (
                  <LineChart
                    data={chartData}
                    margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,170,220,0.12)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} tickFormatter={fmtCompact} />
                    <Tooltip
                      contentStyle={{ background: "rgba(10,30,55,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12, color: "rgb(220,235,255)" }}
                      formatter={(value: number, name) => [fmtUSDFull(Number(value)), name as string]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }} iconType="circle" />
                    {ENTITIES.map((e) => (
                      <Line key={e.realmId} type="monotone" dataKey={e.label} stroke={e.color} strokeWidth={2} dot={{ r: 3, fill: e.color }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,170,220,0.12)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} tickFormatter={fmtCompact} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.08)" }}
                      contentStyle={{ background: "rgba(10,30,55,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12, color: "rgb(220,235,255)" }}
                      formatter={(value: number, name) => [fmtUSDFull(Number(value)), name as string]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }} iconType="circle" />
                    {ENTITIES.map((e) => (
                      <Bar key={e.realmId} dataKey={e.label} fill={e.color} radius={[3, 3, 0, 0]} />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </ChartSwap>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeYTDByEntityCard;