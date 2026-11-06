import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { buildFinanceWeeklyBalance, composeCombinedScheduledItems, type CashInRowLike } from "../../../components/cashflow/financeWeeklyBalanceCore";
import {
  buildDealProjectedCashFlows,
  retainerDealIds,
  DEAL_PROJECTION_SELECT,
  type DealCashflowOverride,
  type StageHistoryRow,
} from "../../../components/cashflow/dealProjections";
import { computeCashflowKpis } from "../../../components/cashflow/cashflowKpis";
import type { ScheduledCashFlow } from "../../../components/cashflow/scheduledCashFlows";
import type { WeeklyOverrides } from "../../../components/cashflow/types";

const DEFAULT_WEEKS_FUTURE = 8;
const DEFAULT_WEEKS_PAST = 1;
const num = (v: unknown) => Math.round(Number(v) || 0);

export default defineTool({
  name: "get_cashflow_metrics",
  title: "Get cash flow metrics (Finance headline widgets)",
  description:
    "Returns the exact Finance > Cash Flow headline figures: Cash In, Cash Out, Net Change (current week through weeks_future), and Peak Cash / Low Cash with their week-ending dates (weeks_past through weeks_future). Uses the same calculation as the Finance page, including scheduled entries, deal fee projections, manual date/amount moves and weekly overrides. Defaults to the workspace's saved Finance window. Figures match the page with no Year/Quarter/Entity/Category filters applied.",
  inputSchema: {
    weeks_future: z.number().int().min(0).max(104).optional().describe("Weeks after the current week. Defaults to the Finance page default."),
    weeks_past: z.number().int().min(0).max(104).optional().describe("Weeks before the current week used for Peak/Low Cash. Defaults to the Finance page default."),
    as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Anchor date (YYYY-MM-DD). Defaults to today (UTC), like the page."),
    include_weekly_breakdown: z.boolean().default(false).describe("Also return each visible week's beginning cash, receipts, disbursements, net change and ending cash."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ weeks_future, weeks_past, as_of, include_weekly_breakdown }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: member, error: mErr } = await sb
      .from("company_members").select("company_id").eq("user_id", userId).limit(1).maybeSingle();
    if (mErr) return errorResult(mErr.message);
    if (!member?.company_id) return errorResult("forbidden: the signed-in user is not a member of a company.");
    const companyId = member.company_id as string;

    let weeksFuture = weeks_future;
    let weeksPast = weeks_past;
    if (weeksFuture === undefined || weeksPast === undefined) {
      const { data: settings } = await sb
        .from("system_settings").select("key,value")
        .in("key", ["cashflow.default_weeks_past", "cashflow.default_weeks_future"]);
      for (const row of settings ?? []) {
        const raw = (row as { value: unknown }).value;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) continue;
        const key = (row as { key: string }).key;
        if (key === "cashflow.default_weeks_future" && weeksFuture === undefined) weeksFuture = n;
        if (key === "cashflow.default_weeks_past" && weeksPast === undefined) weeksPast = n;
      }
    }
    weeksFuture ??= DEFAULT_WEEKS_FUTURE;
    weeksPast ??= DEFAULT_WEEKS_PAST;

    const [schedRes, cashInRes, overridesRes, importRes, dealsRes] = await Promise.all([
      sb.from("scheduled_cash_flows").select("*").eq("company_id", companyId).order("created_at", { ascending: true }),
      sb.from("cashflow_cash_in_items").select("id, deal_name, fee_type, amount, target_date, deal_id").eq("company_id", companyId).order("target_date", { ascending: true }),
      sb.from("cashflow_deal_overrides").select("deal_entry_id, excluded_dates, end_date, override_date, override_amount").eq("company_id", companyId),
      sb.from("cash_flow_imports").select("weekly_overrides").eq("company_id", companyId).maybeSingle(),
      sb.from("deals").select(DEAL_PROJECTION_SELECT).eq("company_id", companyId).limit(500),
    ]);
    for (const r of [schedRes, cashInRes, overridesRes, importRes, dealsRes]) {
      if (r.error) return errorResult(r.error.message);
    }

    const overrides: Record<string, DealCashflowOverride> = {};
    for (const row of (overridesRes.data ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.deal_entry_id);
      overrides[id] = {
        deal_entry_id: id,
        excluded_dates: Array.isArray(row.excluded_dates) ? (row.excluded_dates as string[]) : [],
        end_date: (row.end_date as string | null) ?? null,
        override_date: (row.override_date as string | null) ?? null,
        override_amount: row.override_amount == null ? null : Number(row.override_amount),
      };
    }

    const deals = (dealsRes.data ?? []) as unknown as Record<string, unknown>[];
    let hist: StageHistoryRow[] = [];
    const ids = retainerDealIds(deals);
    if (ids.length) {
      const { data: h, error: hErr } = await sb
        .from("deal_stage_history").select("deal_id, to_stage, to_stage_id, changed_at")
        .in("deal_id", ids).order("changed_at", { ascending: true });
      if (hErr) return errorResult(hErr.message);
      hist = (h ?? []) as StageHistoryRow[];
    }

    const wo = (importRes.data as { weekly_overrides?: unknown } | null)?.weekly_overrides;
    const weeklyOverrides: WeeklyOverrides =
      wo && typeof wo === "object" && !Array.isArray(wo) ? (wo as WeeklyOverrides) : {};

    const combinedScheduledItems = composeCombinedScheduledItems({
      qbDerivedItems: [], // QuickBooks auto-derivation is disabled on the Finance page too.
      dealProjectedItems: buildDealProjectedCashFlows(deals, hist, overrides),
      scheduledItems: (schedRes.data ?? []) as unknown as ScheduledCashFlow[],
      cashInDbItems: (cashInRes.data ?? []) as unknown as CashInRowLike[],
      companyId,
    });
    const { weeklyWithScheduled } = buildFinanceWeeklyBalance({ combinedScheduledItems, weeklyOverrides });
    const today = as_of ?? new Date().toISOString().split("T")[0];
    const k = computeCashflowKpis(weeklyWithScheduled, weeksFuture, weeksPast, today);

    const metrics = {
      as_of: today,
      weeks_future: weeksFuture,
      weeks_past: weeksPast,
      cash_in: num(k.cashIn),
      cash_out: num(k.cashOut),
      net_change: num(k.netChange),
      kpi_range: { label: k.kpiRangeLabel, first_week_ending: k.kpiRangeStart, last_week_ending: k.kpiRangeEnd, weeks: k.kpiWeekCount },
      peak_cash: k.peakCash ? { amount: num(k.peakCash.value), week_ending: k.peakCash.weekEnding } : null,
      low_cash: k.lowCash ? { amount: num(k.lowCash.value), week_ending: k.lowCash.weekEnding } : null,
      peak_low_range: { first_week_ending: k.visibleRangeStart, last_week_ending: k.visibleRangeEnd },
      filters_applied: "none (matches the page with no Year/Quarter/Entity/Category filters)",
    };

    let weekly: Array<Record<string, string | number>> | undefined;
    if (include_weekly_breakdown && k.visibleRangeStart && k.visibleRangeEnd) {
      weekly = Object.entries(weeklyWithScheduled)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, e]) => {
          const entry = e as Record<string, unknown>;
          return {
            week_ending: typeof entry.week_ending === "string" ? entry.week_ending : key,
            beginning_cash: num(entry["BEGINNING CASH"]),
            total_receipts: num(entry["TOTAL RECEIPTS"]),
            total_disbursements: num(entry["TOTAL DISBURSEMENTS"]),
            net_change: num(entry["NET CHANGE"] ?? entry["TOTAL NET CASH CHANGE"]),
            ending_cash: num(entry["ENDING CASH"]),
          };
        })
        .filter((w) => String(w.week_ending) >= k.visibleRangeStart! && String(w.week_ending) <= k.visibleRangeEnd!);
    }

    const payload = weekly ? { ...metrics, weekly } : metrics;
    return textResult(payload, payload);
  },
});
