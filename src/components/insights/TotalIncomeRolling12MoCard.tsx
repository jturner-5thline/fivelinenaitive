import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Total Income: Rolling 12 Months.
 *
 * Trends combined QuickBooks invoice income across the four 5th Line
 * entities for the trailing 12 months. Clicking a point opens an
 * account-level (customer) breakdown for that month.
 */

const REALM_IDS = [
  { id: "9341451968897660", name: "5th Line Financial Services, LLC" },
  { id: "193514877331929", name: "5th Line Capital Advisors LLC" },
  { id: "9130350272677286", name: "5th Line Technologies LLC" },
  { id: "123146077561874", name: "5th Line Capital, LLC" },
];
const REALM_NAMES = Object.fromEntries(REALM_IDS.map((r) => [r.id, r.name]));

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function ymKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
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

export function TotalIncomeRolling12MoCard() {
  const { user } = useAuth();
  const [drill, setDrill] = useState<
    { year: number; month: number; label: string } | null
  >(null);

  const { months, rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    const cur = new Date(now.getFullYear(), now.getMonth(), 1);
    const months: { y: number; m: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(cur.getFullYear(), cur.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth() });
    }
    const start = new Date(cur.getFullYear(), cur.getMonth() - 11, 1);
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    return {
      months,
      rangeStart: isoDate(start),
      rangeEnd: isoDate(end),
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["total-income-r12", user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, total_amt, synced_at")
        .in(
          "realm_id",
          REALM_IDS.map((r) => r.id),
        )
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;
      const totals = new Map<string, number>();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date) continue;
        const d = new Date(r.txn_date);
        const k = ymKey(d.getFullYear(), d.getMonth());
        totals.set(k, (totals.get(k) ?? 0) + Number(r.total_amt ?? 0));
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { totals, lastSync };
    },
  });

  const totals = data?.totals ?? new Map<string, number>();

  const chartData = months.map(({ y, m }) => ({
    key: ymKey(y, m),
    year: y,
    month: m,
    label: new Date(y, m, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    income: totals.get(ymKey(y, m)) ?? 0,
  }));

  // Simple centered 3-pt moving-average trend line.
  const trend = chartData.map((d, i, arr) => {
    const start = Math.max(0, i - 1);
    const end = Math.min(arr.length, i + 2);
    const slice = arr.slice(start, end);
    const avg = slice.reduce((a, b) => a + b.income, 0) / slice.length;
    return { ...d, trend: avg };
  });

  const hasAny = chartData.some((d) => d.income > 0);
  const total12 = chartData.reduce((a, b) => a + b.income, 0);

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
          Total Income · Rolling 12 Months
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

      <div className="p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div
              className="text-[10px] uppercase tracking-wide"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              Rolling 12-month total · 4 entities combined
            </div>
            {isLoading ? (
              <div className="h-7 w-40 rounded bg-white/5 animate-pulse mt-1" />
            ) : (
              <div
                className="font-semibold tracking-tight text-foreground"
                style={{ fontSize: 24, lineHeight: 1.1 }}
              >
                {fmtUSD(total12)}
              </div>
            )}
          </div>
          <div
            className="text-[10px] tracking-wide"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Click a point for account-level breakdown
          </div>
        </div>

        {isLoading ? (
          <div className="h-[300px] rounded bg-white/5 animate-pulse" />
        ) : !hasAny ? (
          <div
            className="h-[300px] flex items-center justify-center text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[300px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trend}
                margin={{ top: 16, right: 12, left: 4, bottom: 0 }}
                onClick={(state) => {
                  const p = state?.activePayload?.[0]?.payload as
                    | (typeof trend)[number]
                    | undefined;
                  if (p)
                    setDrill({ year: p.year, month: p.month, label: p.label });
                }}
              >
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="hsla(213,90%,70%,0.55)"
                    />
                    <stop
                      offset="100%"
                      stopColor="hsla(213,90%,70%,0.04)"
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.7)" }}
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
                  cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
                  contentStyle={{
                    background: "rgba(10,30,55,0.95)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgb(220,235,255)",
                  }}
                  formatter={(v: number, n: string) => [
                    fmtUSD(v),
                    n === "income" ? "Income" : "Trend (3mo avg)",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="hsla(213,90%,70%,0.95)"
                  strokeWidth={2}
                  fill="url(#incomeFill)"
                  activeDot={{ r: 5, cursor: "pointer" }}
                />
                <Line
                  type="monotone"
                  dataKey="trend"
                  stroke="hsl(45 90% 60%)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <MonthDrilldownDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        drill={drill}
      />
    </div>
  );
}

function MonthDrilldownDialog({
  open,
  onOpenChange,
  drill,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  drill: { year: number; month: number; label: string } | null;
}) {
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (!drill) return { rangeStart: "", rangeEnd: "" };
    const start = new Date(drill.year, drill.month, 1);
    const end = new Date(drill.year, drill.month + 1, 0);
    return { rangeStart: isoDate(start), rangeEnd: isoDate(end) };
  }, [drill]);

  const { data, isLoading } = useQuery({
    queryKey: ["total-income-r12-drill", drill?.year, drill?.month],
    enabled: open && !!drill,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, customer_id, customer_name, total_amt")
        .in(
          "realm_id",
          REALM_IDS.map((r) => r.id),
        )
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;
      const byCustomer = new Map<
        string,
        { customer: string; entity: string; amount: number }
      >();
      let total = 0;
      for (const r of rows ?? []) {
        const id = `${r.realm_id}::${r.customer_id || r.customer_name || "unknown"}`;
        const amt = Number(r.total_amt ?? 0);
        total += amt;
        const existing = byCustomer.get(id);
        if (existing) existing.amount += amt;
        else
          byCustomer.set(id, {
            customer: r.customer_name || r.customer_id || "Unknown",
            entity: REALM_NAMES[r.realm_id ?? ""] ?? r.realm_id ?? "—",
            amount: amt,
          });
      }
      const list = Array.from(byCustomer.values()).sort(
        (a, b) => b.amount - a.amount,
      );
      return { list, total };
    },
  });

  const list = data?.list ?? [];
  const total = data?.total ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Income breakdown · {drill?.label ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">
          Total income: {fmtUSD(total)} · {list.length} accounts
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="h-40 rounded bg-muted/30 animate-pulse" />
          ) : list.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No invoices for this month.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 font-semibold">Customer</th>
                  <th className="text-left py-2 font-semibold">Entity</th>
                  <th className="text-right py-2 font-semibold">Income</th>
                  <th className="text-right py-2 font-semibold">Share</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="py-2">{r.customer}</td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {r.entity}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {fmtUSD(r.amount)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {total > 0
                        ? `${((r.amount / total) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default TotalIncomeRolling12MoCard;