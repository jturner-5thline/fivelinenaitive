import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
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
 * Income vs COGS — trailing 12 months for the four 5th Line entities,
 * combined. Income comes from QuickBooks invoices; COGS is derived by
 * scanning expense and bill line items whose AccountRef points to an
 * account classified as "Cost of Goods Sold" in QuickBooks.
 * The shaded band between the two series represents the gross-profit zone.
 */

const REALM_IDS = [
  "9341451968897660",
  "193514877331929",
  "9130350272677286",
  "123146077561874",
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
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

type LineItem = {
  Amount?: number | string;
  AccountBasedExpenseLineDetail?: {
    AccountRef?: { value?: string };
  };
};

function monthKey(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  return dateStr.slice(0, 7);
}

export function IncomeVsCOGSRolling12MoCard() {
  const { user } = useAuth();

  const { rangeStart, rangeEnd, months } = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month
    const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
    const months: { key: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key: k,
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      });
    }
    return {
      rangeStart: isoDate(start),
      rangeEnd: isoDate(end),
      months,
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["income-vs-cogs-r12", user?.id, rangeStart, rangeEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const [accountsRes, invoicesRes, expensesRes, billsRes] = await Promise.all([
        supabase
          .from("quickbooks_accounts")
          .select("realm_id, qb_id, account_type")
          .in("realm_id", REALM_IDS)
          .eq("account_type", "Cost of Goods Sold"),
        supabase
          .from("quickbooks_invoices")
          .select("realm_id, txn_date, total_amt, synced_at")
          .in("realm_id", REALM_IDS)
          .gte("txn_date", rangeStart)
          .lte("txn_date", rangeEnd),
        supabase
          .from("quickbooks_expenses")
          .select("realm_id, txn_date, line_items, synced_at")
          .in("realm_id", REALM_IDS)
          .gte("txn_date", rangeStart)
          .lte("txn_date", rangeEnd),
        supabase
          .from("quickbooks_bills")
          .select("realm_id, txn_date, line_items, synced_at")
          .in("realm_id", REALM_IDS)
          .gte("txn_date", rangeStart)
          .lte("txn_date", rangeEnd),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (invoicesRes.error) throw invoicesRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (billsRes.error) throw billsRes.error;

      // Build per-realm set of COGS account IDs
      const cogsByRealm = new Map<string, Set<string>>();
      for (const a of accountsRes.data ?? []) {
        if (!a.realm_id || !a.qb_id) continue;
        if (!cogsByRealm.has(a.realm_id)) cogsByRealm.set(a.realm_id, new Set());
        cogsByRealm.get(a.realm_id)!.add(a.qb_id);
      }

      const income = new Map<string, number>();
      const cogs = new Map<string, number>();
      let lastSync: string | null = null;

      for (const r of invoicesRes.data ?? []) {
        if (!r.txn_date) continue;
        const k = monthKey(r.txn_date);
        income.set(k, (income.get(k) ?? 0) + Number(r.total_amt ?? 0));
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }

      const accumulateCogs = (
        rows: { realm_id: string | null; txn_date: string | null; line_items: unknown; synced_at?: string | null }[]
      ) => {
        for (const r of rows ?? []) {
          if (!r.realm_id || !r.txn_date) continue;
          const cogsIds = cogsByRealm.get(r.realm_id);
          if (!cogsIds || cogsIds.size === 0) continue;
          const lines = Array.isArray(r.line_items) ? (r.line_items as LineItem[]) : [];
          let monthAmt = 0;
          for (const li of lines) {
            const ref = li?.AccountBasedExpenseLineDetail?.AccountRef?.value;
            if (ref && cogsIds.has(ref)) {
              monthAmt += Number(li.Amount ?? 0);
            }
          }
          if (monthAmt !== 0) {
            const k = monthKey(r.txn_date);
            cogs.set(k, (cogs.get(k) ?? 0) + monthAmt);
          }
          if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
        }
      };
      accumulateCogs(expensesRes.data ?? []);
      accumulateCogs(billsRes.data ?? []);

      return { income, cogs, lastSync };
    },
  });

  const chartData = useMemo(() => {
    return months.map((m) => {
      const inc = data?.income.get(m.key) ?? 0;
      const cg = data?.cogs.get(m.key) ?? 0;
      const gp = inc - cg;
      return {
        month: m.label,
        income: inc,
        cogs: cg,
        grossProfit: gp,
      };
    });
  }, [months, data]);

  const hasData = chartData.some((d) => d.income !== 0 || d.cogs !== 0);
  const incomeColor = "hsl(200 90% 60%)";
  const cogsColor = "hsl(15 85% 60%)";
  const gpColor = "hsl(142 71% 50%)";

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
          Income vs COGS · Rolling 12 Months
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

      <div className="p-4 space-y-3">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "rgba(160,210,255,0.55)" }}
        >
          {rangeStart} → {rangeEnd} · 4 entities combined
        </div>

        {isLoading ? (
          <div className="h-[320px] rounded bg-white/5 animate-pulse" />
        ) : !hasData ? (
          <div
            className="h-[320px] flex items-center justify-center text-sm"
            style={{ color: "rgba(160,210,255,0.55)" }}
          >
            No data available
          </div>
        ) : (
          <div className="h-[320px] w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={gpColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={gpColor} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="cogsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cogsColor} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={cogsColor} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(120,170,220,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "rgba(200,225,255,0.7)" }}
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
                  contentStyle={{
                    background: "rgba(10,30,55,0.95)",
                    border: "1px solid rgba(80,160,230,0.35)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "rgb(220,235,255)",
                  }}
                  formatter={(value: number, name) => [fmtUSD(Number(value)), name as string]}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, color: "rgba(200,225,255,0.8)" }}
                />
                {/* Stack COGS first, then Gross Profit on top — the visible
                    top of the stack equals Income, and the green band
                    between COGS and the top is the gross-profit zone. */}
                <Area
                  type="monotone"
                  dataKey="cogs"
                  name="COGS"
                  stackId="1"
                  stroke={cogsColor}
                  strokeWidth={2}
                  fill="url(#cogsFill)"
                />
                <Area
                  type="monotone"
                  dataKey="grossProfit"
                  name="Gross Profit"
                  stackId="1"
                  stroke={gpColor}
                  strokeWidth={2}
                  fill="url(#gpFill)"
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  stroke={incomeColor}
                  strokeWidth={2.5}
                  fill="transparent"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeVsCOGSRolling12MoCard;