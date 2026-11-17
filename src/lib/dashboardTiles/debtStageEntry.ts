/**
 * Debt Advisory Metrics (consolidated-debt-pipeline) stage-entry calculation,
 * shared by `usePipelineStageMetrics` and the read-only MCP dashboard tool so
 * connector values always equal the tiles. Import-safe: no React, no browser
 * globals, relative imports only. Never writes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isExcludedDealName } from "../../utils/excludedDeals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySb = SupabaseClient<any, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StageRow = Record<string, any>;

export const DEBT_ACTIVE_PIPELINE_ID = "b78ad452-b489-4c89-8a91-789347c05f79";
export const DEBT_IN_DEVELOPMENT_PIPELINE_ID = "40b17dfb-9122-49e0-bf7c-5aa993d5d615";
export const DEBT_REALM_ID = "193514877331929";

/**
 * Stage-label normalization for deal_stage_history. `to_stage` holds mixed
 * slug/label text; `to_stage_id` is empty on live rows and overloaded in In
 * Development, so the text label is the only reliable identifier.
 * "Indication of Interest" is intentionally excluded.
 */
export const STAGE_LABEL_VARIANTS: Record<string, string[]> = {
  "funded-invoiced": ["funded-invoiced", "Funded/Invoiced", "Funded / Invoiced", "Closed & Funded"],
  "closed-won": ["closed-won", "Closed Won"],
  "proposal-issued": ["proposal-issued", "Proposal Issued"],
  "terms-issued": ["terms-issued", "Terms Issued"],
  "final-credit-items": ["final-credit-items", "Final Credit Items"],
  "in-due-diligence": ["in-due-diligence", "In Due Diligence"],
  "ndaneeds-list-sent": ["ndaneeds-list-sent", "NDA/Needs List Sent"],
  "submitted-to-lenders": ["submitted-to-lenders", "Submitted to Lenders"],
  "lenders-in-review": ["lenders-in-review", "Lenders in Review"],
  "pre-credit-needs": ["pre-credit-needs", "Pre-Credit Needs"],
  "proposal-in-development": ["proposal-in-development", "Proposal in Development"],
  "fs-active-client": ["fs-active-client", "Active Client"],
};

const STAGE_LABEL_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [slug, variants] of Object.entries(STAGE_LABEL_VARIANTS)) {
    for (const v of variants) map.set(v.toLowerCase(), slug);
  }
  return map;
})();

const CLOSED_STAGE_SLUGS = new Set(["funded-invoiced", "closed-won"]);
const CLOSED_STAGE_LABEL_FOR_SLUG: Record<string, string> = {
  "funded-invoiced": "Funded/Invoiced",
  "closed-won": "Closed Won",
};

/** Expand canonical slugs → every stored `to_stage` spelling (incl. UPPERCASE). */
export function expandStageLabels(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const slug of slugs) {
    out.add(slug);
    for (const v of STAGE_LABEL_VARIANTS[slug] ?? []) {
      out.add(v);
      out.add(v.toUpperCase());
    }
  }
  return Array.from(out);
}

export function normalizeStageSlug(toStage: string | null | undefined, _toStageId?: string | null): string | null {
  if (!toStage) return null;
  return STAGE_LABEL_LOOKUP.get(toStage.toLowerCase()) ?? null;
}

function isActivePipelineFundedOnlyMetric(slugs: string[], pipelineId?: string): boolean {
  return pipelineId === DEBT_ACTIVE_PIPELINE_ID && slugs.length === 1 && slugs[0] === "funded-invoiced";
}

export function expandMetricStageLabels(slugs: string[], pipelineId?: string): string[] {
  const out = new Set(expandStageLabels(slugs));
  if (isActivePipelineFundedOnlyMetric(slugs, pipelineId)) {
    for (const variant of expandStageLabels(["closed-won"])) out.add(variant);
  }
  return Array.from(out);
}

export function normalizeMetricStageSlug(
  toStage: string | null | undefined,
  toStageId: string | null | undefined,
  pipelineId: string | undefined,
  targetStages: string[],
): string | null {
  const normalized = normalizeStageSlug(toStage, toStageId);
  if (isActivePipelineFundedOnlyMetric(targetStages, pipelineId) && normalized === "closed-won") return "funded-invoiced";
  return normalized;
}

