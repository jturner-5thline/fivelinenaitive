/**
 * Debt Advisory Metrics (consolidated-debt-pipeline) SALES tiles for the
 * read-only get_dashboard_tile_values tool. Uses the same shared calculation
 * as useConsolidatedDebtPipelineMetrics (src/lib/dashboardTiles/debtStageEntry).
 * Each metric is read once for all requested periods, then computed in memory.
 */
import {
  DEBT_ACTIVE_PIPELINE_ID, DEBT_IN_DEVELOPMENT_PIPELINE_ID, DEBT_REALM_ID,
  computeStageEntryMetric, fetchEligibleHourRows, fetchInvoiceRows, fetchStageEntryRows,
  rollingAnchor, rollingMonthsWindow, stageEntryFetchWindow, sumInWindow,
  type AnySb, type StageEntryMetricOptions, type StageRow,
} from "../dashboardTiles/debtStageEntry";
import type { ResolvedPeriod } from "./dashboardPeriods";

type Tile = {
  tile_key: string; tile_label: string; value: number | string | null; unit: string; subtitle: string;
  definition: string; no_data_reason?: string; details?: Record<string, unknown>; rows?: unknown[]; rows_total?: number;
};

const DEBT_PIPES = [DEBT_ACTIVE_PIPELINE_ID, DEBT_IN_DEVELOPMENT_PIPELINE_ID];
const NDA_LABELS = ["ndaneeds-list-sent", "NDA/Needs List Sent", "NDA / Needs List Sent", "NDA/NEEDS LIST SENT", "NDA / NEEDS LIST SENT"];
const SIGNED = ["final-credit-items", "terms-issued", "in-due-diligence", "funded-invoiced"];
const TZ = "Period boundaries are UTC calendar dates (00:00:00Z start → 23:59:59.999Z end), as on the dashboard.";
const TEST = "test deals (Test-Niki's Store, Example Deal, names starting \"test \") excluded";

interface MetricSpec { stages: string[]; pipes: string[]; opts: StageEntryMetricOptions }
const SPECS: Record<string, MetricSpec> = {
  onBoard: { stages: ["ndaneeds-list-sent"], pipes: DEBT_PIPES, opts: {
    excludeDealOwners: ["John Moffitt"], excludeChangedByUserIds: ["2e65a4b1-bd94-46ef-87c6-9afe697b3180"],
    historyPipelineIds: [DEBT_ACTIVE_PIPELINE_ID], exactStageLabels: NDA_LABELS, calendarYearDedupe: true } },
  proposals: { stages: ["proposal-issued"], pipes: DEBT_PIPES, opts: { exactStageLabels: ["proposal-issued", "Proposal Issued"], calendarYearDedupe: true } },
  signed: { stages: SIGNED, pipes: DEBT_PIPES, opts: { firstEverInWindow: true, historyPipelineIds: [DEBT_ACTIVE_PIPELINE_ID] } },
  termsIssued: { stages: ["terms-issued"], pipes: DEBT_PIPES, opts: {} },
  termsSigned: { stages: ["in-due-diligence"], pipes: DEBT_PIPES, opts: {} },
  closedOnly: { stages: ["funded-invoiced"], pipes: [DEBT_ACTIVE_PIPELINE_ID], opts: {} },
  closedAny: { stages: ["funded-invoiced", "closed-won"], pipes: [DEBT_ACTIVE_PIPELINE_ID], opts: {} },
};

const minStr = (xs: string[]) => xs.reduce((a, b) => (b < a ? b : a));
const maxStr = (xs: string[]) => xs.reduce((a, b) => (b > a ? b : a));

