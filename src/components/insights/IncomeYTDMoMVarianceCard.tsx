import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTimeframeRange } from "./useTimeframeRange";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Income: YTD MoM Variance.
 *
 * Sums QuickBooks invoice income per month for Jan → current month across
 * the four 5th Line entities, plots month-over-month variance (current
 * month - prior month) as positive/negative bars, and shows total YTD
 * income as a summary metric.
 */

const REALMS = [
  { id: "9341451968897660", name: "5th Line Financial Services, LLC" },
  { id: "193514877331929", name: "5th Line Capital Advisors LLC" },
  { id: "9130350272677286", name: "5th Line Technologies LLC" },
  { id: "123146077561874", name: "5th Line Capital, LLC" },
];
const REALM_IDS = REALMS.map((r) => r.id);
const REALM_NAMES = Object.fromEntries(REALMS.map((r) => [r.id, r.name]));

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtUSDFull(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function IncomeYTDMoMVarianceCard() {
  const { user } = useAuth();
  const { rangeStart, rangeEnd, months, periodLabel } = useTimeframeRange();
  const [entityId, setEntityId] = useState<string>("__all__");
  const entityLabel =
    entityId === "__all__" ? "Total (all entities)" : REALM_NAMES[entityId] ?? "—";

  // Pull the month immediately before the window so the first bar has a baseline.
  const priorMonthStart = useMemo(() => {
    if (!months.length) return rangeStart;
    const first = months[0];
    const d = new Date(first.y, first.m - 1, 1);
    return isoDate(d);
  }, [months, rangeStart]);

  const { data, isLoading } = useQuery({
    queryKey: ["income-mom-variance", user?.id, priorMonthStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, txn_date, total_amt, synced_at")
        .in("realm_id", REALM_IDS)
        .gte("txn_date", priorMonthStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;
      // totals[`${realmId}::${ymKey}`] = amount — allows client-side filtering
      const totals = new Map<string, number>();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date || !r.realm_id) continue;
        const d = new Date(r.txn_date);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const k = `${r.realm_id}::${ym}`;
        const amt = Number(r.total_amt ?? 0);
        totals.set(k, (totals.get(k) ?? 0) + amt);
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { totals, lastSync };
    },
  });

  const totals = data?.totals ?? new Map<string, number>();
  const activeRealms = entityId === "__all__" ? REALM_IDS : [entityId];
  const sumFor = (ym: string) =>
    activeRealms.reduce((a, rid) => a + (totals.get(`${rid}::${ym}`) ?? 0), 0);
  const monthly = months.map((mo) => sumFor(mo.key));
  const priorMonthKey = priorMonthStart.slice(0, 7);
  const priorTotal = sumFor(priorMonthKey);
  const ytdTotal = monthly.reduce((a, b) => a + b, 0);

  const chartData = months.map((mo, i) => {
    const amt = monthly[i];
    const prior = i === 0 ? priorTotal : monthly[i - 1];
    const hasPrior = i === 0 ? priorTotal > 0 : true;
    const variance = hasPrior ? amt - prior : 0;
    const pct = prior !== 0 ? (variance / prior) * 100 : null;
    return {
      month: mo.label,
      income: amt,
      variance,
      pct,
      hasPrior,
      label: hasPrior ? fmtCompact(variance) : "—",
    };
  });

  const hasAnyData = monthly.some((v) => v > 0);
  const positiveColor = "hsl(142 71% 50%)";
  const negativeColor = "hsl(0 84% 60%)";

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
          Income · MoM Variance
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger className="h-7 text-[11px] bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.85)] min-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Total (all entities)</SelectItem>
              {REALMS.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div
              className="text-[10px] tracking-wide uppercase"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Total Income · {entityLabel} · {periodLabel}
            </div>
            {isLoading ? (
              <div className="h-9 w-40 rounded bg-white/5 animate-pulse mt-1" />
            ) : (
              <div
                className="font-semibold tracking-tight text-foreground"
                style={{ fontSize: 28, lineHeight: 1.1 }}
              >
                {fmtUSDFull(ytdTotal)}
              </div>
            )}
          </div>
          <div
            className="text-[10px] tracking-wide"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            MoM variance · {periodLabel}
          </div>
        </div>

        {isLoading ? (
          <div className="h-[260px] rounded bg-white/5 animate-pulse" />
        ) : !hasAnyData ? (
          <div
            className="h-[260px] flex items-center justify-center text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[260px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 24, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
                  tickFormatter={fmtCompact}
                />
                <ReferenceLine y={0} stroke="rgba(180,210,255,0.35)" />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.15)" }}
                  contentStyle={{
                    background: "rgba(10,30,55,0.95)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgb(220,235,255)",
                  }}
                  formatter={(_value: number, _name, p) => {
                    const row = p?.payload as typeof chartData[number] | undefined;
                    if (!row) return ["", ""];
                    if (!row.hasPrior) return ["No prior month", "MoM"];
                    return [
                      `${fmtUSDFull(row.variance)}${row.pct == null ? "" : ` (${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(1)}%)`} · income ${fmtUSDFull(row.income)}`,
                      "MoM variance",
                    ];
                  }}
                />
                <Bar dataKey="variance" radius={[4, 4, 4, 4]} maxBarSize={48}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        !d.hasPrior
                          ? "rgba(140,160,200,0.4)"
                          : d.variance >= 0
                            ? positiveColor
                            : negativeColor
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="label"
                    position="top"
                    style={{
                      fill: "rgb(220,235,255)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeYTDMoMVarianceCard;