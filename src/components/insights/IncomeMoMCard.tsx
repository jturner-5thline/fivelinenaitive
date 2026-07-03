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
import { useTimeframeRange } from "./useTimeframeRange";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

type MetricKey = "revenue" | "gross_profit" | "operating_profit";
const METRICS: {
  key: MetricKey;
  label: string;
  field: "income_total" | "gross_profit" | "net_operating_income";
}[] = [
  { key: "revenue", label: "Revenue", field: "income_total" },
  { key: "gross_profit", label: "Gross Profit", field: "gross_profit" },
  { key: "operating_profit", label: "Operating Income", field: "net_operating_income" },
];

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
    { year: number; month: number; label: string; realmId: string | null } | null
  >(null);
  const [entityId, setEntityId] = useState<string>("__all__");
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const activeRealmIds = entityId === "__all__" ? REALM_IDS.map((r) => r.id) : [entityId];
  const entityLabel = entityId === "__all__"
    ? "Total (all entities)"
    : REALM_NAMES[entityId] ?? "—";
  const tfRange = useTimeframeRange();
  const months = tfRange.months;
  const periodLabel = tfRange.periodLabel;
  // Pull prior-year data too so we can overlay same-month last year.
  const rangeStart = tfRange.priorRangeStart;
  const rangeEnd = tfRange.rangeEnd;

  // Revenue path — invoice-based (matches existing behavior). Fetches all
  // entities so we can filter/aggregate client-side without re-querying on
  // entity toggle.
  const { data: invoiceData, isLoading: invoiceLoading } = useQuery({
    queryKey: ["income-mom-12mo-invoices", user?.id, rangeStart, rangeEnd],
    enabled: !!user && metric === "revenue",
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, txn_date, total_amt, synced_at")
        .in(
          "realm_id",
          REALM_IDS.map((r) => r.id),
        )
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;
      // totals[realmId::ymKey] = amount
      const totals = new Map<string, number>();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date || !r.realm_id) continue;
        const d = new Date(r.txn_date);
        const k = `${r.realm_id}::${ymKey(d.getFullYear(), d.getMonth())}`;
        totals.set(k, (totals.get(k) ?? 0) + Number(r.total_amt ?? 0));
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { totals, lastSync };
    },
  });

  // P&L snapshot path — used for Gross Profit / Operating Income.
  const { data: pnlData, isLoading: pnlLoading } = useQuery({
    queryKey: ["income-mom-12mo-pnl", user?.id, rangeStart, rangeEnd],
    enabled: !!user && metric !== "revenue",
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("qbo_pnl_snapshots")
        .select("realm_id, period_start, period_end, income_total, gross_profit, net_operating_income, fetched_at, accounting_method")
        .in("realm_id", REALM_IDS.map((r) => r.id))
        .gte("period_start", rangeStart)
        .lte("period_end", rangeEnd);
      if (error) throw error;
      // Best snapshot per (realm, month): prefer true monthly (period_end in
      // the same calendar month as period_start) over YTD/quarter aggregates.
      const best: Record<string, { sameMonth: boolean; period_end: string; fetched_at: string; row: any }> = {};
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.period_start || !r.realm_id) continue;
        if ((r.accounting_method ?? "Accrual") !== "Accrual") continue;
        const d = new Date(r.period_start);
        const mKey = ymKey(d.getFullYear(), d.getMonth());
        const key = `${r.realm_id}::${mKey}`;
        const pe = r.period_end ?? r.period_start;
        const fa = r.fetched_at ?? "";
        const endD = new Date(pe);
        const sameMonth =
          endD.getFullYear() === d.getFullYear() && endD.getMonth() === d.getMonth();
        const prev = best[key];
        const better =
          !prev ||
          (sameMonth && !prev.sameMonth) ||
          (sameMonth === prev.sameMonth &&
            (pe > prev.period_end || (pe === prev.period_end && fa > prev.fetched_at)));
        if (better) best[key] = { sameMonth, period_end: pe, fetched_at: fa, row: r };
        if (r.fetched_at && (!lastSync || r.fetched_at > lastSync)) lastSync = r.fetched_at;
      }
      const totals = new Map<string, { income_total: number; gross_profit: number; net_operating_income: number }>();
      for (const key of Object.keys(best)) {
        const row = best[key].row;
        totals.set(key, {
          income_total: Number(row.income_total ?? 0),
          gross_profit: Number(row.gross_profit ?? 0),
          net_operating_income: Number(row.net_operating_income ?? 0),
        });
      }
      return { totals, lastSync };
    },
  });

  const isLoading = metric === "revenue" ? invoiceLoading : pnlLoading;
  const lastSync = metric === "revenue" ? invoiceData?.lastSync : pnlData?.lastSync;

  const valueFor = (realmId: string, k: string): number => {
    if (metric === "revenue") {
      return invoiceData?.totals.get(`${realmId}::${k}`) ?? 0;
    }
    return pnlData?.totals.get(`${realmId}::${k}`)?.[activeMetric.field] ?? 0;
  };

  const sumFor = (k: string): number =>
    activeRealmIds.reduce((a, rid) => a + valueFor(rid, k), 0);

  const chartData = months.map(({ y, m }) => {
    const cur = sumFor(ymKey(y, m));
    const prior = sumFor(ymKey(y - 1, m));
    return {
      key: ymKey(y, m),
      year: y,
      month: m,
      label: monthLabel(y, m),
      income: cur,
      priorYear: prior,
    };
  });

  const hasAnyData = chartData.some((d) => d.income !== 0 || d.priorYear !== 0);
  const canDrill = metric === "revenue";

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
          {activeMetric.label} · MoM
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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
                    "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
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
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger className="h-7 text-[11px] bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.85)] min-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Total (all entities)</SelectItem>
              {REALM_IDS.map((e) => (
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
            {lastSync
              ? `synced ${formatDistanceToNow(new Date(lastSync), { addSuffix: true })}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          {activeMetric.label} · {entityLabel} · {periodLabel}
          {canDrill ? " · click a bar for account-level breakdown" : ""}
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
              <ComposedChart
                data={chartData}
                margin={{ top: 16, right: 12, left: 4, bottom: 0 }}
                onClick={(state) => {
                  if (!canDrill) return;
                  const p = state?.activePayload?.[0]?.payload as
                    | (typeof chartData)[number]
                    | undefined;
                  if (p)
                    setDrill({
                      year: p.year,
                      month: p.month,
                      label: p.label,
                      realmId: entityId === "__all__" ? null : entityId,
                    });
                }}
              >
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
                  cursor={{ fill: "rgba(255,255,255,0.15)" }}
                  contentStyle={{
                    background: "rgba(10,30,55,0.95)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgb(220,235,255)",
                  }}
                  formatter={(v: number, n: string) => [
                    fmtUSD(v),
                    n === "income" ? activeMetric.label : "Prior year same month",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}
                  formatter={(v) => (v === "income" ? activeMetric.label : "Prior year")}
                />
                <Bar
                  dataKey="income"
                  fill="hsla(213,90%,70%,0.85)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  cursor={canDrill ? "pointer" : "default"}
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
  drill: { year: number; month: number; label: string; realmId: string | null } | null;
}) {
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (!drill) return { rangeStart: "", rangeEnd: "" };
    const start = new Date(drill.year, drill.month, 1);
    const end = new Date(drill.year, drill.month + 1, 0);
    return { rangeStart: isoDate(start), rangeEnd: isoDate(end) };
  }, [drill]);

  const { data, isLoading } = useQuery({
    queryKey: ["income-mom-drill", drill?.year, drill?.month, drill?.realmId ?? "all"],
    enabled: open && !!drill,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const realmFilter = drill?.realmId ? [drill.realmId] : REALM_IDS.map((r) => r.id);
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, customer_id, customer_name, total_amt")
        .in("realm_id", realmFilter)
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