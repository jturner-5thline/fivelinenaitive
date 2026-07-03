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
import { useInsightsTimeframeOptional } from "@/contexts/InsightsTimeframeContext";
import { useTimeframeRange } from "./useTimeframeRange";
import { ChartTypeToggle, type ChartType } from "./ChartTypeToggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FinServ vs Debt — monthly time series line chart with a metric toggle
 * (Revenue / Gross Profit / Operating Profit). Data sourced from
 * qbo_pnl_snapshots so all three metrics come from the same P&L run.
 * When Revenue is selected, chips under the toggle open a modal breaking
 * income down by QuickBooks Product/Service ("invoicing type") from
 * quickbooks_invoices. No hardcoded amounts.
 */

const FINSERV_REALM = "9341451968897660"; // 5th Line Financial Services, LLC
const DEBT_REALM = "193514877331929";     // 5th Line Capital Advisors LLC
const REALM_IDS = [FINSERV_REALM, DEBT_REALM];

type BucketKey = "FinServ" | "Debt";
const BUCKET_COLOR: Record<BucketKey, string> = {
  FinServ: "hsl(213 90% 60%)", // blue — matches FinServ charts
  Debt: "hsl(142 71% 45%)",    // green — matches Debt charts
};
const REALM_TO_BUCKET: Record<string, BucketKey> = {
  [FINSERV_REALM]: "FinServ",
  [DEBT_REALM]: "Debt",
};

type MetricKey = "revenue" | "gross_profit" | "operating_profit";
const METRICS: { key: MetricKey; label: string; field: "income_total" | "gross_profit" | "net_operating_income" }[] = [
  { key: "revenue", label: "Revenue", field: "income_total" },
  { key: "gross_profit", label: "Gross Profit", field: "gross_profit" },
  { key: "operating_profit", label: "Operating Profit", field: "net_operating_income" },
];

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

interface InvoicingTypeRow {
  product: string;
  total: number;
  invoices: number;
}

