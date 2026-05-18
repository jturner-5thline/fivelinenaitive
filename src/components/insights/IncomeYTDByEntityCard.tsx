import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
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

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

  const { yearStart, today, currentMonth, year } = useMemo(() => {
    const now = new Date();
    return {
      yearStart: isoDate(new Date(now.getFullYear(), 0, 1)),
      today: isoDate(now),
      currentMonth: now.getMonth(),
      year: now.getFullYear(),
    };
  }, []);

  const realmIds = ENTITIES.map((e) => e.realmId);

  const { data, isLoading } = useQuery({
    queryKey: ["income-ytd-by-entity", user?.id, yearStart, today],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, txn_date, total_amt, synced_at")
        .in("realm_id", realmIds)
        .gte("txn_date", yearStart)
        .lte("txn_date", today);
      if (error) throw error;
      // monthly[realmId][monthIdx]
      const monthly: Record<string, number[]> = {};
      for (const e of ENTITIES) monthly[e.realmId] = new Array(12).fill(0);
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date || !r.realm_id) continue;
        const d = new Date(r.txn_date);
        if (d.getFullYear() !== year) continue;
        const m = d.getMonth();
        const arr = monthly[r.realm_id];
        if (arr) arr[m] += Number(r.total_amt ?? 0);
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { monthly, lastSync };
    },
  });

  const chartData = useMemo(() => {
    const monthly = data?.monthly;
    const months = MONTH_LABELS.slice(0, currentMonth + 1);
    const running: Record<string, number> = {};
    for (const e of ENTITIES) running[e.realmId] = 0;
    return months.map((m, i) => {
      const row: Record<string, number | string> = { month: m };
      for (const e of ENTITIES) {
        const amt = monthly?.[e.realmId]?.[i] ?? 0;
        running[e.realmId] += amt;
        row[e.label] = running[e.realmId];
      }
      return row;
    });
  }, [data, currentMonth]);

  const hasAnyData = chartData.some((row) =>
    ENTITIES.some((e) => Number(row[e.label] ?? 0) > 0)
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
          Income · YTD by Entity
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

      <div className="p-4 space-y-3">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          Cumulative YTD income · Jan – {MONTH_LABELS[currentMonth]} {year}
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
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
                <Tooltip
                  contentStyle={{
                    background: "rgba(10,30,55,0.95)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgb(220,235,255)",
                  }}
                  formatter={(value: number, name) => [fmtUSDFull(Number(value)), name as string]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}
                  iconType="circle"
                />
                {ENTITIES.map((e) => (
                  <Line
                    key={e.realmId}
                    type="monotone"
                    dataKey={e.label}
                    stroke={e.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: e.color }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeYTDByEntityCard;