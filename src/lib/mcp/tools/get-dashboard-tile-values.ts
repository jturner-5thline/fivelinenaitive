import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { resolveCustom, resolvePeriod, salesV2DataYears, zonedTime, type ResolvedPeriod } from "../dashboardPeriods";
import {
  ACTIVE_PIPELINE_ID, DEBT_STAGE_PIPELINES, DOLLARS_SIGNED_STAGE_LABELS, FINSERV_DEALS_ON_BOARD_LABELS,
  FINSERV_PIPELINE_ID, FINSERV_PROPOSALS_LABELS, PROPOSAL_ISSUED_STAGE_LABELS,
  averageSizedValue, computeDealsOnBoard, computeFirstEntries, computeStageEntryDeals,
  fetchDealsOnBoardRows, fetchFirstEntryRows, fetchStageEntryWindowRows, yearWindow, type AnySupabase,
} from "../../dashboardTiles/stageQueries";
import { isSalesCallTitleForVariant } from "../../dashboardTiles/salesCallFilters";
import { loadReferralSourceMeetings } from "../../dashboardTiles/referralMeetings";
import {
  computeTtmConversion, fetchActivePipelineIds, fetchTtmActiveDeals, loadReferralDealsOnBoard, ttmAnchorFromTimeframeEnd, ttmWindow,
} from "../../dashboardTiles/referralDeals";
import { FINSERV_QBO_REALM_ID, loadFinServNewMrrAdded, loadFinServNrr, loadFinServPipelineSnapshot } from "../../dashboardTiles/finservTiles";
import { MASTER_PLAN_KEYS, PLAN_OVERLAY_MAP, ROW_ORDER, mergeMasterPlanRows, seedPlanValue, type MetricKey } from "../../dashboardTiles/salesModelPlan";
import { loadReferralClassification } from "../referralClassification";
import { normalizeEntityName } from "../../entityTitleMatch";
import { debtAdvisoryTiles } from "../debtAdvisoryTiles";

const SALES_BD_TZ = "America/Chicago";
type Tile = {
  tile_key: string; tile_label: string; value: number | string | null; unit: string; subtitle: string;
  definition: string; no_data_reason?: string; details?: Record<string, unknown>; rows?: unknown[]; rows_total?: number;
};

function page<T>(rows: T[], include: boolean, offset: number, limit: number) {
  return include ? { rows: rows.slice(offset, offset + limit), rows_total: rows.length } : {};
}

async function companyIdFor(sb: AnySupabase, ctx: ToolContext): Promise<string> {
  const { data, error } = await sb.from("company_members").select("company_id").eq("user_id", ctx.getUserId()).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.company_id) throw new Error("forbidden: the signed-in user is not a member of a company.");
  return data.company_id as string;
}