/** Synthetic stage-entry rows for closed deals lacking history (closing_date fallback). */
export async function fetchClosedDealsAsSyntheticRows(
  sb: AnySb,
  pipelineId: string | undefined,
  targetStages: string[],
  startIso: string,
  endIso: string,
): Promise<StageRow[]> {
  if (!pipelineId) return [];
  const closedTargets = targetStages.filter((s) => CLOSED_STAGE_SLUGS.has(s));
  if (closedTargets.length === 0) return [];
  const { data, error } = await sb
    .from("deals")
    .select("id, company, value, manager, stage, pipeline_id, status, mrr, closing_date")
    .eq("pipeline_id", pipelineId)
    .in("stage", closedTargets)
    .gte("closing_date", startIso.slice(0, 10))
    .lte("closing_date", endIso.slice(0, 10))
    .order("closing_date", { ascending: true });
  if (error) {
    console.warn("[stage-entry closed-fallback] query failed", error);
    return [];
  }
  return (data ?? []).map((d: StageRow) => ({
    deal_id: d.id,
    changed_at: `${d.closing_date}T12:00:00.000Z`,
    to_stage: CLOSED_STAGE_LABEL_FOR_SLUG[d.stage] ?? d.stage,
    to_stage_id: null,
    from_stage_id: null,
    deals: { company: d.company, value: d.value, manager: d.manager, stage: d.stage, pipeline_id: d.pipeline_id, status: d.status, mrr: d.mrr },
  }));
}

type ValueEvent = { ts: string; oldValue: number; newValue: number };

async function fetchValueUpdatedEvents(sb: AnySb, dealIds: string[], sinceIso: string): Promise<Map<string, ValueEvent[]>> {
  const map = new Map<string, ValueEvent[]>();
  if (dealIds.length === 0) return map;
  const { data, error } = await sb
    .from("activity_logs")
    .select("deal_id, created_at, metadata")
    .eq("activity_type", "value_updated")
    .in("deal_id", dealIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[stage-entry value-history] query failed", error);
    return map;
  }
  for (const row of (data ?? []) as StageRow[]) {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    const oldV = Number(m.oldValue);
    const newV = Number(m.newValue);
    if (!Number.isFinite(oldV) || !Number.isFinite(newV)) continue;
    const arr = map.get(row.deal_id as string) ?? [];
    arr.push({ ts: row.created_at as string, oldValue: oldV, newValue: newV });
    map.set(row.deal_id as string, arr);
  }
  return map;
}

/** Deal value as of `asOfIso` (later edits rolled back; 0 → X treated as initial entry). */
export function valueAsOf(currentValue: number, events: ValueEvent[] | undefined, asOfIso: string): number {
  if (!events || events.length === 0) return currentValue;
  let v = currentValue;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].ts > asOfIso) {
      if (!(Number(events[i].oldValue) === 0 && Number(events[i].newValue) > 0)) v = events[i].oldValue;
    }
  }
  return v;
}

/** Mutates each row's `deals.value` (in-memory only) to its value at `changed_at`. */
export async function applyHistoricalValuesToRows(sb: AnySb, rows: StageRow[]): Promise<void> {
  if (rows.length === 0) return;
  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id).filter(Boolean)));
  const earliest = rows.reduce<string>((acc, r) => (!acc || (r.changed_at && r.changed_at < acc) ? r.changed_at : acc), "");
  if (!earliest) return;
  const events = await fetchValueUpdatedEvents(sb, dealIds as string[], earliest);
  for (const row of rows) {
    const deal = row.deals as StageRow | null;
    if (!deal) continue;
    const current = Number(deal.value) || 0;
    const historical = valueAsOf(current, events.get(row.deal_id), row.changed_at);
    if (historical !== current) deal.value = historical;
  }
}

export interface StageEntryMetricOptions {
  excludeDealOwners?: string[];
  excludeChangedByUserIds?: string[];
  firstEverInWindow?: boolean;
  historyPipelineIds?: string[];
  exactStageLabels?: string[];
  calendarYearDedupe?: boolean;
}