export function IncomeByProductServiceCard() {
  const { user } = useAuth();
  const tf = useInsightsTimeframeOptional();
  const start = tf?.timeframe.start ?? null;
  const end = tf?.timeframe.end ?? null;
  const rangeLabel = tf?.timeframe.label ?? "All time";
  const { months, rangeStart, rangeEnd } = useTimeframeRange();

  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [chartType, setChartType] = useState<ChartType>("line");
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  // Monthly P&L series (Revenue / GP / OI per entity)
  const { data: pnlData, isLoading: pnlLoading } = useQuery({
    queryKey: ["finserv-vs-debt-pnl-monthly", user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("qbo_pnl_snapshots")
        .select("realm_id, period_start, period_end, income_total, gross_profit, net_operating_income, fetched_at, accounting_method")
        .in("realm_id", REALM_IDS)
        .gte("period_start", rangeStart)
        .lte("period_end", rangeEnd)
        .order("fetched_at", { ascending: true });
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

      // realm -> monthKey -> { income_total, gross_profit, net_operating_income }
      const monthly: Record<string, Record<string, { income_total: number; gross_profit: number; net_operating_income: number }>> = {
        [FINSERV_REALM]: {},
        [DEBT_REALM]: {},
      };
      for (const key of Object.keys(best)) {
        const [realm, mKey] = key.split("::");
        const row = best[key].row;
        monthly[realm][mKey] = {
          income_total: Number(row.income_total ?? 0),
          gross_profit: Number(row.gross_profit ?? 0),
          net_operating_income: Number(row.net_operating_income ?? 0),
        };
      }
      return { monthly, lastSync };
    },
  });

  // Invoices — only needed for the Revenue → invoicing-type drilldown modal
  const { data: invoiceData } = useQuery({
    queryKey: ["income-by-product-service", user?.id, start, end],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("quickbooks_invoices")
        .select("realm_id, metadata, synced_at, txn_date")
        .in("realm_id", REALM_IDS);
      if (start) q = q.gte("txn_date", start);
      if (end) q = q.lte("txn_date", end);
      const { data: rows, error } = await q;
      if (error) throw error;

      let lastSync: string | null = null;
      // bucket -> product -> { total, invoices }
      const agg: Record<BucketKey, Map<string, { total: number; invoices: number }>> = {
        FinServ: new Map(),
        Debt: new Map(),
      };
      const bucketTotals: Record<BucketKey, number> = { FinServ: 0, Debt: 0 };

      for (const row of (rows ?? []) as Array<{
        realm_id: string | null;
        metadata: any;
        synced_at: string | null;
      }>) {
        if (row.synced_at && (!lastSync || row.synced_at > lastSync)) {
          lastSync = row.synced_at;
        }
        const bucket = row.realm_id ? REALM_TO_BUCKET[row.realm_id] : undefined;
        if (!bucket) continue;

        const lines = Array.isArray(row.metadata?.Line) ? row.metadata.Line : [];
        const seenProductsInInvoice = new Set<string>();
        for (const line of lines) {
          const detail = line?.SalesItemLineDetail;
          if (!detail) continue; // skip SubTotal etc.
          const productName: string =
            detail?.ItemRef?.name ||
            line?.Description ||
            "Other";
          const amount = Number(line?.Amount) || 0;
          if (!amount) continue;

          const m = agg[bucket];
          const existing = m.get(productName) ?? { total: 0, invoices: 0 };
          existing.total += amount;
          if (!seenProductsInInvoice.has(productName)) {
            existing.invoices += 1;
            seenProductsInInvoice.add(productName);
          }
          m.set(productName, existing);
          bucketTotals[bucket] += amount;
        }
      }

      const itemsByBucket: Record<BucketKey, InvoicingTypeRow[]> = {
        FinServ: [],
        Debt: [],
      };
      for (const bucket of ["FinServ", "Debt"] as BucketKey[]) {
        itemsByBucket[bucket] = [...agg[bucket].entries()]
          .map(([product, v]) => ({ product, total: v.total, invoices: v.invoices }))
          .sort((a, b) => b.total - a.total);
      }

      return { itemsByBucket, bucketTotals, lastSync };
    },
  });

  const chartData = useMemo(() => {
    const monthly = pnlData?.monthly;
    return months.map((mo) => {
      const finserv = monthly?.[FINSERV_REALM]?.[mo.key]?.[activeMetric.field] ?? 0;
      const debt = monthly?.[DEBT_REALM]?.[mo.key]?.[activeMetric.field] ?? 0;
      return { month: mo.label, FinServ: finserv, Debt: debt };
    });
  }, [pnlData, months, activeMetric.field]);

  const hasData = chartData.some((r) => Math.abs(Number(r.FinServ) || 0) + Math.abs(Number(r.Debt) || 0) > 0);
  const isLoading = pnlLoading;
  const lastSync = pnlData?.lastSync ?? invoiceData?.lastSync ?? null;

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
          FinServ vs Debt · {activeMetric.label}
        </div>
        <div className="flex items-center gap-2">
          <ChartTypeToggle value={chartType} onChange={setChartType} />
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

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div
            className="text-[10px] tracking-wide"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {rangeLabel}
            {metric === "revenue" ? " · click FinServ / Debt below to drill down invoicing types" : ""}
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

        {metric === "revenue" && (
          <div className="flex items-center gap-2 text-[11px]">
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Invoicing detail:</span>
            {(["FinServ", "Debt"] as BucketKey[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setOpenBucket(b)}
                className="px-2 py-0.5 rounded-full transition-colors"
                style={{
                  border: `1px solid ${BUCKET_COLOR[b]}55`,
                  color: BUCKET_COLOR[b],
                  background: `${BUCKET_COLOR[b]}12`,
                }}
              >
                {b} ▸
              </button>
            ))}
          </div>
        )}

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
          <div style={{ height: 320 }} className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
              <LineChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }}
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
                  formatter={(v: number, name) => [fmtUSDFull(Number(v)), name as string]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}
                  iconType="circle"
                />
                <Line
                  type="monotone"
                  dataKey="FinServ"
                  stroke={BUCKET_COLOR.FinServ}
                  strokeWidth={2}
                  dot={{ r: 3, fill: BUCKET_COLOR.FinServ }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="Debt"
                  stroke={BUCKET_COLOR.Debt}
                  strokeWidth={2}
                  dot={{ r: 3, fill: BUCKET_COLOR.Debt }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
              ) : (
              <BarChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,170,220,0.12)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} tickLine={false} tickFormatter={fmtCompact} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.08)" }}
                  contentStyle={{ background: "rgba(10,30,55,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12, color: "rgb(220,235,255)" }}
                  formatter={(v: number, name) => [fmtUSDFull(Number(v)), name as string]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }} iconType="circle" />
                <Bar dataKey="FinServ" fill={BUCKET_COLOR.FinServ} radius={[3, 3, 0, 0]} />
                <Bar dataKey="Debt" fill={BUCKET_COLOR.Debt} radius={[3, 3, 0, 0]} />
              </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <InvoicingTypeModal
        bucket={openBucket}
        onClose={() => setOpenBucket(null)}
        rows={openBucket ? invoiceData?.itemsByBucket[openBucket] ?? [] : []}
        bucketTotal={openBucket ? invoiceData?.bucketTotals[openBucket] ?? 0 : 0}
        rangeLabel={rangeLabel}
      />
    </div>
  );
}