async function salesCalls(sb: AnySupabase, p: ResolvedPeriod, variant: "debt" | "finserv") {
  const { data, error } = await sb.functions.invoke("sales-calls-count", {
    body: { time_min: `${p.start}T00:00:00.000Z`, time_max: `${p.end}T23:59:59.999Z`, variant },
  });
  if (error) throw new Error(`Sales calls unavailable: ${error.message}`);
  const events = (Array.isArray(data?.events) ? data.events : []) as Array<{ start: string | null; title: string | null; company: string | null; user_name?: string | null }>;
  const months = new Set(p.months);
  return events.filter((e) => {
    if (!e.start || !isSalesCallTitleForVariant(e.title, variant)) return false;
    const d = new Date(e.start);
    return months.has(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  });
}

const sumBy = <T,>(byKey: Record<string, T[]>, months: string[]) => months.flatMap((m) => byKey[m] ?? []);
const mm = (n: number) => Math.round((n / 1_000_000) * 1e6) / 1e6;

async function salesDashboardV2(sb: AnySupabase, companyId: string, p: ResolvedPeriod, inc: boolean, off: number, lim: number): Promise<Tile[]> {
  const { start, end } = yearWindow(salesV2DataYears(p));
  const [debtCalls, fsCalls, dobRows, propRows, signedRows, fsDobRows, fsPropRows] = await Promise.all([
    salesCalls(sb, p, "debt"),
    salesCalls(sb, p, "finserv"),
    fetchDealsOnBoardRows(sb, start, end),
    fetchFirstEntryRows(sb, { pipelineIds: DEBT_STAGE_PIPELINES, labels: PROPOSAL_ISSUED_STAGE_LABELS, start, end }),
    fetchFirstEntryRows(sb, { pipelineIds: [ACTIVE_PIPELINE_ID], labels: DOLLARS_SIGNED_STAGE_LABELS, start, end }),
    fetchFirstEntryRows(sb, { pipelineIds: [FINSERV_PIPELINE_ID], labels: FINSERV_DEALS_ON_BOARD_LABELS, start, end }),
    fetchFirstEntryRows(sb, { pipelineIds: [FINSERV_PIPELINE_ID], labels: FINSERV_PROPOSALS_LABELS, start, end }),
  ]);
  const dob = computeDealsOnBoard(dobRows);
  const prop = computeFirstEntries(propRows, true);
  const signed = computeFirstEntries(signedRows, true);
  const fsDob = computeFirstEntries(fsDobRows, false);
  const fsProp = computeFirstEntries(fsPropRows, false);

  const sStart = `${p.start}T00:00:00.000Z`;
  const [ey, em] = p.end.split("-").map(Number);
  const sEnd = new Date(Date.UTC(ey, em, 1)).toISOString();
  const ndaWindow = computeStageEntryDeals(await fetchStageEntryWindowRows(sb, "ndaneeds-list-sent", sStart, sEnd), true);
  const avg = averageSizedValue(ndaWindow);

  const dobDeals = sumBy(dob.byMonthKey, p.months);
  const propDeals = sumBy(prop.byMonthKey, p.months);
  const fsDobDeals = sumBy(fsDob.byMonthKey, p.months);
  const fsPropDeals = sumBy(fsProp.byMonthKey, p.months);
  const TZ = "Period boundaries are UTC calendar months.";
  const tiles: Tile[] = [
    { tile_key: "sales_calls", tile_label: "Sales Calls", value: debtCalls.length, unit: "count", subtitle: "Debt variant",
      definition: `Deduped synced calendar events whose title contains "5th Line … Financing Review" across connected teammate calendars, bucketed by event start month. ${TZ}`,
      ...page(debtCalls.map((e) => ({ start: e.start, title: e.title, company: e.company, host: e.user_name ?? null })), inc, off, lim) },
    { tile_key: "deals_on_board", tile_label: "Deals on Board", value: dobDeals.length, unit: "count", subtitle: "entered NDA / Needs List Sent",
      definition: `Distinct deals with a deal_stage_history stage_enter into NDA / Needs List Sent (any stored spelling) on the Active Pipeline, excluding John Moffitt-owned/authored entries and test deals, deduped by company name keeping the earliest entry within the fetched calendar years. ${TZ}`,
      ...page(dobDeals.map((d) => ({ deal_id: d.id, company: d.company, value: d.value, entered_at: d.created_at, current_stage: d.stage })), inc, off, lim) },
    { tile_key: "proposals_issued", tile_label: "Proposals Issued", value: propDeals.length, unit: "count", subtitle: "entered Proposal Issued",
      definition: `First stage_enter per deal into Proposal Issued ("proposal-issued"/"Proposal Issued") on the Active and In Development pipelines, test deals excluded, collapsed by company name. ${TZ}`,
      ...page(propDeals.map((d) => ({ deal_id: d.deal_id, company: d.company, value: d.value, entered_at: d.entered_at })), inc, off, lim) },
    { tile_key: "avg_new_deal_on_board", tile_label: "Avg. New Deal on Board", value: avg, unit: "usd",
      subtitle: avg == null ? "No sized deals in period" : `${ndaWindow.filter((d) => d.value > 0).length} sized deals`,
      definition: `Average deals.value (value > 0 only) of distinct deals with a stage_enter into ndaneeds-list-sent on the Active Pipeline between the first day of the start month and the first day of the month after the end (UTC), test deals excluded.`,
      ...(avg == null ? { no_data_reason: "no_sized_deals" } : {}),
      ...page(ndaWindow.map((d) => ({ deal_id: d.deal_id, company: d.company, value: d.value, entered_at: d.changed_at })), inc, off, lim) },
    { tile_key: "finserv_sales_calls", tile_label: "FinServ Sales Calls", value: fsCalls.length, unit: "count", subtitle: "FinServ variant",
      definition: `Deduped calendar events titled "5th Line <> [Company] Financial Review" or "[Company] <> 5th Line: Intro" (never a Debt financing review). ${TZ} The dashboard only loads this tile after the KPI toggle is switched to FinServ; with the default Debt toggle it shows the Debt figure.`,
      ...page(fsCalls.map((e) => ({ start: e.start, title: e.title, company: e.company, host: e.user_name ?? null })), inc, off, lim) },
    { tile_key: "finserv_deals_on_board", tile_label: "FinServ Deals on Board", value: fsDobDeals.length, unit: "count", subtitle: "entered Qualification",
      definition: `First stage_enter per deal into Qualification ("fs-qualification"/"Qualification") on the FinServ pipeline, test deals excluded. ${TZ}`,
      ...page(fsDobDeals.map((d) => ({ deal_id: d.deal_id, company: d.company, value: d.value, entered_at: d.entered_at })), inc, off, lim) },
    { tile_key: "finserv_proposals_issued", tile_label: "FinServ Proposals Issued", value: fsPropDeals.length, unit: "count", subtitle: "entered Proposal Sent",
      definition: `First stage_enter per deal into Proposal Sent ("fs-proposal-sent"/"Proposal Sent") on the FinServ pipeline, test deals excluded. ${TZ}`,
      ...page(fsPropDeals.map((d) => ({ deal_id: d.deal_id, company: d.company, value: d.value, entered_at: d.entered_at })), inc, off, lim) },
  ];

  // ---- Sales Model table (Forecast / Actuals / Variance) ----
  const q = sb.from("insights_metric_targets").select("metric_key, period_month, target_value")
    .or("metric_key.like.plan:sales-dashboard-v2:%,metric_key.like.plan:consolidated-debt-pipeline:%")
    .eq("company_id", companyId);
  const { data: planRows, error: planErr } = await q;
  if (planErr) throw new Error(planErr.message);
  const master = mergeMasterPlanRows((planRows ?? []) as Array<{ metric_key: string; period_month: string | null; target_value: number }>, new Set(MASTER_PLAN_KEYS));
  const live: Partial<Record<MetricKey, Record<string, number>>> = {
    salesCalls: countByMonth(debtCalls.map((e) => e.start as string)),
    dealsOnBoard: lenMap(dob.byMonthKey),
    proposalsIssued: lenMap(prop.byMonthKey),
    dollarsSigned: Object.fromEntries(Object.entries(signed.byMonthKey).map(([k, arr]) => [k, mm(arr.reduce((s, d) => s + d.value, 0))])),
  };
  const modelRows = ROW_ORDER.map((row) => {
    const months = p.months.map((ym) => {
      const [y, m] = ym.split("-").map(Number);
      const overlay = PLAN_OVERLAY_MAP[row.key];
      const mp = overlay ? master[overlay.widgetKey]?.[ym] : undefined;
      const forecast = mp !== undefined && Number.isFinite(mp) ? mp / overlay!.divisor : seedPlanValue(row.key, y, m - 1);
      const liveMap = live[row.key];
      const actual = liveMap ? liveMap[ym] ?? 0 : null;
      return { month: ym, forecast, actual, variance: actual == null ? null : actual - forecast };
    });
    const tracked = !!live[row.key];
    const forecast = months.reduce((s, r) => s + r.forecast, 0);
    const actual = tracked ? months.reduce((s, r) => s + (r.actual ?? 0), 0) : null;
    return {
      row_key: row.key, row_label: row.label, unit: row.type === "money" ? "usd_mm" : "count",
      forecast, actual, variance: actual == null ? null : actual - forecast,
      ...(tracked ? {} : { no_data_reason: "not_tracked_in_live_actuals" }),
      months,
    };
  });
  tiles.push({
    tile_key: "sales_model", tile_label: "Sales Model", value: null, unit: "table", subtitle: "Forecast · Actuals · Variance",
    definition: "Forecast = saved Master Plan target for the month (plan:sales-dashboard-v2 preferred over plan:consolidated-debt-pipeline; currency ÷ 1,000,000 → $MM), else the authored 2026 Jan–Sep seed, else 0; unsaved on-screen forecast edits are not included. Actuals are live only for Sales Calls, Deals on Board, Proposals Issued and Dollars Signed; every other row shows \"—\" in the UI and returns actual = null with no_data_reason. Dollars Signed = first entry per deal into Final Credit Items or any later stage (Terms Issued, In Due Diligence, Funded/Invoiced) on the Active Pipeline, collapsed by company name, in $MM; it does not use deals.terms_signed_at. Clients Signed has no live actual.",
    details: { rows: modelRows },
  });
  return tiles;
}

function countByMonth(isos: string[]) {
  const out: Record<string, number> = {};
  for (const iso of isos) { const d = new Date(iso); const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; out[k] = (out[k] ?? 0) + 1; }
  return out;
}
const lenMap = <T,>(m: Record<string, T[]>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length]));