export interface StageEntryMetricDeal {
  deal_id: string; company: string; value: number; manager: string | null;
  current_stage: string; entered_at: string; pipeline_id: string; mrr: number; to_stage: string | null;
}

/** Window the stage-entry query reads for a period (before in-memory filtering). */
export function stageEntryFetchWindow(startDate: string, endDate: string, options?: StageEntryMetricOptions) {
  return {
    start: options?.calendarYearDedupe ? `${startDate.slice(0, 4)}-01-01` : startDate,
    end: endDate,
  };
}

/**
 * Fetch stage_enter rows (+ closed fallback, + historical values) for the
 * metric. `paginate` reads past the 1,000-row page limit (MCP multi-period).
 */
export async function fetchStageEntryRows(
  sb: AnySb,
  targetStages: string[],
  window: { start: string; end: string },
  pipelineIds: string[] | undefined,
  options?: StageEntryMetricOptions & { paginate?: boolean },
): Promise<StageRow[]> {
  const primaryPipelineId = pipelineIds?.[0];
  const queryStages = options?.exactStageLabels ?? expandMetricStageLabels(targetStages, primaryPipelineId);
  const build = () => {
    let query = sb
      .from("deal_stage_history")
      .select(`deal_id, changed_at, to_stage, to_stage_id, from_stage_id, changed_by, pipeline_id,
        deals!inner ( company, value, manager, stage, pipeline_id, status, mrr, deal_owner )`)
      .eq("event_type", "stage_enter")
      .in("to_stage", queryStages);
    if (!options?.firstEverInWindow) {
      query = query.gte("changed_at", window.start).lte("changed_at", window.end + "T23:59:59.999Z");
    }
    if (pipelineIds && pipelineIds.length === 1) query = query.eq("pipeline_id", pipelineIds[0]);
    else if (pipelineIds && pipelineIds.length > 1) query = query.in("pipeline_id", pipelineIds);
    return query.order("changed_at", { ascending: true });
  };
  let rows: StageRow[] = [];
  if (options?.paginate) {
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await build().order("deal_id", { ascending: true }).range(from, from + size - 1);
      if (error) throw error;
      const page = (data ?? []) as StageRow[];
      rows.push(...page);
      if (page.length < size) break;
    }
  } else {
    const { data, error } = await build();
    if (error) throw error;
    rows = (data ?? []) as StageRow[];
  }
  const synthetic = await fetchClosedDealsAsSyntheticRows(
    sb, primaryPipelineId, targetStages, `${window.start}T00:00:00.000Z`, `${window.end}T23:59:59.999Z`,
  );
  const merged = [...rows, ...synthetic];
  await applyHistoricalValuesToRows(sb, merged);
  return merged;
}

/**
 * The tile calculation: first entry per deal, allowed history pipelines,
 * owner/author exclusions, first-ever-in-window, test-deal exclusion and
 * company-name collapse (earliest entry wins).
 * `rowWindow` restricts rows to the window the hook would have fetched, so a
 * wider fetch (MCP multi-period) yields identical results.
 */
