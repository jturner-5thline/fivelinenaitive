import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { bucketSalesCallsByWeek, bucketSalesCallsByMonth } from "../salesCallsWeekly";
import { isSalesCallTitleForVariant } from "../../dashboardTiles/salesCallFilters";

export default defineTool({
  name: "get_sales_calls_weekly",
  title: "Get weekly sales call counts",
  description:
    "Returns the Sales Calls metric shown on Insights → Sales Dashboard, bucketed by week (Monday–Sunday, UTC). Debt counts deduped calendar events titled \"[Company] <> 5th Line Financing Review\"; FinServ counts \"5th Line <> [Company] Financial Review\" or \"[Company] <> 5th Line: Intro\". Defaults to the last 12 weeks ending today. Weekly output (default) counts every event the sales-calls service returns; group_by=\"month\" applies the Sales Dashboard tile's exact title rule (FinServ excludes any Debt financing review) and UTC month buckets.",
  inputSchema: {
    weeks: z.number().int().min(1).max(53).default(12).describe("Number of weeks back from end_date."),
    end_date: z.string().trim().max(30).optional().describe("ISO date (YYYY-MM-DD) to end on; defaults to today."),
    variant: z.enum(["debt", "finserv"]).default("debt"),
    include_events: z.boolean().default(false).describe("Also return each qualifying call."),
    group_by: z.enum(["week", "month"]).default("week").describe('"month" adds UTC calendar-month buckets (Sales Dashboard month boundaries) and uses the exact Sales Dashboard tile title rule.'),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ weeks, end_date, variant, include_events, group_by }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const end = end_date ? new Date(`${end_date}T23:59:59.999Z`) : new Date();
    if (Number.isNaN(end.getTime())) return errorResult("Invalid end_date");
    const start = new Date(end.getTime() - weeks * 7 * 86400000);

    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.functions.invoke("sales-calls-count", {
      body: { time_min: start.toISOString(), time_max: end.toISOString(), variant },
    });
    if (error) return errorResult(`Sales calls unavailable: ${error.message}`);

    const events = (Array.isArray(data?.events) ? data.events : []) as Array<{
      start: string | null; company: string | null; title: string | null; user_name?: string | null;
    }>;
    if (group_by === "month") {
      const kept = events.filter((e) => isSalesCallTitleForVariant(e.title, variant));
      const months = bucketSalesCallsByMonth(kept, start, end);
      const payload = {
        variant, group_by, time_zone: "UTC",
        rule: "Same rule as the Sales Dashboard tile: deduped calendar events re-filtered by the dashboard title rule, bucketed by UTC calendar month of the start time.",
        range: { from: start.toISOString(), to: end.toISOString() },
        total: months.reduce((a, r) => a + r.count, 0),
        months,
        ...(include_events ? { events: kept.map((e) => ({ start: e.start, company: e.company, title: e.title, host: e.user_name ?? null })) } : {}),
      };
      return textResult(payload, payload);
    }
    const rows = bucketSalesCallsByWeek(events, start, end).slice(-weeks);
    const total = rows.reduce((a, r) => a + r.count, 0);
    const payload = {
      variant,
      range: { from: start.toISOString(), to: end.toISOString() },
      total,
      weeks: rows,
      ...(include_events
        ? { events: events.map((e) => ({ start: e.start, company: e.company, title: e.title, host: e.user_name ?? null })) }
        : {}),
    };
    return textResult(payload, payload);
  },
});