export async function debtAdvisoryTiles(sb: AnySb, periods: ResolvedPeriod[], inc: boolean, off: number, lim: number, now = new Date()) {
  const windows = periods.map((p) => {
    const anchor = rollingAnchor(p.end, now);
    return { p, anchor, six: rollingMonthsWindow(anchor, 6), twelve: rollingMonthsWindow(anchor, 12) };
  });
  const allStarts = windows.flatMap((w) => [stageEntryFetchWindow(w.p.start, w.p.end, { calendarYearDedupe: true }).start, w.six.startDate, w.twelve.startDate]);
  const allEnds = windows.flatMap((w) => [w.p.end, w.anchor]);
  const wide = { start: minStr(allStarts), end: maxStr(allEnds) };

  const keys = Object.keys(SPECS);
  const fetched = await Promise.all([
    ...keys.map((k) => fetchStageEntryRows(sb, SPECS[k].stages, wide, SPECS[k].pipes, { ...SPECS[k].opts, paginate: true })),
  ]);
  const rowsBy: Record<string, StageRow[]> = Object.fromEntries(keys.map((k, i) => [k, fetched[i]]));
  const twelveStart = minStr(windows.map((w) => w.twelve.startDate));
  const anchorEnd = maxStr(windows.map((w) => w.anchor));
  const [invoices, hours] = await Promise.all([
    fetchInvoiceRows(sb, DEBT_REALM_ID, twelveStart, anchorEnd),
    fetchEligibleHourRows(sb, DEBT_PIPES, twelveStart, anchorEnd),
  ]);

  const metric = (k: string, startDate: string, endDate: string) => {
    const spec = SPECS[k];
    return computeStageEntryMetric(rowsBy[k], spec.stages, { startDate, endDate }, spec.pipes, spec.opts,
      stageEntryFetchWindow(startDate, endDate, spec.opts));
  };
  const drill = (deals: ReturnType<typeof metric>["deals"]) => {
    const rows = deals.map((d) => ({ deal_id: d.deal_id, company: d.company, value: d.value, stage_entered: d.to_stage, entered_at: d.entered_at, current_stage: d.current_stage }));
    return inc ? { rows: rows.slice(off, off + lim), rows_total: rows.length } : {};
  };
  const avg = (num: number, den: number) => (den > 0 ? num / den : null);

  return windows.map(({ p, anchor, six, twelve }) => {
    const onBoard = metric("onBoard", p.start, p.end);
    const proposals = metric("proposals", p.start, p.end);
    const signed = metric("signed", p.start, p.end);
    const termsIssued = metric("termsIssued", p.start, p.end);
    const termsSigned = metric("termsSigned", p.start, p.end);
    const closed = metric("closedOnly", p.start, p.end);
    const signed6 = metric("signed", six.startDate, six.endDate);
    const signed12 = metric("signed", twelve.startDate, twelve.endDate);
    const closed6 = metric("closedAny", six.startDate, six.endDate);
    const closed12 = metric("closedAny", twelve.startDate, twelve.endDate);
    const rev12 = sumInWindow(invoices, (r) => r.txn_date, (r) => r.total_amt, twelve.startDate, twelve.endDate);
    const hrs12 = sumInWindow(hours, (r) => r.week_start_date, (r) => r.hours, twelve.startDate, twelve.endDate);
    const ttm = `trailing window ${twelve.startDate} → ${twelve.endDate}`;
    const six6 = `trailing window ${six.startDate} → ${six.endDate}`;
    const anchorNote = `Rolling windows end at the last day of the period's end month, capped at the current month (${anchor}).`;

    const countTile = (key: string, label: string, m: typeof onBoard, subtitle: string, definition: string): Tile => ({
      tile_key: key, tile_label: label, value: m.count, unit: "count", subtitle: `${subtitle} · $${Math.round(m.dollarVolume).toLocaleString("en-US")}`,
      definition, details: { dollars: m.dollarVolume }, ...drill(m.deals),
    });
    const avgTile = (key: string, label: string, v: number | null, unit: string, subtitle: string, definition: string, details: Record<string, unknown>, reason: string): Tile => ({
      tile_key: key, tile_label: label, value: v, unit, subtitle, definition, details, ...(v == null ? { no_data_reason: reason } : {}),
    });

    const tiles: Tile[] = [
      countTile("deals_on_the_board", "Deals on the Board", onBoard, "entered NDA / Needs List Sent",
        `First stage_enter per deal into NDA / Needs List Sent (exact spellings ${NDA_LABELS.join(", ")}) logged while the deal was on the Active Pipeline, for deals now on the Active or In Development pipeline; excludes entries on deals owned by John Moffitt or authored by him and ${TEST}; collapsed by company name per calendar year keeping the earliest entry; $ = deal value at the time of entry. ${TZ}`),
      countTile("proposals_issued", "Proposals Issued", proposals, "entered Proposal Issued",
        `First stage_enter per deal into Proposal Issued ("proposal-issued"/"Proposal Issued") on the Active or In Development pipelines; ${TEST}; collapsed by company name per calendar year keeping the earliest entry; $ = deal value at the time of entry. ${TZ}`),
      countTile("debt_deals_signed", "Debt Deals Signed", signed, "first entered a signed stage",
        `Deals whose first-ever stage_enter into any signed stage (Final Credit Items, Terms Issued, In Due Diligence or Funded / Invoiced, any stored spelling) falls in the period, counting only entries logged while the deal was on the Active Pipeline and deals now on the Active or In Development pipeline; a deal whose first signed entry predates the period is excluded; ${TEST}; collapsed by company name keeping the earliest entry; $ (Dollars Signed) = deal value at the time of that entry. ${TZ}`),
      countTile("terms_issued", "Terms Issued", termsIssued, "entered Terms Issued",
        `First stage_enter per deal within the period into Terms Issued (any stored spelling) on the Active or In Development pipelines; ${TEST}; collapsed by company name keeping the earliest entry; $ = deal value at the time of entry. ${TZ}`),
      countTile("terms_signed", "Terms Signed", termsSigned, "entered In Due Diligence",
        `First stage_enter per deal within the period into In Due Diligence (any stored spelling) on the Active or In Development pipelines; ${TEST}; collapsed by company name keeping the earliest entry; $ = deal value at the time of entry. ${TZ}`),
      countTile("deals_closed", "Deals Closed", closed, "entered Funded / Invoiced",
        `First stage_enter per deal within the period into Funded / Invoiced or Closed Won (any stored spelling) on the Active Pipeline only, plus Active Pipeline deals currently in those stages whose closing_date falls in the period but lack a history row; ${TEST}; collapsed by company name keeping the earliest entry; $ (Dollars Funded) = deal value at the time of entry. ${TZ}`),
      avgTile("average_deal_on_the_board", "Average Deal on the Board", avg(onBoard.dollarVolume, onBoard.count), "usd", "selected period · $ on the Board ÷ Deals on the Board",
        "Dollars on the Board ÷ Deals on the Board for the selected period (same deals as the Deals on the Board tile, including $0-value deals).",
        { numerator: onBoard.dollarVolume, denominator: onBoard.count }, "no_deals_on_board_in_period"),
      avgTile("average_deal_signed", "Average Deal Signed", avg(signed6.dollarVolume, signed6.count), "usd", `trailing 6 months (${six6})`,
        `Dollars Signed ÷ Debt Deals Signed over the trailing 6 calendar months, using the Debt Deals Signed calculation. ${anchorNote}`,
        { numerator: signed6.dollarVolume, denominator: signed6.count, window: six }, "no_signed_deals_in_trailing_6_months"),
      avgTile("average_revenue_per_deal_signed", "Average Revenue per Deal Signed", avg(rev12, signed12.count), "usd", `trailing 12 months (${ttm})`,
        `Sum of 5th Line Capital Advisors QuickBooks invoice totals (txn_date in the window) ÷ Debt Deals Signed over the same trailing 12 calendar months. ${anchorNote}`,
        { revenue: rev12, signed_deals: signed12.count, window: twelve }, "no_signed_deals_in_trailing_12_months"),
      avgTile("average_deal_closed", "Average Deal Closed", avg(closed6.dollarVolume, closed6.count), "usd", `trailing 6 months (${six6})`,
        `Deal value ÷ count of deals with a first stage_enter into Funded / Invoiced or Closed Won on the Active Pipeline over the trailing 6 calendar months (closing_date fallback, ${TEST}, collapsed by company name). ${anchorNote}`,
        { numerator: closed6.dollarVolume, denominator: closed6.count, window: six }, "no_closed_deals_in_trailing_6_months"),
      avgTile("average_revenue_per_deal_closed", "Average Revenue per Deal Closed", avg(rev12, closed12.count), "usd", `trailing 12 months (${ttm})`,
        `Sum of 5th Line Capital Advisors QuickBooks invoice totals ÷ count of deals with a first stage_enter into Funded / Invoiced or Closed Won on the Active Pipeline over the same trailing 12 calendar months. ${anchorNote}`,
        { revenue: rev12, closed_deals: closed12.count, window: twelve }, "no_closed_deals_in_trailing_12_months"),
      avgTile("revenue_per_deal_hour", "Revenue per Deal Hour", avg(rev12, hrs12), "usd_per_hour", `trailing 12 months (${ttm})`,
        `Sum of 5th Line Capital Advisors QuickBooks invoice totals ÷ hours in weekly_time_entries (week_start_date in the window) on non-test deals currently on the Active or In Development pipeline, over the same trailing 12 calendar months. ${anchorNote}`,
        { revenue: rev12, hours: hrs12, window: twelve }, "no_deal_hours_in_trailing_12_months"),
    ];
    return { period: p.period, start: p.start, end: p.end, tiles };
  });
}
