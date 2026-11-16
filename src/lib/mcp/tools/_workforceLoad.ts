import type { SupabaseClient } from "@supabase/supabase-js";
export async function loadAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}
type Pnl = { period_start: string; period_end: string; accounting_method: string | null; income_total: number | null; gross_profit: number | null; operating_expenses: number | null; net_operating_income: number | null };
/** Monthly P&L snapshots (one per calendar month, Accrual preferred) keyed by YYYY-MM. */
export async function monthlyPnl(sb: SupabaseClient, realmIds: string[], from: string, to: string) {
  const rows = await loadAll<Pnl & { realm_id: string }>((a, b) => sb.from("qbo_pnl_snapshots")
    .select("realm_id, period_start, period_end, accounting_method, income_total, gross_profit, operating_expenses, net_operating_income")
    .in("realm_id", realmIds).gte("period_start", from).lte("period_end", to).order("period_start").range(a, b));
  const pick = new Map<string, Pnl & { realm_id: string }>();
  for (const r of rows) {
    const s = new Date(r.period_start + "T00:00:00Z");
    const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    if (!r.period_start.endsWith("-01") || r.period_end !== e) continue;
    const key = `${r.realm_id}:${r.period_start.slice(0, 7)}`;
    const prev = pick.get(key);
    if (!prev || (r.accounting_method === "Accrual" && prev.accounting_method !== "Accrual")) pick.set(key, r);
  }
  const out: Record<string, { revenue: number; gross_profit: number; operating_profit: number }> = {};
  for (const [key, r] of pick) {
    const m = key.split(":")[1];
    const o = (out[m] ||= { revenue: 0, gross_profit: 0, operating_profit: 0 });
    const gp = Number(r.gross_profit) || 0;
    o.revenue += Number(r.income_total) || 0;
    o.gross_profit += gp;
    o.operating_profit += r.net_operating_income != null ? Number(r.net_operating_income) : gp - (Number(r.operating_expenses) || 0);
  }
  return out;
}
