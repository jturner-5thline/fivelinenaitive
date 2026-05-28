import { useMemo, useState } from "react";
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
  Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInsightsTimeframeOptional } from "@/contexts/InsightsTimeframeContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Income by Product/Service — primary view: FinServ vs Debt totals for the
 * selected period (driven by the global Insights timeframe). Clicking either
 * bar opens a centered modal showing income broken down by QuickBooks
 * Product/Service ("invoicing type"). No hardcoded amounts.
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

  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);

  const { data, isLoading } = useQuery({
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
      const bucketInvoiceCount: Record<BucketKey, number> = { FinServ: 0, Debt: 0 };

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
        let invoiceHadLine = false;
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

          invoiceHadLine = true;
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
        if (invoiceHadLine) bucketInvoiceCount[bucket] += 1;
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

      const chartRows = (["FinServ", "Debt"] as BucketKey[]).map((b) => ({
        bucket: b,
        total: bucketTotals[b],
        invoices: bucketInvoiceCount[b],
      }));

      return { chartRows, itemsByBucket, bucketTotals, lastSync };
    },
  });

  const chartRows = data?.chartRows ?? [];
  const hasData = chartRows.some((r) => r.total > 0);

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
          Income · FinServ vs Debt
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
          {rangeLabel} · click a bar to see invoicing-type breakdown
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
          <div style={{ height: 320 }} className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  type="category"
                  dataKey="bucket"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
                />
                <YAxis
                  type="number"
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
                  formatter={(v: number) => [fmtUSDFull(v), "Income"]}
                />
                <Bar
                  dataKey="total"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={120}
                  cursor="pointer"
                  onClick={(d: any) => {
                    if (d?.bucket) setOpenBucket(d.bucket as BucketKey);
                  }}
                >
                  {chartRows.map((r) => (
                    <Cell key={r.bucket} fill={BUCKET_COLOR[r.bucket as BucketKey]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <InvoicingTypeModal
        bucket={openBucket}
        onClose={() => setOpenBucket(null)}
        rows={openBucket ? data?.itemsByBucket[openBucket] ?? [] : []}
        bucketTotal={openBucket ? data?.bucketTotals[openBucket] ?? 0 : 0}
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