type SortKey = "product" | "total" | "invoices" | "pct";

function InvoicingTypeModal({
  bucket,
  onClose,
  rows,
  bucketTotal,
  rangeLabel,
}: {
  bucket: BucketKey | null;
  onClose: () => void;
  rows: InvoicingTypeRow[];
  bucketTotal: number;
  rangeLabel: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const list = rows.map((r) => ({
      ...r,
      pct: bucketTotal > 0 ? (r.total / bucketTotal) * 100 : 0,
    }));
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return list;
  }, [rows, bucketTotal, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "product" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? null : sortDir === "asc" ? (
      <ArrowUp className="inline h-3 w-3 ml-1 opacity-70" />
    ) : (
      <ArrowDown className="inline h-3 w-3 ml-1 opacity-70" />
    );

  return (
    <Dialog open={!!bucket} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {bucket ?? ""} — Income by Invoicing Type
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {rangeLabel} · Total {fmtUSDFull(bucketTotal)} · {rows.length} invoicing type
            {rows.length === 1 ? "" : "s"}
          </p>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th
                  className="text-left px-3 py-2 cursor-pointer select-none"
                  onClick={() => toggleSort("product")}
                >
                  Invoicing Type <SortIcon k="product" />
                </th>
                <th
                  className="text-right px-3 py-2 cursor-pointer select-none"
                  onClick={() => toggleSort("total")}
                >
                  Total Income <SortIcon k="total" />
                </th>
                <th
                  className="text-right px-3 py-2 cursor-pointer select-none"
                  onClick={() => toggleSort("invoices")}
                >
                  # Invoices <SortIcon k="invoices" />
                </th>
                <th
                  className="text-right px-3 py-2 cursor-pointer select-none"
                  onClick={() => toggleSort("pct")}
                >
                  % of Bucket <SortIcon k="pct" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                    No invoicing types found for this period.
                  </td>
                </tr>
              ) : (
                sorted.map((r, idx) => (
                  <tr
                    key={r.product}
                    className={cn(
                      "border-t border-border/40",
                      idx % 2 === 1 && "bg-muted/20",
                    )}
                  >
                    <td className="px-3 py-2">{r.product}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtUSDFull(r.total)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.invoices}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default IncomeByProductServiceCard;