async function salesBdPage(sb: AnySupabase, ctx: ToolContext, companyId: string, p: ResolvedPeriod, inc: boolean, off: number, lim: number): Promise<Tile[]> {
  const start = zonedTime(p.start, "00:00:00", SALES_BD_TZ);
  const end = zonedTime(p.end, "23:59:59", SALES_BD_TZ);
  const TZ = `Period boundaries are ${p.start} 00:00:00 → ${p.end} 23:59:59 ${SALES_BD_TZ} (the dashboard uses the viewer's browser time zone).`;

  const [meetings, exclusionsRes, newSourcesRes, classification, onBoard, pipelineIds] = await Promise.all([
    loadReferralSourceMeetings(sb, companyId, start.toISOString(), end.toISOString()),
    sb.from("referral_meeting_exclusions").select("meeting_id").eq("company_id", companyId),
    sb.from("referral_sources").select("id, name, contact_name, company, channel, created_at").eq("company_id", companyId)
      .gte("created_at", start.toISOString()).lte("created_at", end.toISOString()).order("created_at", { ascending: false }),
    loadReferralClassification(sb as never, companyId, ctx.getUserId()),
    loadReferralDealsOnBoard(sb, companyId, start, end),
    fetchActivePipelineIds(sb, companyId),
  ]);
  if (exclusionsRes.error) throw new Error(exclusionsRes.error.message);
  if (newSourcesRes.error) throw new Error(newSourcesRes.error.message);
  const excluded = new Set((exclusionsRes.data ?? []).map((r: { meeting_id: string }) => r.meeting_id));
  const visible = meetings.filter((m) => !excluded.has(m.id)).sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));

  const contactIds = [...new Set(visible.map((m) => m.matched_contact_id).filter((v): v is string => !!v))];
  const contactNames = new Map<string, string>();
  if (inc && contactIds.length) {
    for (let i = 0; i < contactIds.length; i += 100) {
      const { data } = await sb.from("contacts").select("id, full_name, email").in("id", contactIds.slice(i, i + 100));
      for (const c of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) contactNames.set(c.id, c.full_name || c.email || c.id);
    }
  }

  const tiered = new Set(classification.classified.filter((s) => s.stage !== "Nurturing").map((s) => normalizeEntityName(s.name || "")));
  const newSources = ((newSourcesRes.data ?? []) as Array<{ id: string; name: string | null; contact_name: string | null; company: string | null; created_at: string }>)
    .filter((s) => { const n = normalizeEntityName(s.name || s.contact_name || ""); return !!n && !tiered.has(n); });

  const totalValue = onBoard.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const anchor = ttmAnchorFromTimeframeEnd(p.end);
  const w = ttmWindow(anchor);
  const ttmDeals = pipelineIds.length ? await fetchTtmActiveDeals(sb, companyId, pipelineIds, w.since.toISOString(), w.until.toISOString()) : [];
  const conv = computeTtmConversion(ttmDeals, "referral");

  return [
    { tile_key: "meetings_with_referral_sources", tile_label: "Meetings w/ Existing Referral Sources", value: visible.length, unit: "count",
      subtitle: "meetings held in selected timeframe",
      definition: `Synced calendar meetings (calendar-meetings-all, approved team calendars) in the period, excluding sales calls ("<> 5th Line"), deal syncs, blocks, attendee-less holds, internal-only meetings, meetings whose title names a client deal or funding source, meetings with client or funding-source attendee domains, and manual removals in referral_meeting_exclusions. ${TZ}`,
      details: { removed_by_exclusion: meetings.length - visible.length },
      ...page(visible.map((m) => ({
        id: m.id, title: m.title, start: m.started_at, organizer: m.organizer_email ?? null, internal_attendees: m.internal_emails ?? [],
        matched_contact_id: m.matched_contact_id, matched_contact: m.matched_contact_id ? contactNames.get(m.matched_contact_id) ?? null : null,
        matched_crm_company_id: m.matched_crm_company_id,
      })), inc, off, lim) },
    { tile_key: "new_referral_sources_added", tile_label: "New Referral Sources Added", value: newSources.length, unit: "count",
      subtitle: "added in selected timeframe",
      definition: `referral_sources rows for the company with created_at in the period, keeping only sources still in the Nurturing stage (names already at Tier 3/2/1 are excluded). "Added" = referral_sources.created_at. ${TZ}`,
      ...page(newSources.map((s) => ({ id: s.id, name: s.name || s.contact_name, company: s.company, added_at: s.created_at })), inc, off, lim) },
    { tile_key: "deals_and_dollars_on_board", tile_label: "Deals & Dollars on the Board", value: onBoard.length, unit: "count",
      subtitle: `entered NDA / Needs List Sent · $${Math.round(totalValue).toLocaleString("en-US")}`,
      definition: `Referral-sourced deals (Referred by set, or Sourced Via starts with "Referral") with a stage_enter into ndaneeds-list-sent on the Active Pipeline in the period, excluding John Moffitt-owned/authored entries and test deals, deduped by deal and company name. ${TZ}`,
      details: { dollars: totalValue },
      ...page(onBoard.map((d) => ({ deal_id: d.id, company: d.company, value: d.value, stage: d.stage, referred_by: d.referred_by, entered_at: d.created_at })), inc, off, lim) },
    { tile_key: "conversion_rate", tile_label: "Conversion Rate", value: conv.rate == null ? null : Math.round(conv.rate * 1000) / 10, unit: "percent",
      subtitle: "trailing 12 months",
      definition: "Active-pipeline deals (default pipeline or name containing \"active\") created in the 12 months ending at the period end (capped at now) with Sourced Via starting \"Referral\"; numerator = those whose current stage is Final Credit Items or later. Independent of the period start.",
      ...(conv.rate == null ? { no_data_reason: "no_referral_deals_in_ttm" } : {}),
      details: { numerator: conv.numerator, denominator: conv.denominator, window: { since: w.since.toISOString(), until: w.until.toISOString() } } },
    { tile_key: "referred_deals", tile_label: "Referred Deals", value: null, unit: "count", subtitle: "by referral source",
      definition: "Deal count and volume attributed to referral sources by the app's referral-source hook (effective-activity-date attribution).",
      no_data_reason: "not_yet_exposed: this tile's calculation lives only in the browser hook and has not been shared with the connector; use list_referral_partners or the dashboard." },
  ];
}

