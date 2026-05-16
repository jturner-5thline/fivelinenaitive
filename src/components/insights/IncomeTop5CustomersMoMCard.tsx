import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Income: Top 5 Customers MoM.
 *
 * Identifies the top 5 customers by income in the current calendar month
 * across the four 5th Line entities, then shows the same 5 customers
 * compared to the prior month with $ and % variance.
 */

const REALM_IDS = [
  "9341451968897660",
  "193514877331929",
  "9130350272677286",
  "123146077561874",
];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtUSD(n: number): string {
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function IncomeTop5CustomersMoMCard() {
  const { user } = useAuth();

  const { curStart, curEnd, prevStart, prevEnd, curLabel, prevLabel } =
    useMemo(() => {
      const now = new Date();
      const cs = new Date(now.getFullYear(), now.getMonth(), 1);
      const ce = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const ps = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pe = new Date(now.getFullYear(), now.getMonth(), 0);
      const fmt = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      return {
        curStart: isoDate(cs),
        curEnd: isoDate(ce),
        prevStart: isoDate(ps),
        prevEnd: isoDate(pe),
        curLabel: fmt(cs),
        prevLabel: fmt(ps),
      };
    }, []);

  const { data, isLoading } = useQuery({
    queryKey: [
      "income-top5-mom",
      user?.id,
      curStart,
      curEnd,
      prevStart,
      prevEnd,
    ],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, customer_id, customer_name, total_amt, synced_at")
        .in("realm_id", REALM_IDS)
        .gte("txn_date", prevStart)
        .lte("txn_date", curEnd);
      if (error) throw error;
      const byCustomer = new Map<
        string,
        { customer: string; current: number; prior: number }
      >();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date) continue;
        const id = r.customer_id || r.customer_name;
        if (!id) continue;
        const name = r.customer_name || r.customer_id || "Unknown";
        const amt = Number(r.total_amt ?? 0);
        let row = byCustomer.get(id);
        if (!row) {
          row = { customer: name, current: 0, prior: 0 };
          byCustomer.set(id, row);
        }
        if (r.txn_date >= curStart && r.txn_date <= curEnd) row.current += amt;
        else if (r.txn_date >= prevStart && r.txn_date <= prevEnd) row.prior += amt;
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      const top5 = Array.from(byCustomer.entries())
        .filter(([, v]) => v.current > 0)
        .sort((a, b) => b[1].current - a[1].current)
        .slice(0, 5)
        .map(([id, v]) => {
          const variance = v.current - v.prior;
          const pct = v.prior !== 0 ? (variance / v.prior) * 100 : null;
          return {
            customerId: id,
            customer: v.customer,
            current: v.current,
            prior: v.prior,
            variance,
            pct,
          };
        });
      return { top5, lastSync };
    },
  });

  const rows = data?.top5 ?? [];
  const chartData = rows.map((r) => ({
    name: truncate(r.customer, 18),
    fullName: r.customer,
    current: r.current,
    prior: r.prior,
  }));
  const hasAny = rows.length > 0;

  return (
    <div
      className="w-full flex flex-col rounded-[10px] overflow-hidden relative"
      style={{
        background: "rgba(10,60,110,0.55)",
        border: "1px solid rgba(40,120,200,0.28)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg,transparent,rgba(80,180,255,0.4),transparent)",
        }}
      />
      <div
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(40,100,180,0.2)" }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            color: "rgba(160,210,255,0.6)",
          }}
        >
          Income · Top 5 Customers MoM
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
          style={{ color: "rgba(160,210,255,0.55)" }}
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
          style={{ color: "rgba(160,210,255,0.55)" }}
        >
          {curLabel} vs {prevLabel} · top 5 customers by current-month income · 4 entities
        </div>

        {isLoading ? (
          <div className="h-[300px] rounded bg-white/5 animate-pulse" />
        ) : !hasAny ? (
          <div
            className="h-[300px] flex items-center justify-center text-sm"
            style={{ color: "rgba(160,210,255,0.55)" }}
          >
            No customer income in the current month.
          </div>
        ) : (
          <>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 4, bottom: 44 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(120,170,220,0.12)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "rgba(200,225,255,0.7)" }}
                    axisLine={{ stroke: "rgba(80,160,230,0.25)" }}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgba(200,225,255,0.6)" }}
                    axisLine={{ stroke: "rgba(80,160,230,0.25)" }}
                    tickLine={false}
                    tickFormatter={fmtCompact}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(80,160,230,0.08)" }}
                    contentStyle={{
                      background: "rgba(10,30,55,0.95)",
                      border: "1px solid rgba(80,160,230,0.35)",
                      borderRadius: 6,
                      fontSize: 12,
                      color: "rgb(220,235,255)",
                    }}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""
                    }
                    formatter={(v: number, name: string) => [
                      fmtUSD(v),
                      name === "current" ? curLabel : prevLabel,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(200,225,255,0.7)" }}
                    formatter={(v) => (v === "current" ? curLabel : prevLabel)}
                  />
                  <Bar
                    dataKey="prior"
                    fill="rgba(140,160,200,0.55)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="current"
                    fill="rgba(80,180,255,0.85)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "rgba(160,210,255,0.6)" }}
                  >
                    <th className="text-left py-2 font-semibold">Customer</th>
                    <th className="text-right py-2 font-semibold">{curLabel}</th>
                    <th className="text-right py-2 font-semibold">{prevLabel}</th>
                    <th className="text-right py-2 font-semibold">$ Variance</th>
                    <th className="text-right py-2 font-semibold">% Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const positive = r.variance >= 0;
                    const color = positive
                      ? "hsl(142 71% 55%)"
                      : "hsl(0 84% 65%)";
                    return (
                      <tr
                        key={r.customerId}
                        className="border-t"
                        style={{ borderColor: "rgba(40,100,180,0.18)" }}
                      >
                        <td className="py-2 text-foreground">{r.customer}</td>
                        <td className="py-2 text-right text-foreground font-medium">
                          {fmtUSD(r.current)}
                        </td>
                        <td className="py-2 text-right text-[rgba(200,225,255,0.7)]">
                          {fmtUSD(r.prior)}
                        </td>
                        <td
                          className="py-2 text-right font-medium"
                          style={{ color }}
                        >
                          {positive ? "+" : ""}
                          {fmtUSD(r.variance)}
                        </td>
                        <td
                          className="py-2 text-right font-medium"
                          style={{ color }}
                        >
                          {r.pct == null
                            ? "—"
                            : `${positive ? "+" : ""}${r.pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default IncomeTop5CustomersMoMCard;