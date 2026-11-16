import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { WORKSPACE_ID, HARVEST_START, FINSERV_REALM, aggregateHarvestMonths, perHour, type HarvestRow } from "../workforceMetrics";
import { loadAll, monthlyPnl } from "./_workforceLoad";

export default defineTool({
  name: "get_harvest_metrics",
  title: "Get Harvest hours and FinServ revenue/profit per hour",
  description: "Harvest time data from the latest completed sync (Jan 2024 onward) as shown on the FinServ Financial Metrics dashboard: monthly total/billable hours, billable amount, per-person hours and utilization, plus FinServ Revenue per Hour (QuickBooks income ÷ billable hours of ALL users), Gross Profit per Hour and Profit per Hour (operating profit ÷ billable hours), monthly and for the whole period. Set include_entries=true for raw time entries.",
  inputSchema: {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date (default 2024-01-01)."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date inclusive (default today)."),
    include_entries: z.boolean().default(false),
    entries_limit: z.number().int().min(1).max(5000).default(1000),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, include_entries, entries_limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const start = from && from > HARVEST_START ? from : HARVEST_START;
    const end = to ?? new Date().toISOString().slice(0, 10);
    try {
      const { data: state, error: se } = await sb.from("harvest_sync_state").select("active_run, last_synced_at, sync_through").eq("company_id", WORKSPACE_ID).maybeSingle();
      if (se) return errorResult(se.message);
      if (!state?.active_run) return errorResult("No completed Harvest sync is available yet.");
      const cols = "spent_date, hours, billable, billable_rate, currency, user_name, client_name, project_name, task_name, notes";
      const entries = await loadAll<HarvestRow & Record<string, unknown>>((a, b) => sb.from("harvest_time_entries").select(cols)
        .eq("company_id", WORKSPACE_ID).eq("sync_run", state.active_run).gte("spent_date", start).lte("spent_date", end).order("harvest_id").range(a, b));
      const agg = aggregateHarvestMonths(entries);
      const pnl = await monthlyPnl(sb, [FINSERV_REALM], start.slice(0, 7) + "-01", end);
      const keys = [...new Set([...Object.keys(agg), ...Object.keys(pnl)])].filter((k) => k >= start.slice(0, 7) && k <= end.slice(0, 7)).sort();
      const months = keys.map((k) => {
        const h = agg[k]; const p = pnl[k];
        const bh = h?.billable_hours ?? 0;
        return {
          month: k, total_hours: h?.hours ?? 0, billable_hours: bh,
          utilization_pct: h?.hours ? (bh / h.hours) * 100 : null,
          billable_amount: h?.missing_rates ? null : h?.billable_amount ?? 0,
          finserv_revenue: p?.revenue ?? null, finserv_gross_profit: p?.gross_profit ?? null, finserv_operating_profit: p?.operating_profit ?? null,
          revenue_per_hour: p ? perHour(p.revenue, bh) : null,
          gross_profit_per_hour: p ? perHour(p.gross_profit, bh) : null,
          profit_per_hour: p ? perHour(p.operating_profit, bh) : null,
          people: Object.entries(h?.people ?? {}).map(([name, v]) => ({ name, hours: v.hours, billable_hours: v.billable_hours, utilization_pct: v.hours ? (v.billable_hours / v.hours) * 100 : null })),
        };
      });
      const s = (f: (m: (typeof months)[number]) => number | null) => months.reduce((t, m) => t + (f(m) ?? 0), 0);
      const bh = s((m) => m.billable_hours), rev = s((m) => m.finserv_revenue), gp = s((m) => m.finserv_gross_profit), op = s((m) => m.finserv_operating_profit);
      const people = new Map<string, { hours: number; billable_hours: number }>();
      for (const m of months) for (const p of m.people) { const t = people.get(p.name) ?? { hours: 0, billable_hours: 0 }; t.hours += p.hours; t.billable_hours += p.billable_hours; people.set(p.name, t); }
      const payload = {
        sync: { last_synced_at: state.last_synced_at, sync_through: state.sync_through },
        period: { from: start, to: end },
        totals: { total_hours: s((m) => m.total_hours), billable_hours: bh, finserv_revenue: rev, finserv_gross_profit: gp, finserv_operating_profit: op,
          revenue_per_hour: perHour(rev, bh), gross_profit_per_hour: perHour(gp, bh), profit_per_hour: perHour(op, bh) },
        people: [...people].map(([name, v]) => ({ name, ...v, utilization_pct: v.hours ? (v.billable_hours / v.hours) * 100 : null })).sort((a, b) => b.hours - a.hours),
        months,
        notes: "Per-hour rates divide FinServ QuickBooks P&L figures (5th Line Financial Services, LLC) by billable hours of everyone in Harvest. The Utilization widget hides Siddhi, but her hours count here and in the rates. Months with no stored P&L snapshot return null rates.",
        ...(include_entries ? { entries: entries.slice(0, entries_limit), entries_total: entries.length } : {}),
      };
      return textResult(payload, payload as unknown as Record<string, unknown>);
    } catch (e) { return errorResult(e instanceof Error ? e.message : "Harvest read failed"); }
  },
});