async function finservMetrics(sb: AnySupabase, companyId: string, p: ResolvedPeriod, inc: boolean, off: number, lim: number): Promise<Tile[]> {
  const [snap, newMrr, nrr, pnlRes] = await Promise.all([
    loadFinServPipelineSnapshot(sb, p.end),
    loadFinServNewMrrAdded(sb, companyId, p.start, p.end),
    loadFinServNrr(sb, p.start, p.end),
    sb.from("qbo_pnl_snapshots").select("income_total, fetched_at").eq("company_id", companyId).eq("realm_id", FINSERV_QBO_REALM_ID)
      .eq("accounting_method", "Accrual").eq("period_start", p.start).eq("period_end", p.end).maybeSingle(),
  ]);
  if (pnlRes.error) throw new Error(pnlRes.error.message);
  const revenue = pnlRes.data ? Number(pnlRes.data.income_total ?? 0) : null;
  const avg = revenue == null ? null : snap.totalClients > 0 ? revenue / snap.totalClients : 0;
  const asOf = `as of ${snap.asOf.toISOString()} (end of ${p.end}, capped at now; evaluated in server time)`;
  return [
    { tile_key: "total_clients", tile_label: "Total Clients", value: snap.totalClients, unit: "count", subtitle: "Active Clients at end of selected period",
      definition: `Distinct FinServ clients (CRM company, else normalized name) in Active Client at the period end; before May 2026 a deal also counts if its contract started by then and it had not exited Active Client or passed its contract end date. Test deals are not filtered here, matching the tile. ${asOf}`,
      ...page(snap.clients, inc, off, lim) },
    { tile_key: "total_mrr", tile_label: "Total MRR", value: snap.totalMrr, unit: "usd", subtitle: "Sum of MRR across active FinServ pipeline deals",
      definition: `Sum of deals.mrr on FinServ deals counting toward MRR at the period end (open, non-churned/lost/in-development deals plus clients counted active under the pre-May-2026 rule). ${asOf}` },
    { tile_key: "avg_revenue_per_client", tile_label: "Avg. Revenue / Client", value: avg, unit: "usd", subtitle: "period revenue ÷ active clients",
      definition: "Total Revenue (below) ÷ Total Clients.",
      ...(avg == null ? { no_data_reason: "revenue_snapshot_not_cached" } : {}) },
    { tile_key: "finserv_clients_signed", tile_label: "FinServ Clients Signed", value: newMrr.deals.length, unit: "count", subtitle: 'Entered "Active Client"',
      definition: "Distinct FinServ deals whose first stage_enter into Active Client (fs-closed-won / \"Active Client\") falls in the period (UTC dates), test deals excluded.",
      ...page(newMrr.deals, inc, off, lim) },
    { tile_key: "mrr_signed", tile_label: "MRR Signed", value: newMrr.total, unit: "usd", subtitle: 'MRR of deals entering "Active Client"',
      definition: "Sum of deals.mrr for the FinServ Clients Signed deals." },
    { tile_key: "net_revenue_retention", tile_label: "Net Revenue Retention", value: nrr.nrr == null ? null : Math.round(nrr.nrr * 10) / 10, unit: "percent",
      subtitle: `QBO FinServ · prior-period billed customers (${nrr.prior.start} → ${nrr.prior.end})`,
      definition: "QuickBooks invoices (5th Line Financial Services realm): revenue this period from customers billed in the immediately preceding window of equal length ÷ their revenue in that prior window. New customers are excluded.",
      ...(nrr.nrr == null ? { no_data_reason: "no_prior_period_revenue" } : {}),
      details: { comparison_window: nrr.prior, customer_count: nrr.customers.length, prior_total: nrr.priorTotal, current_total: nrr.currentTotal },
      ...page(nrr.customers, inc, off, lim) },
    { tile_key: "total_revenue", tile_label: "Total Revenue", value: revenue, unit: "usd", subtitle: "QBO P&L Total Income · 5th Line Financial Services, LLC",
      definition: "Accrual P&L Total Income from the cached QuickBooks snapshot whose period exactly matches the selected start/end dates. The connector only reads cached snapshots; it never triggers a QuickBooks sync.",
      ...(revenue == null ? { no_data_reason: "revenue_snapshot_not_cached: open the dashboard for this period once to cache it" } : { details: { fetched_at: pnlRes.data?.fetched_at ?? null } }) },
  ];
}