export function computeStageEntryMetric(
  rows: StageRow[],
  targetStages: string[],
  period: { startDate: string; endDate: string },
  pipelineIds: string[] | undefined,
  options?: StageEntryMetricOptions,
  rowWindow?: { start: string; end: string },
) {
  const primaryPipelineId = pipelineIds?.[0];
  const firstEverInWindow = !!options?.firstEverInWindow;
  const calendarYearDedupe = !!options?.calendarYearDedupe;
  const windowStartMs = new Date(period.startDate + "T00:00:00.000Z").getTime();
  const windowEndMs = new Date(period.endDate + "T23:59:59.999Z").getTime();
  const rwStart = rowWindow && !firstEverInWindow ? `${rowWindow.start}T00:00:00.000Z` : null;
  const rwEnd = rowWindow && !firstEverInWindow ? `${rowWindow.end}T23:59:59.999Z` : null;
  const excludedOwners = new Set((options?.excludeDealOwners ?? []).map((s) => s.toLowerCase().trim()));
  const excludedChangedBy = new Set(options?.excludeChangedByUserIds ?? []);
  const historyPipelines = options?.historyPipelineIds ? new Set(options.historyPipelineIds) : null;

  const seen = new Map<string, StageEntryMetricDeal | null>();
  for (const row of rows) {
    if (rwStart && rwEnd) {
      const ts = String(row.changed_at ?? "");
      const tsMs = new Date(ts).getTime();
      if (!(tsMs >= new Date(rwStart).getTime() && tsMs <= new Date(rwEnd).getTime())) continue;
    }
    if (seen.has(row.deal_id)) continue;
    const deal = row.deals as StageRow | null;
    if (!deal) continue;
    if (historyPipelines && row.pipeline_id && !historyPipelines.has(String(row.pipeline_id))) continue;
    if (excludedOwners.size > 0) {
      const owner = String(deal.deal_owner ?? "").toLowerCase().trim();
      if (owner && excludedOwners.has(owner)) continue;
    }
    if (excludedChangedBy.size > 0) {
      const changedBy = String(row.changed_by ?? "");
      if (changedBy && excludedChangedBy.has(changedBy)) continue;
    }
    if (pipelineIds && !pipelineIds.includes(deal.pipeline_id)) continue;
    const stageSlug = normalizeMetricStageSlug(row.to_stage, row.to_stage_id, primaryPipelineId, targetStages);
    if (!stageSlug || !targetStages.includes(stageSlug)) continue;
    if (firstEverInWindow) {
      const enteredMs = new Date(row.changed_at).getTime();
      if (enteredMs < windowStartMs || enteredMs > windowEndMs) {
        seen.set(row.deal_id, null);
        continue;
      }
    }
    seen.set(row.deal_id, {
      deal_id: row.deal_id,
      company: deal.company ?? "—",
      value: Number(deal.value) || 0,
      manager: deal.manager ?? null,
      current_stage: deal.stage,
      entered_at: row.changed_at,
      pipeline_id: deal.pipeline_id,
      mrr: Number(deal.mrr) || 0,
      to_stage: row.to_stage ?? null,
    });
  }

  const rawDeals = Array.from(seen.values())
    .filter((d): d is StageEntryMetricDeal => !!d)
    .filter((d) => !isExcludedDealName(d.company));
  const byName = new Map<string, StageEntryMetricDeal>();
  for (const d of rawDeals) {
    const name = (d.company ?? "").toLowerCase().trim();
    const key = calendarYearDedupe && name ? `${String(d.entered_at).slice(0, 4)}|${name}` : name;
    if (!key) { byName.set(d.deal_id, d); continue; }
    const existing = byName.get(key);
    if (!existing || new Date(d.entered_at).getTime() < new Date(existing.entered_at).getTime()) byName.set(key, d);
  }
  let deals = Array.from(byName.values());
  if (calendarYearDedupe) {
    deals = deals.filter((d) => {
      const t = new Date(d.entered_at).getTime();
      return t >= windowStartMs && t <= windowEndMs;
    });
  }
  return {
    count: deals.length,
    dollarVolume: deals.reduce((s, d) => s + d.value, 0),
    mrr: deals.reduce((s, d) => s + (d.mrr ?? 0), 0),
    deals,
  };
}

/** Sum of QuickBooks invoice totals for the realm in [start, end] (Debt revenue for per-deal averages). */
export async function fetchInvoiceRevenueTotal(sb: AnySb, realmId: string, start: string, end: string, paginate = false): Promise<number> {
  const build = () => sb.from("quickbooks_invoices").select("total_amt").eq("realm_id", realmId).gte("txn_date", start).lte("txn_date", end);
  const rows: StageRow[] = [];
  if (paginate) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().order("id", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      rows.push(...((data ?? []) as StageRow[]));
      if ((data ?? []).length < 1000) break;
    }
  } else {
    const { data, error } = await build();
    if (error) throw error;
    rows.push(...((data ?? []) as StageRow[]));
  }
  return rows.reduce((sum, row) => sum + (Number(row.total_amt) || 0), 0);
}

