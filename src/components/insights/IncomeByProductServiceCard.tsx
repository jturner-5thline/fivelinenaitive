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
 * Income by Product/Service — stacked bar per customer, with each stack
 * segment representing a QuickBooks product/service (ItemRef.name parsed
 * from the invoice line items in metadata). Combined across all 4 5th Line
 * QBO entities. Null/blank customers are excluded. No hardcoded values.
 */

const REALM_IDS = [
  "9341451968897660", // 5th Line Financial Services, LLC
  "193514877331929",  // 5th Line Capital Advisors LLC
  "9130350272677286", // 5th Line Technologies LLC
  "123146077561874",  // 5th Line Capital, LLC
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

// Stable HSL palette generated from the product name so colors persist
// across renders without hardcoding any specific products.
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 55%)`;
}

interface ChartRow {
  customer: string;
  total: number;
  [product: string]: number | string;
}

export function IncomeByProductServiceCard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["income-by-product-service", user?.id],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("realm_id, customer_name, metadata, synced_at")
        .in("realm_id", REALM_IDS);
      if (error) throw error;

      let lastSync: string | null = null;
      // customer -> product -> amount
      const agg = new Map<string, Map<string, number>>();
      const productSet = new Set<string>();

      for (const row of (rows ?? []) as Array<{
        customer_name: string | null;
        metadata: any;
        synced_at: string | null;
      }>) {
        if (row.synced_at && (!lastSync || row.synced_at > lastSync)) {
          lastSync = row.synced_at;
        }
        const customer = (row.customer_name ?? "").trim();
        if (!customer) continue; // exclude null/blank per spec

        const lines = Array.isArray(row.metadata?.Line) ? row.metadata.Line : [];
        for (const line of lines) {
          const detail = line?.SalesItemLineDetail;
          if (!detail) continue; // skip SubTotal etc.
          const productName: string =
            detail?.ItemRef?.name ||
            line?.Description ||
            "Other";
          const amount = Number(line?.Amount) || 0;
          if (!amount) continue;

          productSet.add(productName);
          let bucket = agg.get(customer);
          if (!bucket) {
            bucket = new Map();
            agg.set(customer, bucket);
          }
          bucket.set(productName, (bucket.get(productName) ?? 0) + amount);
        }
      }

      const products = Array.from(productSet).sort();
      const chartRows: ChartRow[] = Array.from(agg.entries())
        .map(([customer, bucket]) => {
          const row: ChartRow = { customer, total: 0 };
          let total = 0;
          for (const p of products) {
            const v = bucket.get(p) ?? 0;
            row[p] = v;
            total += v;
          }
          row.total = total;
          return row;
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);

      return { chartRows, products, lastSync };
    },
  });

  const chartRows = data?.chartRows ?? [];
  const products = data?.products ?? [];
  const hasData = chartRows.length > 0;

  const chartHeight = useMemo(() => {
    // grow with row count so labels don't crowd
    return Math.min(720, Math.max(320, chartRows.length * 28 + 80));
  }, [chartRows.length]);

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
          Income · by Product / Service
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
          All 4 entities · stacked by product/service (excludes blank customers)
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
          <div style={{ height: chartHeight }} className="w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
                  tickFormatter={fmtCompact}
                />
                <YAxis
                  type="category"
                  dataKey="customer"
                  width={180}
                  tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }}
                  axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                  tickLine={false}
                  interval={0}
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
                  formatter={(v: number, name: string) => [fmtUSDFull(v), name]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as ChartRow | undefined;
                    return row ? `${label} — total ${fmtUSDFull(row.total)}` : String(label);
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.75)",
                    paddingTop: 8,
                  }}
                />
                {products.map((p, i) => (
                  <Bar
                    key={p}
                    dataKey={p}
                    stackId="product"
                    fill={colorFor(p)}
                    radius={
                      i === products.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]
                    }
                    maxBarSize={22}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeByProductServiceCard;