import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
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
 * Income: MoM (last 12 months).
 *
 * Aggregates QuickBooks invoice income per month for the trailing 12 months
 * across the four 5th Line entities and overlays the same month from the
 * prior year as a dashed line. Clicking a bar opens an account-level
 * (customer) breakdown drilldown for that month.
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

function monthLabel(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

export function IncomeMoMCard() {
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
    // We need prior-year same months too, so start 24 months back.
    const start = new Date(cur.getFullYear() - 1, cur.getMonth() - 11, 1);
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    return {
      months,
      rangeStart: isoDate(start),
      rangeEnd: isoDate(end),
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["income-mom-12mo", user?.id, rangeStart, rangeEnd],
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

  const chartData = months.map(({ y, m }) => {
    const cur = totals.get(ymKey(y, m)) ?? 0;
    const prior = totals.get(ymKey(y - 1, m)) ?? 0;
    return {
      key: ymKey(y, m),
      year: y,
      month: m,
      label: monthLabel(y, m),
      income: cur,
      priorYear: prior,
    };
  });

  const hasAnyData = chartData.some((d) => d.income > 0 || d.priorYear > 0);

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
          Income · MoM (last 12 months)
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

      <div className="p-4 space-y-2">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "rgba(160,210,255,0.55)" }}
        >
          Total income · 4 entities · click a bar for account-level breakdown
        </div>

        {isLoading ? (
          <div className="h-[300px] rounded bg-white/5 animate-pulse" />
        ) : !hasAnyData ? (
          <div
            className="h-[300px] flex items-center justify-center text-sm"
            style={{ color: "rgba(160,210,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[300px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 16, right: 12, left: 4, bottom: 0 }}
                onClick={(state) => {
                  const p = state?.activePayload?.[0]?.payload as
                    | (typeof chartData)[number]
                    | undefined;
                  if (p)
                    setDrill({ year: p.year, month: p.month, label: p.label });
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "rgba(200,225,255,0.7)" }}
                  axisLine={{ stroke: "rgba(80,160,230,0.25)" }}
                  tickLine={false}
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
                  formatter={(v: number, n: string) => [
                    fmtUSD(v),
                    n === "income" ? "Income" : "Prior year same month",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(200,225,255,0.7)" }}
                  formatter={(v) => (v === "income" ? "Income" : "Prior year")}
                />
                <Bar
                  dataKey="income"
                  fill="rgba(80,180,255,0.85)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  cursor="pointer"
                />
                <Line
                  type="monotone"
                  dataKey="priorYear"
                  stroke="hsl(45 90% 60%)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: "hsl(45 90% 60%)" }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
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
    queryKey: ["income-mom-drill", drill?.year, drill?.month],
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
          <DialogTitle>
            Income breakdown · {drill?.label ?? ""}
          </DialogTitle>
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
                      {total > 0 ? `${((r.amount / total) * 100).toFixed(1)}%` : "—"}
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

export default IncomeMoMCard;