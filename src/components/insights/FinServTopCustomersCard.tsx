import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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

/**
 * FinServ Income: Top 10 Customers Breakdown vs. Previous Year.
 *
 * Aggregates QuickBooks invoice totals by customer for the selected entity
 * over the current YTD window, compares to the same window prior year,
 * surfaces the top 10 customers by current-period revenue, and supports a
 * click-through invoice-level drilldown per customer.
 */

const ENTITIES = [
  { id: "9341451968897660", name: "5th Line Financial Services, LLC" },
  { id: "193514877331929", name: "5th Line Capital Advisors LLC" },
  { id: "9130350272677286", name: "5th Line Technologies LLC" },
  { id: "123146077561874", name: "5th Line Capital, LLC" },
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type Row = {
  customerId: string;
  customer: string;
  current: number;
  prior: number;
  variance: number;
  pct: number | null;
};

export function FinServTopCustomersCard() {
  const { user } = useAuth();
  const [entityId, setEntityId] = useState(ENTITIES[0].id);
  const [drill, setDrill] = useState<{ id: string; name: string } | null>(null);

  const { curStart, curEnd, prevStart, prevEnd, periodLabel } = useMemo(() => {
    const now = new Date();
    const cs = new Date(now.getFullYear(), 0, 1);
    const ce = now;
    const ps = new Date(now.getFullYear() - 1, 0, 1);
    const pe = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return {
      curStart: isoDate(cs),
      curEnd: isoDate(ce),
      prevStart: isoDate(ps),
      prevEnd: isoDate(pe),
      periodLabel: `Jan 1 – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: [
      "finserv-top-customers",
      user?.id,
      entityId,
      curStart,
      curEnd,
      prevStart,
      prevEnd,
    ],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, customer_id, customer_name, total_amt, synced_at")
        .eq("realm_id", entityId)
        .gte("txn_date", prevStart)
        .lte("txn_date", curEnd);
      if (error) throw error;
      const byCustomer = new Map<string, Row>();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date) continue;
        const id = r.customer_id || r.customer_name;
        if (!id) continue;
        const name = r.customer_name || r.customer_id || "Unknown";
        const amt = Number(r.total_amt ?? 0);
        let row = byCustomer.get(id);
        if (!row) {
          row = {
            customerId: id,
            customer: name,
            current: 0,
            prior: 0,
            variance: 0,
            pct: null,
          };
          byCustomer.set(id, row);
        }
        if (r.txn_date >= curStart && r.txn_date <= curEnd) row.current += amt;
        else if (r.txn_date >= prevStart && r.txn_date <= prevEnd)
          row.prior += amt;
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      const all = Array.from(byCustomer.values()).map((r) => ({
        ...r,
        variance: r.current - r.prior,
        pct: r.prior !== 0 ? ((r.current - r.prior) / r.prior) * 100 : null,
      }));
      const top = all
        .filter((r) => r.current > 0 || r.prior > 0)
        .sort((a, b) => b.current - a.current)
        .slice(0, 10);
      return { top, lastSync };
    },
  });

  const rows = data?.top ?? [];

  type SortKey = "customer" | "current" | "prior" | "variance" | "pct";
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "customer" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k)
      return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="inline h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="inline h-3 w-3 ml-1" />
    );
  };

  const chartData = rows.map((r) => ({
    name: truncate(r.customer, 18),
    fullName: r.customer,
    current: r.current,
    prior: r.prior,
  }));

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
        className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap"
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
          FinServ Income · Top 10 Customers vs Prior Year
        </div>
        <div className="flex items-center gap-2">
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger
              className="h-7 text-[11px] bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.85)] min-w-[220px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITIES.map((e) => (
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
            {data?.lastSync
              ? `synced ${formatDistanceToNow(new Date(data.lastSync), { addSuffix: true })}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          {periodLabel} {new Date().getFullYear()} vs {periodLabel}{" "}
          {new Date().getFullYear() - 1} · sum of invoice totals
        </div>

        {isLoading ? (
          <div className="h-[300px] rounded bg-white/5 animate-pulse" />
        ) : rows.length === 0 ? (
          <div
            className="h-[300px] flex items-center justify-center text-sm"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            No invoice data for this entity in the selected period.
          </div>
        ) : (
          <>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 4, bottom: 48 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(120,170,220,0.12)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.7)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                    tickLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `$${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1_000
                          ? `$${(v / 1_000).toFixed(0)}K`
                          : `$${v}`
                    }
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
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""
                    }
                    formatter={(v: number, name: string) => [
                      fmtUSD(v),
                      name === "current" ? "Current YTD" : "Prior YTD",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}
                    formatter={(v) =>
                      v === "current" ? "Current YTD" : "Prior YTD"
                    }
                  />
                  <Bar
                    dataKey="prior"
                    fill="rgba(140,160,200,0.55)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="current"
                    fill="hsla(213,90%,70%,0.85)"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    <th
                      className="text-left py-2 font-semibold cursor-pointer select-none"
                      onClick={() => toggleSort("customer")}
                    >
                      Customer
                      <SortIcon k="customer" />
                    </th>
                    <th
                      className="text-right py-2 font-semibold cursor-pointer select-none"
                      onClick={() => toggleSort("current")}
                    >
                      Current Period
                      <SortIcon k="current" />
                    </th>
                    <th
                      className="text-right py-2 font-semibold cursor-pointer select-none"
                      onClick={() => toggleSort("prior")}
                    >
                      Prior Year
                      <SortIcon k="prior" />
                    </th>
                    <th
                      className="text-right py-2 font-semibold cursor-pointer select-none"
                      onClick={() => toggleSort("variance")}
                    >
                      $ Variance
                      <SortIcon k="variance" />
                    </th>
                    <th
                      className="text-right py-2 font-semibold cursor-pointer select-none"
                      onClick={() => toggleSort("pct")}
                    >
                      % Variance
                      <SortIcon k="pct" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const positive = r.variance >= 0;
                    const color = positive
                      ? "hsl(142 71% 55%)"
                      : "hsl(0 84% 65%)";
                    return (
                      <tr
                        key={r.customerId}
                        className="border-t cursor-pointer hover:bg-[rgba(255,255,255,0.15)] transition-colors"
                        style={{ borderColor: "rgba(255,255,255,0.08)" }}
                        onClick={() =>
                          setDrill({ id: r.customerId, name: r.customer })
                        }
                      >
                        <td className="py-2 text-foreground">{r.customer}</td>
                        <td className="py-2 text-right text-foreground font-medium">
                          {fmtUSD(r.current)}
                        </td>
                        <td className="py-2 text-right text-[rgba(255,255,255,0.7)]">
                          {fmtUSD(r.prior)}
                        </td>
                        <td
                          className="py-2 text-right font-medium"
                          style={{ color }}
                        >
                          {positive ? "+" : ""}
                          {fmtUSD(r.variance)}
                        </td>
                        <td
                          className="py-2 text-right font-medium"
                          style={{ color }}
                        >
                          {r.pct == null
                            ? "—"
                            : `${positive ? "+" : ""}${r.pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <CustomerDrilldownDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        entityId={entityId}
        customer={drill}
        rangeStart={prevStart}
        rangeEnd={curEnd}
        curStart={curStart}
      />
    </div>
  );
}

function CustomerDrilldownDialog({
  open,
  onOpenChange,
  entityId,
  customer,
  rangeStart,
  rangeEnd,
  curStart,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityId: string;
  customer: { id: string; name: string } | null;
  rangeStart: string;
  rangeEnd: string;
  curStart: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: [
      "finserv-top-customers-drill",
      entityId,
      customer?.id,
      rangeStart,
      rangeEnd,
    ],
    enabled: open && !!customer,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!customer) return [];
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("doc_number, txn_date, due_date, total_amt, balance, status")
        .eq("realm_id", entityId)
        .eq("customer_id", customer.id)
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd)
        .order("txn_date", { ascending: false });
      if (error) throw error;
      return rows ?? [];
    },
  });

  const invoices = data ?? [];
  const totals = invoices.reduce(
    (acc, r) => {
      const amt = Number(r.total_amt ?? 0);
      if (r.txn_date && r.txn_date >= curStart) acc.current += amt;
      else acc.prior += amt;
      return acc;
    },
    { current: 0, prior: 0 },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{customer?.name ?? "Customer"} · invoice detail</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">
          Current YTD: {fmtUSD(totals.current)} · Prior YTD: {fmtUSD(totals.prior)}
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

export default FinServTopCustomersCard;