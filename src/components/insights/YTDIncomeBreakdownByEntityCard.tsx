import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * YTD Income: Breakdown by Entity — pie chart showing each entity's
 * YTD income share of total firm income, sourced from QuickBooks.
 */

const ENTITIES: { realmId: string; label: string; color: string }[] = [
  { realmId: "9341451968897660", label: "5th Line Financial Services", color: "hsl(200 90% 60%)" },
  { realmId: "193514877331929", label: "5th Line Capital Advisors", color: "hsl(142 71% 50%)" },
  { realmId: "9130350272677286", label: "5th Line Technologies", color: "hsl(45 90% 60%)" },
  { realmId: "123146077561874", label: "5th Line Capital", color: "hsl(280 70% 65%)" },
];

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
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

export function YTDIncomeBreakdownByEntityCard() {
  const { user } = useAuth();

  const { yearStart, today, year } = useMemo(() => {
    const now = new Date();
    return {
      yearStart: isoDate(new Date(now.getFullYear(), 0, 1)),
      today: isoDate(now),
      year: now.getFullYear(),
    };
  }, []);

  const realmIds = ENTITIES.map((e) => e.realmId);

  const { data, isLoading } = useQuery({
    queryKey: ["ytd-income-breakdown-by-entity", user?.id, yearStart, today],
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
      const totals: Record<string, number> = {};
      for (const e of ENTITIES) totals[e.realmId] = 0;
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.realm_id || !r.txn_date) continue;
        if (new Date(r.txn_date).getFullYear() !== year) continue;
        totals[r.realm_id] = (totals[r.realm_id] ?? 0) + Number(r.total_amt ?? 0);
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { totals, lastSync };
    },
  });

  const { slices, total } = useMemo(() => {
    const totals = data?.totals ?? {};
    const slices = ENTITIES.map((e) => ({
      name: e.label,
      value: totals[e.realmId] ?? 0,
      color: e.color,
    }));
    const total = slices.reduce((a, b) => a + b.value, 0);
    return { slices, total };
  }, [data]);

  const hasData = total > 0;

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
          YTD Income · Breakdown by Entity
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
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div
              className="text-[10px] tracking-wide uppercase"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Total Firm Income YTD {year}
            </div>
            {isLoading ? (
              <div className="h-9 w-40 rounded bg-white/5 animate-pulse mt-1" />
            ) : (
              <div
                className="font-semibold tracking-tight text-foreground"
                style={{ fontSize: 28, lineHeight: 1.1 }}
              >
                {fmtUSDFull(total)}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="h-[320px] rounded bg-white/5 animate-pulse" />
        ) : !hasData ? (
          <div
            className="h-[320px] flex items-center justify-center text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[320px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    background: "rgba(10,30,55,0.95)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgb(220,235,255)",
                  }}
                  formatter={(value: number, name) => {
                    const pct = total > 0 ? (Number(value) / total) * 100 : 0;
                    return [`${fmtUSDFull(Number(value))} (${pct.toFixed(1)}%)`, name as string];
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}
                  formatter={(value, entry) => {
                    const v = (entry?.payload as { value?: number } | undefined)?.value ?? 0;
                    const pct = total > 0 ? (v / total) * 100 : 0;
                    return (
                      <span style={{ color: "rgba(220,235,255,0.85)" }}>
                        {value} · {fmtCompact(v)} ({pct.toFixed(1)}%)
                      </span>
                    );
                  }}
                />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  stroke="rgba(10,30,55,0.6)"
                  label={({ percent }) =>
                    percent && percent > 0.04 ? `${(percent * 100).toFixed(1)}%` : ""
                  }
                  labelLine={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default YTDIncomeBreakdownByEntityCard;