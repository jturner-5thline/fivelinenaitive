import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { WORKSPACE_ID, UNITS, DUPLICATE_NOTE, headcountMatrix, type HcRow } from "../workforceMetrics";
import { loadAll } from "./_workforceLoad";

export default defineTool({
  name: "get_headcount",
  title: "Get monthly headcount by entity",
  description: "Monthly headcount from the Insights Headcount editor for each QuickBooks entity (Debt, FinServ, Tech, Parent) plus the firm-wide total (sum minus 1 for James's Debt/Parent duplicate) and yearly averages. 5th Line workspace only.",
  inputSchema: {
    from_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("First month YYYY-MM (default: all)."),
    to_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Last month YYYY-MM inclusive."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_month, to_month }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    try {
      const rows = await loadAll<HcRow>((a, b) => {
        let q = sb.from("monthly_entity_headcount").select("realm_id, month, headcount").eq("company_id", WORKSPACE_ID).order("month").range(a, b);
        if (from_month) q = q.gte("month", `${from_month}-01`);
        if (to_month) q = q.lte("month", `${to_month}-28`);
        return q;
      });
      const months = headcountMatrix(rows);
      const years = new Map<string, typeof months>();
      for (const m of months) years.set(m.month.slice(0, 4), [...(years.get(m.month.slice(0, 4)) ?? []), m]);
      const avg = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
      const yearly = [...years].map(([year, ms]) => ({ year, ...Object.fromEntries(UNITS.map((u) => [`${u.label}_avg`, avg(ms.map((m) => (m as Record<string, number | null>)[u.label]))])), firm_total_avg: avg(ms.map((m) => m.firm_total)) }));
      const payload = { units: UNITS, note: DUPLICATE_NOTE, month_count: months.length, months, yearly };
      return textResult(payload, payload as unknown as Record<string, unknown>);
    } catch (e) { return errorResult(e instanceof Error ? e.message : "Headcount read failed"); }
  },
});
