import { useMemo } from "react";
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

/**
 * Income: YTD Change by Entity — bar chart showing YTD income variance
 * (current year vs same YTD window prior year) per entity, with positive
 * bars green and negative bars red. Sourced from QuickBooks.
 */

const ENTITIES: { realmId: string; label: string }[] = [
  { realmId: "9341451968897660", label: "Financial Services" },
  { realmId: "193514877331929", label: "Capital Advisors" },
  { realmId: "9130350272677286", label: "Technologies" },
  { realmId: "123146077561874", label: "Capital" },
];

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtUSDFull(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })}`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function IncomeYTDChangeByEntityCard() {
  const { user } = useAuth();

  const { yearStartCurrent, todayCurrent, yearStartPrior, sameDayPrior, year } = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const prior = new Date(y - 1, now.getMonth(), now.getDate());
    return {
      yearStartCurrent: isoDate(new Date(y, 0, 1)),
      todayCurrent: isoDate(now),
      yearStartPrior: isoDate(new Date(y - 1, 0, 1)),
      sameDayPrior: isoDate(prior),
      year: y,
    };
  }, []);

  const realmIds = ENTITIES.map((e) => e.realmId);

  const { data, isLoading } = useQuery({
    queryKey: ["income-ytd-change-by-entity", user?.id, yearStartCurrent, todayCurrent],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, txn_date, total_amt, synced_at")
        .in("realm_id", realmIds)
        .gte("txn_date", yearStartPrior)
        .lte("txn_date", todayCurrent);
      if (error) throw error;
      const cur: Record<string, number> = {};
      const prv: Record<string, number> = {};
      for (const e of ENTITIES) { cur[e.realmId] = 0; prv[e.realmId] = 0; }
      const curStart = new Date(yearStartCurrent).getTime();
      const curEnd = new Date(todayCurrent).getTime();
      const prvStart = new Date(yearStartPrior).getTime();
      const prvEnd = new Date(sameDayPrior).getTime();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.realm_id || !r.txn_date) continue;
        const t = new Date(r.txn_date).getTime();
        const amt = Number(r.total_amt ?? 0);
        if (t >= curStart && t <= curEnd) cur[r.realm_id] = (cur[r.realm_id] ?? 0) + amt;
        else if (t >= prvStart && t <= prvEnd) prv[r.realm_id] = (prv[r.realm_id] ?? 0) + amt;
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { cur, prv, lastSync };
    },
  });

  const chartData = useMemo(() => {
    const cur = data?.cur ?? {};
    const prv = data?.prv ?? {};
    return ENTITIES.map((e) => {
      const current = cur[e.realmId] ?? 0;
      const prior = prv[e.realmId] ?? 0;
      const variance = current - prior;
      const pct = prior !== 0 ? (variance / prior) * 100 : null;
      return {
        entity: e.label,
        current,
        prior,
        variance,
        pct,
        label: fmtCompact(variance),
      };
    });
  }, [data]);

  const hasData = chartData.some((d) => d.current !== 0 || d.prior !== 0);
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
          Income · YTD Change by Entity
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
          YTD {year} vs YTD {year - 1} (same window)
        </div>

        {isLoading ? (
          <div className="h-[300px] rounded bg-white/5 animate-pulse" />
        ) : !hasData ? (
          <div
            className="h-[300px] flex items-center justify-center text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[300px] w-full overflow-hidden">
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
                  dataKey="entity"
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
                  formatter={(_v: number, _n, p) => {
                    const row = p?.payload as typeof chartData[number] | undefined;
                    if (!row) return ["", ""];
                    return [
                      `${fmtUSDFull(row.variance)}${row.pct == null ? "" : ` (${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(1)}%)`} · cur ${fmtUSDFull(row.current)} · prior ${fmtUSDFull(row.prior)}`,
                      "YTD variance",
                    ];
                  }}
                />
                <Bar dataKey="variance" radius={[4, 4, 4, 4]} maxBarSize={64}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.variance >= 0 ? positiveColor : negativeColor}
                    />
                  ))}
                  <LabelList
                    dataKey="label"
                    position="top"
                    style={{
                      fill: "rgb(220,235,255)",
                      fontSize: 11,
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

export default IncomeYTDChangeByEntityCard;