export default defineTool({
  name: "get_dashboard_tile_values",
  title: "Get Insights dashboard tile values",
  description:
    "Read-only. Returns the values shown on Insights dashboard tiles for one or more periods, using the same shared queries the dashboards use: sales-bd-page (Meetings w/ Existing Referral Sources, New Referral Sources Added, Deals & Dollars on the Board, Conversion Rate), sales-dashboard-v2 (Sales Calls, Deals on Board, Proposals Issued, Avg. New Deal on Board, FinServ KPI tiles, and every Sales Model row with forecast/actual/variance; untracked actuals return null with no_data_reason), finserv-financial-metrics (Total Clients, Total MRR, Avg. Revenue / Client, Clients Signed, MRR Signed, Net Revenue Retention, Total Revenue), consolidated-debt-pipeline = Debt Advisory Metrics SALES section (Deals on the Board, Proposals Issued, Debt Deals Signed / Dollars Signed, Terms Issued, Terms Signed, Deals Closed, Average Deal on the Board, Average Deal Signed, Average Revenue per Deal Signed, Average Deal Closed, Average Revenue per Deal Closed, Revenue per Deal Hour; Owner = All / Manager = All). Each tile includes a one-sentence definition and time-zone basis. Stage spellings are matched at read time; stored data is never changed. Set include_rows for paginated drill rows.",
  inputSchema: {
    dashboard_id: z.enum(["sales-bd-page", "sales-dashboard-v2", "finserv-financial-metrics", "consolidated-debt-pipeline"]),
    view: z.enum(["month", "quarter", "custom"]).default("month"),
    period: z.string().trim().max(10).optional().describe('"YYYY-MM" (month view) or "YYYY-QN" (quarter view).'),
    periods: z.array(z.string().trim().max(10)).max(60).optional().describe("Several periods in one call; overrides period."),
    from: z.string().trim().max(10).optional().describe("Custom view start YYYY-MM-DD."),
    to: z.string().trim().max(10).optional().describe("Custom view end YYYY-MM-DD."),
    include_rows: z.boolean().default(false),
    rows_limit: z.number().int().min(1).max(500).default(100),
    rows_offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dashboard_id, view, period, periods, from, to, include_rows, rows_limit, rows_offset }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    let resolved: ResolvedPeriod[];
    try {
      if (view === "custom") {
        if (!from || !to) return errorResult("custom view requires from and to (YYYY-MM-DD).");
        resolved = [resolveCustom(from, to)];
      } else {
        const list = periods?.length ? periods : period ? [period] : [];
        if (!list.length) return errorResult("Provide period or periods.");
        resolved = list.map(resolvePeriod);
        const wrong = resolved.find((r) => (view === "month") !== (r.months.length === 1 && !/Q/.test(r.period)));
        if (wrong) return errorResult(`Period ${wrong.period} does not match view "${view}".`);
      }
      const sb = supabaseForUser(ctx) as AnySupabase;
      if (dashboard_id === "consolidated-debt-pipeline") {
        const debtOut = await debtAdvisoryTiles(sb, resolved, include_rows, rows_offset, rows_limit);
        const payload = { dashboard_id, view, time_zone: "UTC", periods: debtOut };
        return textResult(payload, payload);
      }
      const companyId = await companyIdFor(sb, ctx);
      const out = [];
      for (const p of resolved) {
        const tiles = dashboard_id === "sales-dashboard-v2"
          ? await salesDashboardV2(sb, companyId, p, include_rows, rows_offset, rows_limit)
          : dashboard_id === "sales-bd-page"
            ? await salesBdPage(sb, ctx, companyId, p, include_rows, rows_offset, rows_limit)
            : await finservMetrics(sb, companyId, p, include_rows, rows_offset, rows_limit);
        out.push({ period: p.period, start: p.start, end: p.end, tiles });
      }
      const payload = {
        dashboard_id, view,
        time_zone: dashboard_id === "sales-bd-page" ? SALES_BD_TZ : "UTC",
        periods: out,
      };
      return textResult(payload, payload);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
