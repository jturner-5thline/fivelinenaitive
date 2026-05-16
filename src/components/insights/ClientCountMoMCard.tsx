import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

/**
 * Client Count MoM Change.
 *
 * Counts distinct active customers per month (an active customer = has at
 * least one invoice that month) across the four 5th Line QuickBooks
 * entities, for the current month and the prior two months.
 */

const REALM_IDS = [
  "9341451968897660", // 5th Line Financial Services, LLC
  "193514877331929",  // 5th Line Capital Advisors LLC
  "9130350272677286", // 5th Line Technologies LLC
  "123146077561874",  // 5th Line Capital, LLC
];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function ClientCountMoMCard() {
  const { user } = useAuth();
  const [view, setView] = useState<"chart" | "table">("chart");

  const { months, rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const months = [2, 1, 0].map((offset) => {
      const d = new Date(first.getFullYear(), first.getMonth() - offset, 1);
      return monthKey(d);
    });
    const startD = new Date(first.getFullYear(), first.getMonth() - 2, 1);
    const endD = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return {
      months,
      rangeStart: isoDate(startD),
      rangeEnd: isoDate(endD),
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["client-count-mom", user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, customer_id, customer_name, realm_id, synced_at")
        .in("realm_id", REALM_IDS)
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;
      const buckets: Record<string, Set<string>> = {};
      let lastSync: string | null = null;
      for (const m of months) buckets[m] = new Set();
      for (const r of rows ?? []) {
        if (!r.txn_date) continue;
        const k = r.txn_date.slice(0, 7);
        if (!buckets[k]) continue;
        const id = r.customer_id || r.customer_name;
        if (!id) continue;
        // Scope distinct customers across all entities (per request).
        buckets[k].add(id);
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      const series = months.map((m) => ({ key: m, count: buckets[m].size }));
      return { series, lastSync };
    },
  });

  const series = data?.series ?? months.map((m) => ({ key: m, count: 0 }));
  const chartData = series.map((s, idx) => {
    const prev = idx > 0 ? series[idx - 1].count : null;
    const mom = prev == null ? null : s.count - prev;
    return {
      key: s.key,
      label: monthLabel(s.key),
      count: s.count,
      mom,
      momLabel:
        mom == null ? "" : `${mom > 0 ? "+" : ""}${mom}`,
    };
  });

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
        className="px-3 py-2 flex items-center justify-between gap-3"
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
          Client Count · MoM Change
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden border border-[rgba(80,160,230,0.25)]">
            <Button
              size="sm"
              variant="ghost"
              className={`h-6 px-2 text-[10px] uppercase tracking-wider rounded-none ${
                view === "chart"
                  ? "bg-[rgba(80,160,230,0.18)] text-foreground"
                  : "text-[rgba(200,225,255,0.65)]"
              }`}
              onClick={() => setView("chart")}
            >
              Chart
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`h-6 px-2 text-[10px] uppercase tracking-wider rounded-none ${
                view === "table"
                  ? "bg-[rgba(80,160,230,0.18)] text-foreground"
                  : "text-[rgba(200,225,255,0.65)]"
              }`}
              onClick={() => setView("table")}
            >
              Table
            </Button>
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
      </div>

      <div className="p-4">
        <div
          className="text-[10px] tracking-wide mb-2"
          style={{ color: "rgba(160,210,255,0.55)" }}
        >
          Distinct active customers per month · 4 entities · last 3 months
        </div>

        {isLoading ? (
          <div className="h-[260px] rounded bg-white/5 animate-pulse" />
        ) : view === "chart" ? (
          <div className="h-[260px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 28, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "rgba(200,225,255,0.7)" }}
                  axisLine={{ stroke: "rgba(80,160,230,0.25)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "rgba(200,225,255,0.6)" }}
                  axisLine={{ stroke: "rgba(80,160,230,0.25)" }}
                  tickLine={false}
                  allowDecimals={false}
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
                  formatter={(value: number, name: string, p) => {
                    if (name === "count") {
                      const mom = p?.payload?.mom;
                      return [
                        `${value} customers${mom == null ? "" : ` (${mom > 0 ? "+" : ""}${mom} MoM)`}`,
                        "Active",
                      ];
                    }
                    return [value, name];
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="rgba(80,180,255,0.85)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={80}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{
                      fill: "rgb(220,235,255)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  />
                  <LabelList
                    dataKey="momLabel"
                    position="top"
                    offset={18}
                    style={{
                      fill: "rgba(160,210,255,0.75)",
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[260px] w-full overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "rgba(160,210,255,0.6)" }}
                >
                  <th className="text-left py-2 font-semibold">Month</th>
                  <th className="text-right py-2 font-semibold">Customer Count</th>
                  <th className="text-right py-2 font-semibold">MoM Change</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => {
                  const positive = (row.mom ?? 0) >= 0;
                  const momColor =
                    row.mom == null
                      ? "rgba(200,225,255,0.55)"
                      : positive
                        ? "hsl(142 71% 55%)"
                        : "hsl(0 84% 65%)";
                  return (
                    <tr
                      key={row.key}
                      className="border-t"
                      style={{ borderColor: "rgba(40,100,180,0.18)" }}
                    >
                      <td className="py-2 text-foreground">{row.label}</td>
                      <td className="py-2 text-right text-foreground font-medium">
                        {row.count}
                      </td>
                      <td
                        className="py-2 text-right font-medium"
                        style={{ color: momColor }}
                      >
                        {row.mom == null
                          ? "—"
                          : `${positive ? "+" : ""}${row.mom}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientCountMoMCard;