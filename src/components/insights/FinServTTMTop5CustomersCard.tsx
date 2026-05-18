import { useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * FinServ TTM Top 5 Customers — pie chart of trailing-12-month income by
 * customer for 5th Line Financial Services. Click a slice to drill into
 * that customer's invoicing history.
 */

const ENTITY_ID = "9341451968897660"; // 5th Line Financial Services, LLC

const SLICE_COLORS = [
  "hsl(200 90% 60%)",
  "hsl(142 71% 50%)",
  "hsl(45 90% 60%)",
  "hsl(280 70% 65%)",
  "hsl(15 85% 60%)",
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
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

export function FinServTTMTop5CustomersCard() {
  const { user } = useAuth();
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 12);
    return {
      rangeStart: isoDate(start),
      rangeEnd: isoDate(now),
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["finserv-ttm-top5-customers", user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("customer_id, customer_name, total_amt, synced_at, txn_date")
        .eq("realm_id", ENTITY_ID)
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;
      const map = new Map<string, { id: string; name: string; amount: number }>();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        const id = r.customer_id || r.customer_name;
        if (!id) continue;
        const name = r.customer_name || r.customer_id || "Unknown";
        const prev = map.get(id);
        const amt = Number(r.total_amt ?? 0);
        if (prev) prev.amount += amt;
        else map.set(id, { id, name, amount: amt });
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      const all = Array.from(map.values())
        .filter((c) => c.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      const top5 = all.slice(0, 5);
      return { top5, lastSync };
    },
  });

  const slices = data?.top5 ?? [];
  const total = slices.reduce((a, b) => a + b.amount, 0);

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
          FinServ · TTM Top 5 Customers
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
              Top 5 · Trailing 12 Months
            </div>
            {isLoading ? (
              <div className="h-9 w-40 rounded bg-white/5 animate-pulse mt-1" />
            ) : (
              <div
                className="font-semibold tracking-tight text-foreground"
                style={{ fontSize: 28, lineHeight: 1.1 }}
              >
                {fmtUSD(total)}
              </div>
            )}
          </div>
          <div
            className="text-[10px] tracking-wide"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {rangeStart} → {rangeEnd}
          </div>
        </div>

        {isLoading ? (
          <div className="h-[320px] rounded bg-white/5 animate-pulse" />
        ) : slices.length === 0 ? (
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
                    return [`${fmtUSD(Number(value))} (${pct.toFixed(1)}%)`, name as string];
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
                  data={slices.map((s) => ({ name: s.name, value: s.amount, id: s.id }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  stroke="rgba(10,30,55,0.6)"
                  label={({ name, value }) => `${name}: ${fmtCompact(Number(value))}`}
                  labelLine={false}
                  onClick={(p) => {
                    const payload = p?.payload as { id?: string; name?: string } | undefined;
                    if (payload?.id && payload?.name) {
                      setDrill({ id: payload.id, name: payload.name });
                    }
                  }}
                  cursor="pointer"
                >
                  {slices.map((_, i) => (
                    <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <CustomerInvoiceDrilldown
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        customer={drill}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />
    </div>
  );
}

function CustomerInvoiceDrilldown({
  open,
  onOpenChange,
  customer,
  rangeStart,
  rangeEnd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: { id: string; name: string } | null;
  rangeStart: string;
  rangeEnd: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["finserv-ttm-top5-drill", customer?.id, rangeStart, rangeEnd],
    enabled: open && !!customer,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!customer) return [];
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("doc_number, txn_date, due_date, total_amt, balance, status")
        .eq("realm_id", ENTITY_ID)
        .eq("customer_id", customer.id)
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd)
        .order("txn_date", { ascending: false });
      if (error) throw error;
      return rows ?? [];
    },
  });

  const invoices = data ?? [];
  const total = invoices.reduce((a, r) => a + Number(r.total_amt ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{customer?.name ?? "Customer"} · invoice detail (TTM)</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">
          {rangeStart} → {rangeEnd} · Total: {fmtUSD(total)}
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="h-40 rounded bg-muted/30 animate-pulse" />
          ) : invoices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No invoices found for this customer in the period.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 font-semibold">Invoice #</th>
                  <th className="text-left py-2 font-semibold">Date</th>
                  <th className="text-left py-2 font-semibold">Due</th>
                  <th className="text-right py-2 font-semibold">Total</th>
                  <th className="text-right py-2 font-semibold">Balance</th>
                  <th className="text-left py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((r, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="py-2">{r.doc_number || "—"}</td>
                    <td className="py-2">{r.txn_date || "—"}</td>
                    <td className="py-2">{r.due_date || "—"}</td>
                    <td className="py-2 text-right font-medium">
                      {fmtUSD(Number(r.total_amt ?? 0))}
                    </td>
                    <td className="py-2 text-right">
                      {fmtUSD(Number(r.balance ?? 0))}
                    </td>
                    <td className="py-2">{r.status || "—"}</td>
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

export default FinServTTMTop5CustomersCard;