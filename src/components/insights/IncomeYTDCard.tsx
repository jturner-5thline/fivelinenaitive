import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Income YTD KPI card.
 *
 * Pulls TOTAL income from QuickBooks invoices across the four 5th Line
 * entities for Jan 1 → today, and compares to the same window prior year.
 */

// Realm IDs for the four entities. Sourced from
// mem/data/qbo-realm-mapping.md (confirmed 2026-04-29).
const REALM_IDS = [
  "9341451968897660", // 5th Line Financial Services, LLC
  "193514877331929",  // 5th Line Capital Advisors LLC
  "9130350272677286", // 5th Line Technologies LLC
  "123146077561874",  // 5th Line Capital, LLC
];

function formatUSDFull(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function IncomeYTDCard() {
  const { user } = useAuth();

  const { now, curStart, curEnd, prevStart, prevEnd } = useMemo(() => {
    const now = new Date();
    const curStart = isoDate(new Date(now.getFullYear(), 0, 1));
    const curEnd = isoDate(now);
    const prevStart = isoDate(new Date(now.getFullYear() - 1, 0, 1));
    const prevEnd = isoDate(
      new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
    );
    return { now, curStart, curEnd, prevStart, prevEnd };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["income-ytd-kpi", user?.id, curStart, curEnd, prevStart, prevEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, total_amt, realm_id, synced_at")
        .in("realm_id", REALM_IDS)
        .gte("txn_date", prevStart)
        .lte("txn_date", curEnd);
      if (error) throw error;
      let cur = 0;
      let prev = 0;
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (!r.txn_date) continue;
        const amt = Number(r.total_amt ?? 0);
        if (r.txn_date >= curStart && r.txn_date <= curEnd) cur += amt;
        else if (r.txn_date >= prevStart && r.txn_date <= prevEnd) prev += amt;
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return { cur, prev, lastSync };
    },
  });

  const cur = data?.cur ?? 0;
  const prev = data?.prev ?? 0;
  const diff = cur - prev;
  const pct = prev !== 0 ? (diff / prev) * 100 : null;
  const positive = diff >= 0;

  const accent = positive ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)";
  const TrendIcon = positive ? TrendingUp : TrendingDown;

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
          Income YTD
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
      <div className="p-4 flex flex-col gap-2">
        <div
          className="text-[10px] tracking-wide"
          style={{ color: "rgba(160,210,255,0.55)" }}
        >
          Jan 1 – {now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · 4 entities · Actuals
        </div>
        {isLoading ? (
          <div className="h-12 w-40 rounded bg-white/5 animate-pulse" />
        ) : (
          <div
            className="font-semibold tracking-tight text-foreground"
            style={{ fontSize: 36, lineHeight: 1.1 }}
          >
            {formatUSDFull(cur)}
          </div>
        )}
        {!isLoading && (
          <div
            className="inline-flex items-center gap-1.5 text-sm font-medium"
            style={{ color: accent }}
          >
            <TrendIcon className="h-4 w-4" />
            <span>
              {positive ? "+" : ""}
              {formatUSDFull(diff)}
            </span>
            <span className="opacity-80">
              ({pct == null ? "n/a" : `${positive ? "+" : ""}${pct.toFixed(1)}%`}) vs prior YTD
            </span>
          </div>
        )}
        {!isLoading && (
          <div
            className="text-[11px]"
            style={{ color: "rgba(160,210,255,0.45)" }}
          >
            Prior YTD ({prevStart.slice(0, 4)}): {formatUSDFull(prev)}
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomeYTDCard;
