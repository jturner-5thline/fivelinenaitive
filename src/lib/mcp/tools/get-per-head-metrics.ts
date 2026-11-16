import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { WORKSPACE_ID, UNITS, DEBT_REALM, FINSERV_REALM, DUPLICATE_NOTE, firmTotal, ttmPerHead, addMonthsKey, type HcRow } from "../workforceMetrics";
import { loadAll, monthlyPnl } from "./_workforceLoad";

export default defineTool({
  name: "get_per_head_metrics",
  title: "Get TTM revenue and gross profit per head",
  description: "Rolling trailing-twelve-month Revenue per Head and Gross Profit per Head as shown on Insights: scope 'debt' (5th Line Capital Advisors ÷ Debt headcount), 'finserv' (5th Line Financial Services ÷ FinServ headcount) or 'firm' (all entities ÷ firm headcount minus the James duplicate). Revenue uses QuickBooks invoices, except 5th Line Capital Advisors (Debt Advisory), which uses QBO P&L Total Income (excludes Other Income such as Ramp Loans); gross profit uses monthly P&L. A rate needs all 12 months of headcount.",
  inputSchema: {
    scope: z.enum(["debt", "finserv", "firm"]).default("debt"),
    end_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Last period month YYYY-MM (default: current month)."),
    view: z.enum(["month", "quarter"]).default("month"),
    periods: z.number().int().min(1).max(36).default(12),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ scope, end_month, view, periods }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const realms: string[] = scope === "firm" ? UNITS.map((u) => u.realm_id) : [scope === "finserv" ? FINSERV_REALM : DEBT_REALM];
    let last = end_month ?? new Date().toISOString().slice(0, 7);
    if (view === "quarter") { const m = Number(last.slice(5)); last = `${last.slice(0, 4)}-${String(Math.ceil(m / 3) * 3).padStart(2, "0")}`; }
    const step = view === "quarter" ? 3 : 1;
    const ends = Array.from({ length: periods }, (_, i) => addMonthsKey(last, -(periods - 1 - i) * step));
    const first = addMonthsKey(ends[0], -11);
    const start = `${first}-01`;
    const [ly, lm] = last.split("-").map(Number);
    const end = new Date(Date.UTC(ly, lm, 0)).toISOString().slice(0, 10);
    try {
      const [invoices, hcRows, pnl] = await Promise.all([
        loadAll<{ txn_date: string; total_amt: number | null }>((a, b) => sb.from("quickbooks_invoices").select("txn_date, total_amt").in("realm_id", realms.filter((r) => r !== DEBT_REALM).length ? realms.filter((r) => r !== DEBT_REALM) : ["__none__"]).gte("txn_date", start).lte("txn_date", end).order("id").range(a, b)),
        loadAll<HcRow>((a, b) => sb.from("monthly_entity_headcount").select("realm_id, month, headcount").eq("company_id", WORKSPACE_ID).in("realm_id", realms).gte("month", start).lte("month", end).order("month").range(a, b)),
        monthlyPnl(sb, realms, start, end),
      ]);
      const revenue: Record<string, number> = {};
      if (realms.includes(DEBT_REALM)) {
        const debtPnl = await monthlyPnl(sb, [DEBT_REALM], start, end);
        for (const [k, v] of Object.entries(debtPnl)) revenue[k] = (revenue[k] ?? 0) + v.revenue;
      }
      for (const i of invoices) { const k = i.txn_date.slice(0, 7); revenue[k] = (revenue[k] ?? 0) + (Number(i.total_amt) || 0); }
      const gp: Record<string, number> = Object.fromEntries(Object.entries(pnl).map(([k, v]) => [k, v.gross_profit]));
      const per = new Map<string, Array<number | null>>();
      for (const r of hcRows) { const k = r.month.slice(0, 7); const v = r.headcount == null ? null : Number(r.headcount); per.set(k, [...(per.get(k) ?? []), v]); }
      const hc: Record<string, number | null> = {};
      for (const [k, vs] of per) hc[k] = scope === "firm" ? firmTotal(vs) : (vs.find((v) => v != null) ?? null);
      const rows = ends.map((e) => {
        const r = ttmPerHead(e, revenue, hc); const g = ttmPerHead(e, gp, hc);
        return { period_end_month: e, ttm_start_month: r.ttm_start_month, avg_headcount: r.avg_headcount, ttm_revenue: r.ttm_amount, revenue_per_head: r.per_head, ttm_gross_profit: g.ttm_amount, gross_profit_per_head: g.per_head };
      });
      const payload = { scope, view, ...(scope === "firm" ? { note: DUPLICATE_NOTE } : {}), periods: rows, monthly_headcount: hc };
      return textResult(payload, payload as unknown as Record<string, unknown>);
    } catch (e) { return errorResult(e instanceof Error ? e.message : "Per-head read failed"); }
  },
});