/** Hours from weekly_time_entries (week_start_date in range) on non-test deals in the given pipelines. */
export async function fetchDealHoursTotal(sb: AnySb, pipelineIds: string[], start: string, end: string, paginate = false): Promise<number> {
  const build = () => sb.from("weekly_time_entries").select("hours, deal_id, week_start_date").gte("week_start_date", start).lte("week_start_date", end);
  const rows: StageRow[] = [];
  if (paginate) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().order("id", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      rows.push(...((data ?? []) as StageRow[]));
      if ((data ?? []).length < 1000) break;
    }
  } else {
    const { data, error } = await build();
    if (error) throw error;
    rows.push(...((data ?? []) as StageRow[]));
  }
  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[]));
  if (dealIds.length === 0) return 0;
  const eligible = new Set<string>();
  for (let i = 0; i < dealIds.length; i += 200) {
    const { data: deals, error } = await sb.from("deals").select("id, pipeline_id, company").in("id", dealIds.slice(i, i + 200));
    if (error) throw error;
    for (const d of (deals ?? []) as StageRow[]) {
      if (d.pipeline_id && pipelineIds.includes(d.pipeline_id) && !isExcludedDealName(d.company ?? "")) eligible.add(d.id);
    }
  }
  return rows.reduce((sum, r) => (r.deal_id && eligible.has(r.deal_id) ? sum + (Number(r.hours) || 0) : sum), 0);
}

/** Rolling N-month window ending at `anchorEnd` (YYYY-MM-DD), starting on the 1st. */
export function rollingMonthsWindow(anchorEnd: string, monthCount: number) {
  const [y, m] = anchorEnd.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1 - (monthCount - 1), 1));
  return { startDate: `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-01`, endDate: anchorEnd };
}

/** Rolling anchor: last day of the period's end month, capped at the current month's end. */
export function rollingAnchor(periodEnd: string, now = new Date()) {
  const nowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const [y, m, d] = periodEnd.split("-").map(Number);
  const pe = new Date(Date.UTC(y, m - 1, d));
  const a = pe < nowEnd ? pe : nowEnd;
  const last = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0)).getUTCDate();
  return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Invoice rows for a wide window, so several rolling windows can be summed from one read. */
export async function fetchInvoiceRows(sb: AnySb, realmId: string, start: string, end: string): Promise<Array<{ txn_date: string; total_amt: number }>> {
  const out: Array<{ txn_date: string; total_amt: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("quickbooks_invoices").select("id, txn_date, total_amt").eq("realm_id", realmId)
      .gte("txn_date", start).lte("txn_date", end).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as StageRow[]) out.push({ txn_date: String(r.txn_date), total_amt: Number(r.total_amt) || 0 });
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Eligible deal-hour rows (non-test deals in the pipelines) for a wide window. */
export async function fetchEligibleHourRows(sb: AnySb, pipelineIds: string[], start: string, end: string): Promise<Array<{ week_start_date: string; hours: number }>> {
  const rows: StageRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("weekly_time_entries").select("id, hours, deal_id, week_start_date")
      .gte("week_start_date", start).lte("week_start_date", end).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as StageRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[]));
  const eligible = new Set<string>();
  for (let i = 0; i < dealIds.length; i += 200) {
    const { data: deals, error } = await sb.from("deals").select("id, pipeline_id, company").in("id", dealIds.slice(i, i + 200));
    if (error) throw error;
    for (const d of (deals ?? []) as StageRow[]) {
      if (d.pipeline_id && pipelineIds.includes(d.pipeline_id) && !isExcludedDealName(d.company ?? "")) eligible.add(d.id);
    }
  }
  return rows.filter((r) => r.deal_id && eligible.has(r.deal_id)).map((r) => ({ week_start_date: String(r.week_start_date), hours: Number(r.hours) || 0 }));
}

export function sumInWindow<T>(rows: T[], dateOf: (r: T) => string, amountOf: (r: T) => number, start: string, end: string) {
  return rows.reduce((s, r) => { const d = dateOf(r); return d >= start && d <= end ? s + amountOf(r) : s; }, 0);
}
