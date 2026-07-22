import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * Stage-label normalization for deal_stage_history queries.
 *
 * Live transitions written by the `record_deal_stage_change` trigger populate
 * `to_stage` with the raw `deals.stage` text (which is sometimes a display
 * label like "Funded / Invoiced" and sometimes a slug like "closed-won") and
 * leave `to_stage_id` empty. Historical imports also vary by source.
 * Filtering on `to_stage_id` therefore drops virtually all live events.
 *
 * We resolve by `to_stage` text against the canonical variant list below and
 * map to a stable internal slug. The list intentionally EXCLUDES
 * "Indication of Interest" — that label is the In Development pipeline's
 * overloaded use of `to_stage_id='closed-won'` and must never be counted as a
 * real Closed Won event (see mem://technical/pipeline-stage-id-overloading).
 */
const STAGE_LABEL_VARIANTS: Record<string, string[]> = {
  'funded-invoiced': ['funded-invoiced', 'Funded/Invoiced', 'Funded / Invoiced', 'Closed & Funded'],
  'closed-won': ['closed-won', 'Closed Won'],
  // Active Pipeline canonical stages — `deal_stage_history.to_stage` is
  // written in mixed slug/label forms across historical and current rows
  // (slug, Title Case, and UPPERCASE all appear in the historical import).
  // Matching in `normalizeStageSlug` is case-insensitive, but the SQL `.in()`
  // filter is exact-match — so `expandStageLabels` must emit every observed
  // casing. `expandStageLabels` handles the casing expansion below.
  'proposal-issued': ['proposal-issued', 'Proposal Issued'],
  'terms-issued': ['terms-issued', 'Terms Issued'],
  'final-credit-items': ['final-credit-items', 'Final Credit Items'],
  'in-due-diligence': ['in-due-diligence', 'In Due Diligence'],
  'ndaneeds-list-sent': ['ndaneeds-list-sent', 'NDA/Needs List Sent'],
  'submitted-to-lenders': ['submitted-to-lenders', 'Submitted to Lenders'],
  'lenders-in-review': ['lenders-in-review', 'Lenders in Review'],
  'pre-credit-needs': ['pre-credit-needs', 'Pre-Credit Needs'],
  'proposal-in-development': ['proposal-in-development', 'Proposal in Development'],
  'fs-active-client': ['fs-active-client', 'Active Client'],
};

// Build a case-insensitive reverse-lookup once. Keys are lowercase.
const STAGE_LABEL_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [slug, variants] of Object.entries(STAGE_LABEL_VARIANTS)) {
    for (const v of variants) map.set(v.toLowerCase(), slug);
  }
  return map;
})();

const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

/**
 * Closed-stage slugs that represent a funded/closed deal in the Active
 * Pipeline. When any of these are targeted, we augment the stage-history
 * query with a fallback pulled from `deals.closing_date` — many historical
 * closed deals were imported without a matching `stage_enter` history row
 * (or with one written under the wrong pipeline_id), so relying on
 * deal_stage_history alone under-reports Dollars Funded / Deals Closed.
 */
const CLOSED_STAGE_SLUGS = new Set(['funded-invoiced', 'closed-won']);
const CLOSED_STAGE_LABEL_FOR_SLUG: Record<string, string> = {
  'funded-invoiced': 'Funded/Invoiced',
  'closed-won': 'Closed Won',
};

/**
 * Fetch deals in `pipelineId` whose current stage is a closed slug in
 * `targetStages` and whose `closing_date` falls between `startIso` and
 * `endIso`. Returns synthetic rows shaped like `deal_stage_history` rows so
 * they can be merged into the existing aggregation pipeline. The real
 * stage-history rows always win the per-deal dedupe (append synthetic rows
 * AFTER real ones at the call site).
 */
async function fetchClosedDealsAsSyntheticRows(
  pipelineId: string | undefined,
  targetStages: string[],
  startIso: string,
  endIso: string,
): Promise<Array<Record<string, any>>> {
  if (!pipelineId) return [];
  const closedTargets = targetStages.filter((s) => CLOSED_STAGE_SLUGS.has(s));
  if (closedTargets.length === 0) return [];

  const startDate = startIso.slice(0, 10);
  const endDate = endIso.slice(0, 10);

  const { data, error } = await supabase
    .from('deals')
    .select('id, company, value, manager, stage, pipeline_id, status, mrr, closing_date')
    .eq('pipeline_id', pipelineId)
    .in('stage', closedTargets)
    .gte('closing_date', startDate)
    .lte('closing_date', endDate)
    .order('closing_date', { ascending: true });

  if (error) {
    console.warn('[stage-entry closed-fallback] query failed', error);
    return [];
  }

  return (data ?? []).map((d: any) => ({
    deal_id: d.id,
    // Anchor at midday UTC so bucket boundaries (00:00Z) treat the row as
    // belonging to the correct calendar day.
    changed_at: `${d.closing_date}T12:00:00.000Z`,
    to_stage: CLOSED_STAGE_LABEL_FOR_SLUG[d.stage] ?? d.stage,
    to_stage_id: null,
    from_stage_id: null,
    deals: {
      company: d.company,
      value: d.value,
      manager: d.manager,
      stage: d.stage,
      pipeline_id: d.pipeline_id,
      status: d.status,
      mrr: d.mrr,
    },
  }));
}

/**
 * Fetch `value_updated` activity_log events for the given deals so we can
 * reconstruct each deal's `value` AS OF an earlier stage-entry timestamp.
 * Users often revise the deal value after it advances a stage (e.g. Censys
 * entered Final Credit Items at $10MM, then was later dropped to $3.8MM) —
 * the metric should reflect the value at time of stage entry, not the
 * latest edit.
 */
async function fetchValueUpdatedEvents(
  dealIds: string[],
  sinceIso: string,
): Promise<Map<string, Array<{ ts: string; oldValue: number; newValue: number }>>> {
  const map = new Map<string, Array<{ ts: string; oldValue: number; newValue: number }>>();
  if (dealIds.length === 0) return map;

  const { data, error } = await supabase
    .from('activity_logs')
    .select('deal_id, created_at, metadata')
    .eq('activity_type', 'value_updated')
    .in('deal_id', dealIds)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[stage-entry value-history] query failed', error);
    return map;
  }

  for (const row of data ?? []) {
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

/**
 * Given a deal's current value and its ordered value_updated events, return
 * the value it had at `asOfIso`. Any event AFTER asOfIso is rolled back
 * (walking latest → earliest) so the returned number matches what was
 * shown when the stage-entry event was recorded.
 */
function valueAsOf(
  currentValue: number,
  events: Array<{ ts: string; oldValue: number; newValue: number }> | undefined,
  asOfIso: string,
): number {
  if (!events || events.length === 0) return currentValue;
  let v = currentValue;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].ts > asOfIso) {
      // Treat "0 → X" events as initial data entry, not a real drop from
      // zero. Rolling back would produce a misleading $0 for periods
      // BEFORE the value was first recorded (e.g. OpConnect entered "In
      // Due Diligence" in 2025 while the system still had value=0; the
      // real amount ($10MM) was backfilled in Feb 2026 as 0 → 10MM).
      // Skip the rollback so the earliest positive value wins.
      if (!(Number(events[i].oldValue) === 0 && Number(events[i].newValue) > 0)) {
        v = events[i].oldValue;
      }
    }
  }
  return v;
}

/**
 * Mutate each row's inner `deals.value` in place so that it reflects the
 * deal's value at the row's `changed_at` timestamp. Downstream aggregators
 * read `deal.value` directly, so this is the smallest safe change.
 */
async function applyHistoricalValuesToRows(
  rows: Array<Record<string, any>>,
): Promise<void> {
  if (rows.length === 0) return;
  const dealIds = Array.from(new Set(rows.map((r) => r.deal_id).filter(Boolean)));
  // Only need events that happened after the earliest entry we're looking at.
  const earliest = rows.reduce<string>(
    (acc, r) => (!acc || (r.changed_at && r.changed_at < acc) ? r.changed_at : acc),
    '',
  );
  if (!earliest) return;
  const events = await fetchValueUpdatedEvents(dealIds, earliest);
  for (const row of rows) {
    const deal = row.deals as Record<string, any> | null;
    if (!deal) continue;
    const current = Number(deal.value) || 0;
    const historical = valueAsOf(current, events.get(row.deal_id), row.changed_at);
    if (historical !== current) {
      deal.value = historical;
    }
  }
}

function isActivePipelineFundedOnlyMetric(slugs: string[], pipelineId?: string): boolean {
  return pipelineId === ACTIVE_PIPELINE_ID && slugs.length === 1 && slugs[0] === 'funded-invoiced';
}

export function expandMetricStageLabels(slugs: string[], pipelineId?: string): string[] {
  const out = new Set(expandStageLabels(slugs));

  if (isActivePipelineFundedOnlyMetric(slugs, pipelineId)) {
    for (const variant of expandStageLabels(['closed-won'])) out.add(variant);
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

  if (
    isActivePipelineFundedOnlyMetric(targetStages, pipelineId)
    && normalized === 'closed-won'
  ) {
    return 'funded-invoiced';
  }

  return normalized;
}

/** Expand canonical slugs → full list of `to_stage` text values to filter on. */
export function expandStageLabels(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const slug of slugs) {
    out.add(slug);
    for (const v of STAGE_LABEL_VARIANTS[slug] ?? []) {
      out.add(v);
      // Historical imports store labels in UPPERCASE ("FINAL CREDIT ITEMS",
      // "IN DUE DILIGENCE", etc.). Emit both the original casing and an
      // UPPERCASE variant so the exact-match `.in()` filter catches every row.
      out.add(v.toUpperCase());
    }
  }
  return Array.from(out);
}

/**
 * Normalize an observed `to_stage` text value back to a canonical slug.
 * The `to_stage_id` column is intentionally ignored — it's empty on live rows
 * AND is overloaded in the In Development pipeline (where 'closed-won' means
 * "Indication of Interest", NOT "Closed Won"). The text label is the only
 * unambiguous identifier.
 */
export function normalizeStageSlug(toStage: string | null | undefined, _toStageId?: string | null): string | null {
  if (!toStage) return null;
  return STAGE_LABEL_LOOKUP.get(toStage.toLowerCase()) ?? null;
}

export interface StageEntryDeal {
  deal_id: string;
  company: string;
  value: number;
  manager: string | null;
  current_stage: string;
  entered_at: string;
  pipeline_id: string;
  /** Stage moved FROM (from activity_logs.metadata->>from). May be null if unknown. */
  from_stage?: string | null;
  /** Stage moved TO (from activity_logs.metadata->>to). Equals the target stage for signed-deal series. */
  to_stage?: string | null;
  /** Recurring revenue contribution for this deal (FinServ widgets). */
  mrr?: number;
  /** Optional fee breakdown (Total Revenue Opportunity drilldown). */
  retainer_fee?: number;
  milestone_fee?: number;
  closing_fee?: number;
  /** Projected close date for the deal (drives Closing/Success fee timing). */
  projected_close_date?: string | null;
  /** Due date of the "Qualified Term Sheet" milestone (drives Milestone fee timing). */
  qts_due_date?: string | null;
}

interface StageMetricResult {
  count: number;
  dollarVolume: number;
  deals: StageEntryDeal[];
  isLoading: boolean;
  /** Sum of `mrr` across the deals in this metric (FinServ widgets). */
  mrr?: number;
}

export interface AverageMetricResult {
  value: number | null;
  numerator: number;
  denominator: number;
  deals: StageEntryDeal[];
  isLoading: boolean;
  /** Prior-period value (same-length window, immediately preceding). */
  previousValue?: number | null;
}

interface PeriodBucketDef {
  key: string;
  label: string;
  start: string;
  end: string;
}

export interface StageTrendBucket extends PeriodBucketDef {
  count: number;
  dollarVolume: number;
  deals: StageEntryDeal[];
}

export interface StageTrendSeriesResult {
  monthly: StageTrendBucket[];
  quarterly: StageTrendBucket[];
  /**
   * Trailing-twelve-month rollups. Same X-axis buckets as `monthly`/`quarterly`,
   * but each bucket's `count`/`dollarVolume`/`deals` are the sum of all
   * stage-entry events in the 12 months ending on that bucket's `end` date.
   */
  monthlyTtm: StageTrendBucket[];
  quarterlyTtm: StageTrendBucket[];
  isLoading: boolean;
}

export interface StageSplitTrendBucket extends PeriodBucketDef {
  fundedInvoicedCount: number;
  closedWonCount: number;
  total: number;
  deals: StageEntryDeal[];
}

export interface StageSplitTrendSeriesResult {
  monthly: StageSplitTrendBucket[];
  quarterly: StageSplitTrendBucket[];
  monthlyTtm: StageSplitTrendBucket[];
  quarterlyTtm: StageSplitTrendBucket[];
  total: number;
  isLoading: boolean;
}

interface RevenuePeriodTotalResult {
  total: number;
  isLoading: boolean;
}

function buildRollingMonthsPeriod(anchorEndDate: string, monthCount: number): QuarterOption {
  const [year, month, day] = anchorEndDate.split('-').map(Number);
  const end = new Date(year, month - 1, day);
  const start = new Date(end.getFullYear(), end.getMonth() - (monthCount - 1), 1);

  const months: QuarterOption['months'] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const monthEnd = new Date(y, m + 1, 0);
    months.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${monthEnd.getDate()}`,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return {
    label: `${fmt(start)} – ${fmt(end)}`,
    value: `rolling-${monthCount}-${months[0]?.start ?? ''}_${anchorEndDate}`,
    startDate: months[0]?.start ?? '',
    endDate: anchorEndDate,
    months,
  };
}

/**
 * Returns a QuarterOption spanning the same duration as `period`, ending the
 * day immediately before `period.startDate`. Used to compute prior-period
 * comparison values for KPI deltas.
 */
function buildPriorPeriodFor(period: QuarterOption): QuarterOption {
  if (!period.startDate || !period.endDate) return period;
  const start = new Date(period.startDate + 'T00:00:00');
  const end = new Date(period.endDate + 'T00:00:00');
  const lengthMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const priorStart = new Date(priorEnd.getTime() - lengthMs);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startStr = iso(priorStart);
  const endStr = iso(priorEnd);
  return {
    label: `prior of ${period.value}`,
    value: `prior-${startStr}_${endStr}`,
    startDate: startStr,
    endDate: endStr,
    months: [],
  };
}

function buildRollingMonthBuckets(anchorEndDate: string, monthCount: number): PeriodBucketDef[] {
  const period = buildRollingMonthsPeriod(anchorEndDate, monthCount);
  return period.months.map((month) => ({
    ...month,
    label: `${month.label} ${month.key.slice(2, 4)}`,
  }));
}

function buildRollingQuarterBuckets(anchorEndDate: string, quarterCount: number): PeriodBucketDef[] {
  const [year, month] = anchorEndDate.split('-').map(Number);
  const anchor = new Date(year, month - 1, 1);
  const anchorQuarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
  const firstQuarter = new Date(
    anchor.getFullYear(),
    anchorQuarterStartMonth - (quarterCount - 1) * 3,
    1,
  );

  const buckets: PeriodBucketDef[] = [];
  const cursor = new Date(firstQuarter);

  while (cursor <= anchor) {
    const quarterYear = cursor.getFullYear();
    const quarterStartMonth = Math.floor(cursor.getMonth() / 3) * 3;
    const quarterNumber = Math.floor(quarterStartMonth / 3) + 1;
    const quarterEnd = new Date(quarterYear, quarterStartMonth + 3, 0);

    buckets.push({
      key: `${quarterYear}-Q${quarterNumber}`,
      label: `Q${quarterNumber} ${String(quarterYear).slice(2, 4)}`,
      start: `${quarterYear}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`,
      end: `${quarterYear}-${String(quarterStartMonth + 3).padStart(2, '0')}-${quarterEnd.getDate()}`,
    });

    cursor.setMonth(cursor.getMonth() + 3);
  }

  return buckets;
}

function getQuarterKey(timestamp: string): string {
  const year = timestamp.slice(0, 4);
  const month = Number(timestamp.slice(5, 7));
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

/** Shift an ISO date (YYYY-MM-DD) by N months, preserving day-of-month. */
function shiftIsoDateMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * TTM aggregator: for each output bucket, sum all stage-entry events whose
 * `changed_at` falls in the 12 months ending at bucket.end (inclusive).
 * A single deal is only counted once per bucket, so TTM counts reflect
 * unique deals (matching the semantics of the non-TTM aggregator).
 */
function aggregateStageEntryTrendBucketsTtm(
  rows: Array<Record<string, any>>,
  bucketDefs: PeriodBucketDef[],
  pipelineId: string,
  targetStages: string[],
): StageTrendBucket[] {
  const buckets: StageTrendBucket[] = bucketDefs.map((bucket) => ({
    ...bucket,
    count: 0,
    dollarVolume: 0,
    deals: [],
  }));
  if (bucketDefs.length === 0) return buckets;

  const windows = buckets.map((bucket) => ({
    bucket,
    startIso: `${shiftIsoDateMonths(bucket.end, -12)}T00:00:00.000Z`,
    endIso: `${bucket.end}T23:59:59.999Z`,
    seen: new Set<string>(),
  }));

  for (const row of rows ?? []) {
    const ts: string = row.changed_at;
    if (!ts) continue;

    const stageSlug = normalizeStageSlug(row.to_stage, row.to_stage_id);
    if (!stageSlug || !targetStages.includes(stageSlug)) continue;

    const deal = row.deals as Record<string, any> | null;
    if (!deal || deal.pipeline_id !== pipelineId || isExcludedDealName(deal.company)) continue;

    for (const w of windows) {
      if (ts < w.startIso || ts > w.endIso) continue;
      if (w.seen.has(row.deal_id)) continue;
      w.seen.add(row.deal_id);
      const entry: StageEntryDeal = {
        deal_id: row.deal_id,
        company: deal.company ?? '—',
        value: Number(deal.value) || 0,
        manager: deal.manager ?? null,
        current_stage: deal.stage ?? '',
        entered_at: ts,
        pipeline_id: deal.pipeline_id ?? '',
        from_stage: typeof row.from_stage_id === 'string' ? row.from_stage_id : null,
        to_stage: stageSlug,
      };
      w.bucket.count += 1;
      w.bucket.dollarVolume += entry.value;
      w.bucket.deals.push(entry);
    }
  }

  return buckets;
}

function aggregateStageEntrySplitTrendBucketsTtm(
  rows: Array<Record<string, any>>,
  bucketDefs: PeriodBucketDef[],
  pipelineId: string,
): StageSplitTrendBucket[] {
  const buckets: StageSplitTrendBucket[] = bucketDefs.map((bucket) => ({
    ...bucket,
    fundedInvoicedCount: 0,
    closedWonCount: 0,
    total: 0,
    deals: [],
  }));
  if (bucketDefs.length === 0) return buckets;

  const windows = buckets.map((bucket) => ({
    bucket,
    startIso: `${shiftIsoDateMonths(bucket.end, -12)}T00:00:00.000Z`,
    endIso: `${bucket.end}T23:59:59.999Z`,
    seen: new Set<string>(),
  }));

  for (const row of rows ?? []) {
    const ts: string = row.changed_at;
    if (!ts) continue;
    const stageId = normalizeStageSlug(row.to_stage, row.to_stage_id);
    if (stageId !== 'funded-invoiced' && stageId !== 'closed-won') continue;

    const deal = row.deals as Record<string, any> | null;
    if (!deal || deal.pipeline_id !== pipelineId || isExcludedDealName(deal.company)) continue;

    for (const w of windows) {
      if (ts < w.startIso || ts > w.endIso) continue;
      const dedupeKey = `${row.deal_id}|${stageId}`;
      if (w.seen.has(dedupeKey)) continue;
      w.seen.add(dedupeKey);

      const entry: StageEntryDeal = {
        deal_id: row.deal_id,
        company: deal.company ?? '—',
        value: Number(deal.value) || 0,
        manager: deal.manager ?? null,
        current_stage: deal.stage ?? '',
        entered_at: ts,
        pipeline_id: deal.pipeline_id ?? '',
        from_stage: typeof row.from_stage_id === 'string' ? row.from_stage_id : null,
        to_stage: stageId ?? '',
      };
      if (stageId === 'funded-invoiced') w.bucket.fundedInvoicedCount += 1;
      else w.bucket.closedWonCount += 1;
      w.bucket.total += 1;
      w.bucket.deals.push(entry);
    }
  }

  return buckets;
}

function aggregateStageEntryTrendBuckets(
  rows: Array<Record<string, any>>,
  bucketDefs: PeriodBucketDef[],
  grain: 'monthly' | 'quarterly',
  pipelineId: string,
  targetStages: string[],
): StageTrendBucket[] {
  const buckets: StageTrendBucket[] = bucketDefs.map((bucket) => ({
    ...bucket,
    count: 0,
    dollarVolume: 0,
    deals: [],
  }));

  if (bucketDefs.length === 0) return buckets;

  const windowStart = `${bucketDefs[0].start}T00:00:00.000Z`;
  const windowEnd = `${bucketDefs[bucketDefs.length - 1].end}T23:59:59.999Z`;
  const seen = new Set<string>();
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const row of rows ?? []) {
    const ts: string = row.changed_at;
    if (!ts || ts < windowStart || ts > windowEnd) continue;
    if (seen.has(row.deal_id)) continue;

    const deal = row.deals as Record<string, any> | null;
    if (!deal || deal.pipeline_id !== pipelineId || isExcludedDealName(deal.company)) continue;

    const stageSlug = normalizeStageSlug(row.to_stage, row.to_stage_id);
    if (!stageSlug || !targetStages.includes(stageSlug)) continue;

    const bucketKey = grain === 'monthly' ? ts.slice(0, 7) : getQuarterKey(ts);
    const bucket = bucketMap.get(bucketKey);
    if (!bucket) continue;

    seen.add(row.deal_id);

    const entry: StageEntryDeal = {
      deal_id: row.deal_id,
      company: deal.company ?? '—',
      value: Number(deal.value) || 0,
      manager: deal.manager ?? null,
      current_stage: deal.stage ?? '',
      entered_at: ts,
      pipeline_id: deal.pipeline_id ?? '',
      from_stage: typeof row.from_stage_id === 'string' ? row.from_stage_id : null,
      to_stage: stageSlug,
    };

    bucket.count += 1;
    bucket.dollarVolume += entry.value;
    bucket.deals.push(entry);
  }

  return buckets;
}

function useStageEntryTrendSeries(
  targetStage: string | string[],
  anchorEndDate: string,
  pipelineId: string,
): StageTrendSeriesResult {
  const { user } = useAuth();
  const targetStages = Array.isArray(targetStage) ? targetStage : [targetStage];

  const monthlyBuckets = useMemo(
    () => buildRollingMonthBuckets(anchorEndDate, 6),
    [anchorEndDate],
  );
  const quarterlyBuckets = useMemo(
    () => buildRollingQuarterBuckets(anchorEndDate, 4),
    [anchorEndDate],
  );

  const rawQueryStart = quarterlyBuckets[0]?.start ?? monthlyBuckets[0]?.start ?? '';
  const queryEnd = quarterlyBuckets[quarterlyBuckets.length - 1]?.end ?? monthlyBuckets[monthlyBuckets.length - 1]?.end ?? '';
  // Extend the fetch window 12 months earlier so TTM rollups anchored at the
  // first bucket's `end` have a full trailing-12-month lookback of history.
  const queryStart = rawQueryStart ? shiftIsoDateMonths(rawQueryStart, -12) : '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stage-entry-trend-series-dsh', targetStages.join(','), pipelineId, queryStart, queryEnd],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deal_stage_history')
        .select(`
          deal_id,
          changed_at,
          to_stage,
          to_stage_id,
          from_stage_id,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id
          )
        `)
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', pipelineId)
        .in('to_stage', expandStageLabels(targetStages))
        .gte('changed_at', queryStart)
        .lte('changed_at', `${queryEnd}T23:59:59.999Z`)
        .order('changed_at', { ascending: true });

      if (error) throw error;
      if ((rows?.length ?? 0) === 0) {
        console.warn('[stage-entry-trend] 0 rows', { targetStages, pipelineId, queryStart, queryEnd });
      }
      // Fallback: synthesize rows for closed deals with a `closing_date`
      // but no matching stage_enter history event on this pipeline. Real
      // history rows are returned first and win the per-deal dedupe.
      const synthetic = await fetchClosedDealsAsSyntheticRows(
        pipelineId,
        targetStages,
        `${queryStart}T00:00:00.000Z`,
        `${queryEnd}T23:59:59.999Z`,
      );
      const merged = [...(rows ?? []), ...synthetic];
      await applyHistoricalValuesToRows(merged);
      return merged;
    },
    enabled: !!user && !!queryStart && !!queryEnd,
    staleTime: 30_000,
  });

  return useMemo(() => ({
    monthly: aggregateStageEntryTrendBuckets(data ?? [], monthlyBuckets, 'monthly', pipelineId, targetStages),
    quarterly: aggregateStageEntryTrendBuckets(data ?? [], quarterlyBuckets, 'quarterly', pipelineId, targetStages),
    monthlyTtm: aggregateStageEntryTrendBucketsTtm(data ?? [], monthlyBuckets, pipelineId, targetStages),
    quarterlyTtm: aggregateStageEntryTrendBucketsTtm(data ?? [], quarterlyBuckets, pipelineId, targetStages),
    isLoading: isLoading || isFetching,
  }), [data, isLoading, isFetching, monthlyBuckets, pipelineId, quarterlyBuckets, targetStages.join(',')]);
}

function aggregateStageEntrySplitTrendBuckets(
  rows: Array<Record<string, any>>,
  bucketDefs: PeriodBucketDef[],
  grain: 'monthly' | 'quarterly',
  pipelineId: string,
): StageSplitTrendBucket[] {
  const buckets: StageSplitTrendBucket[] = bucketDefs.map((bucket) => ({
    ...bucket,
    fundedInvoicedCount: 0,
    closedWonCount: 0,
    total: 0,
    deals: [],
  }));

  if (bucketDefs.length === 0) return buckets;

  const windowStart = `${bucketDefs[0].start}T00:00:00.000Z`;
  const windowEnd = `${bucketDefs[bucketDefs.length - 1].end}T23:59:59.999Z`;
  // Dedupe per (deal, to_stage) — a deal can legitimately contribute one
  // event to each stacked series, but not multiple times to the same series.
  const seen = new Set<string>();
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const row of rows ?? []) {
    const ts: string = row.changed_at;
    if (!ts || ts < windowStart || ts > windowEnd) continue;
    const stageId = normalizeStageSlug(row.to_stage, row.to_stage_id);
    if (stageId !== 'funded-invoiced' && stageId !== 'closed-won') continue;

    const dedupeKey = `${row.deal_id}|${stageId}`;
    if (seen.has(dedupeKey)) continue;

    const deal = row.deals as Record<string, any> | null;
    if (!deal || deal.pipeline_id !== pipelineId || isExcludedDealName(deal.company)) continue;

    const bucketKey = grain === 'monthly' ? ts.slice(0, 7) : getQuarterKey(ts);
    const bucket = bucketMap.get(bucketKey);
    if (!bucket) continue;

    seen.add(dedupeKey);

    const entry: StageEntryDeal = {
      deal_id: row.deal_id,
      company: deal.company ?? '—',
      value: Number(deal.value) || 0,
      manager: deal.manager ?? null,
      current_stage: deal.stage ?? '',
      entered_at: ts,
      pipeline_id: deal.pipeline_id ?? '',
      from_stage: typeof row.from_stage_id === 'string' ? row.from_stage_id : null,
      to_stage: stageId ?? '',
    };

    if (stageId === 'funded-invoiced') bucket.fundedInvoicedCount += 1;
    else bucket.closedWonCount += 1;
    bucket.total += 1;
    bucket.deals.push(entry);
  }

  return buckets;
}

function useStageEntrySplitTrendSeries(
  anchorEndDate: string,
  pipelineId: string,
): StageSplitTrendSeriesResult {
  const { user } = useAuth();
  const targetStages = ['funded-invoiced', 'closed-won'];

  const monthlyBuckets = useMemo(
    () => buildRollingMonthBuckets(anchorEndDate, 6),
    [anchorEndDate],
  );
  const quarterlyBuckets = useMemo(
    () => buildRollingQuarterBuckets(anchorEndDate, 4),
    [anchorEndDate],
  );

  const rawQueryStart = quarterlyBuckets[0]?.start ?? monthlyBuckets[0]?.start ?? '';
  const queryEnd = quarterlyBuckets[quarterlyBuckets.length - 1]?.end ?? monthlyBuckets[monthlyBuckets.length - 1]?.end ?? '';
  const queryStart = rawQueryStart ? shiftIsoDateMonths(rawQueryStart, -12) : '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stage-entry-split-trend-dsh', pipelineId, queryStart, queryEnd],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deal_stage_history')
        .select(`
          deal_id,
          changed_at,
          to_stage,
          to_stage_id,
          from_stage_id,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id
          )
        `)
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', pipelineId)
        .in('to_stage', expandStageLabels(targetStages))
        .gte('changed_at', queryStart)
        .lte('changed_at', `${queryEnd}T23:59:59.999Z`)
        .order('changed_at', { ascending: true });

      if (error) throw error;
      if ((rows?.length ?? 0) === 0) {
        console.warn('[stage-entry-split-trend] 0 rows', { targetStages, pipelineId, queryStart, queryEnd });
      }
      const synthetic = await fetchClosedDealsAsSyntheticRows(
        pipelineId,
        targetStages,
        `${queryStart}T00:00:00.000Z`,
        `${queryEnd}T23:59:59.999Z`,
      );
      const merged = [...(rows ?? []), ...synthetic];
      await applyHistoricalValuesToRows(merged);
      return merged;
    },
    enabled: !!user && !!queryStart && !!queryEnd,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const monthly = aggregateStageEntrySplitTrendBuckets(data ?? [], monthlyBuckets, 'monthly', pipelineId);
    const quarterly = aggregateStageEntrySplitTrendBuckets(data ?? [], quarterlyBuckets, 'quarterly', pipelineId);
    const monthlyTtm = aggregateStageEntrySplitTrendBucketsTtm(data ?? [], monthlyBuckets, pipelineId);
    const quarterlyTtm = aggregateStageEntrySplitTrendBucketsTtm(data ?? [], quarterlyBuckets, pipelineId);
    const total = monthly.reduce((s, b) => s + b.total, 0);
    return {
      monthly,
      quarterly,
      monthlyTtm,
      quarterlyTtm,
      total,
      isLoading: isLoading || isFetching,
    };
  }, [data, isLoading, isFetching, monthlyBuckets, quarterlyBuckets, pipelineId]);
}

function useRevenueTotalForPeriod(realmId: string, period: QuarterOption): RevenuePeriodTotalResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['qb-revenue-total-for-period', realmId, period.value],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('quickbooks_invoices')
        .select('total_amt')
        .eq('realm_id', realmId)
        .gte('txn_date', period.startDate)
        .lte('txn_date', period.endDate);

      if (error) throw error;
      return (rows ?? []).reduce((sum, row) => sum + (Number(row.total_amt) || 0), 0);
    },
    enabled: !!user && !!realmId && !!period.startDate && !!period.endDate,
    staleTime: 30_000,
  });

  return {
    total: data ?? 0,
    isLoading: isLoading || isFetching,
  };
}

function useAverageDealMetric(
  stageMetric: StageMetricResult,
  previous?: StageMetricResult,
): AverageMetricResult {
  return useMemo(() => ({
    value: stageMetric.count > 0 ? stageMetric.dollarVolume / stageMetric.count : null,
    numerator: stageMetric.dollarVolume,
    denominator: stageMetric.count,
    deals: stageMetric.deals,
    isLoading: stageMetric.isLoading,
    previousValue: previous && previous.count > 0
      ? previous.dollarVolume / previous.count
      : previous ? null : undefined,
  }), [stageMetric.count, stageMetric.dollarVolume, stageMetric.deals, stageMetric.isLoading, previous?.count, previous?.dollarVolume]);
}

function useRevenuePerDealMetric(
  revenueTotal: RevenuePeriodTotalResult,
  stageMetric: StageMetricResult,
  previous?: { revenueTotal: RevenuePeriodTotalResult; stageMetric: StageMetricResult },
): AverageMetricResult {
  return useMemo(() => ({
    value: stageMetric.count > 0 ? revenueTotal.total / stageMetric.count : null,
    numerator: revenueTotal.total,
    denominator: stageMetric.count,
    deals: stageMetric.deals,
    isLoading: revenueTotal.isLoading || stageMetric.isLoading,
    previousValue: previous && previous.stageMetric.count > 0
      ? previous.revenueTotal.total / previous.stageMetric.count
      : previous ? null : undefined,
  }), [revenueTotal.total, revenueTotal.isLoading, stageMetric.count, stageMetric.deals, stageMetric.isLoading, previous?.revenueTotal.total, previous?.stageMetric.count]);
}

/**
 * Total hours logged (via weekly_time_entries) across all deals whose
 * `pipeline_id` falls in the supplied set, restricted to the given period.
 * Used for "Revenue per Deal Hour" on the Consolidated Debt board.
 */
function useDealHoursInPeriod(
  pipelineIds: string[],
  period: QuarterOption,
): { total: number; isLoading: boolean } {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['deal-hours-in-period', pipelineIds.slice().sort().join(','), period.value],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('weekly_time_entries')
        .select('hours, deal_id, week_start_date')
        .gte('week_start_date', period.startDate)
        .lte('week_start_date', period.endDate);
      if (error) throw error;

      const dealIds = Array.from(
        new Set((rows ?? []).map((r: { deal_id: string | null }) => r.deal_id).filter(Boolean) as string[]),
      );
      if (dealIds.length === 0) return 0;

      // Filter to deals whose pipeline_id is in the requested set.
      const { data: deals, error: dealsErr } = await supabase
        .from('deals')
        .select('id, pipeline_id, company')
        .in('id', dealIds);
      if (dealsErr) throw dealsErr;

      const eligible = new Set(
        (deals ?? [])
          .filter(d => d.pipeline_id && pipelineIds.includes(d.pipeline_id))
          .filter(d => !isExcludedDealName(d.company ?? ''))
          .map(d => d.id),
      );
      return (rows ?? []).reduce(
        (sum, r: { deal_id: string | null; hours: number | string | null }) =>
          r.deal_id && eligible.has(r.deal_id) ? sum + (Number(r.hours) || 0) : sum,
        0,
      );
    },
    enabled: !!user && !!period.startDate && !!period.endDate && pipelineIds.length > 0,
    staleTime: 30_000,
  });

  return { total: data ?? 0, isLoading: isLoading || isFetching };
}

function useRevenuePerHourMetric(
  revenueTotal: RevenuePeriodTotalResult,
  hours: { total: number; isLoading: boolean },
  previous?: { revenueTotal: RevenuePeriodTotalResult; hours: { total: number; isLoading: boolean } },
): AverageMetricResult {
  return useMemo(() => ({
    value: hours.total > 0 ? revenueTotal.total / hours.total : null,
    numerator: revenueTotal.total,
    denominator: hours.total,
    deals: [],
    isLoading: revenueTotal.isLoading || hours.isLoading,
    previousValue: previous && previous.hours.total > 0
      ? previous.revenueTotal.total / previous.hours.total
      : previous ? null : undefined,
  }), [revenueTotal.total, revenueTotal.isLoading, hours.total, hours.isLoading, previous?.revenueTotal.total, previous?.hours.total]);
}

/**
 * Returns deals that entered a specific stage within a quarter,
 * using activity_logs (stage_change) as the source of truth.
 * Deduplication: only the FIRST entry into the target stage per deal is counted.
 */
function useStageEntryMetric(
  targetStage: string | string[],
  quarter: QuarterOption,
  pipelineId?: string | string[],
  options?: { excludeDealOwners?: string[]; excludeChangedByUserIds?: string[] },
): StageMetricResult {
  const { user } = useAuth();
  const targetStages = Array.isArray(targetStage) ? targetStage : [targetStage];
  const primaryPipelineId = Array.isArray(pipelineId) ? pipelineId[0] : pipelineId;
  const pipelineIds = pipelineId
    ? (Array.isArray(pipelineId) ? pipelineId : [pipelineId])
    : undefined;
  const queryStages = expandMetricStageLabels(targetStages, primaryPipelineId);
  const excludeOwnersKey = (options?.excludeDealOwners ?? []).map((s) => s.toLowerCase()).sort().join('|');
  const excludeChangedByKey = (options?.excludeChangedByUserIds ?? []).slice().sort().join('|');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'stage-entry-metric-dsh',
      targetStages.join(','),
      quarter.value,
      pipelineIds ? pipelineIds.join(',') : null,
      excludeOwnersKey || null,
      excludeChangedByKey || null,
    ],
    queryFn: async () => {
      const startDate = quarter.startDate;
      const endDate = quarter.endDate;

      // Source of truth: deal_stage_history (stage_enter events).
      // NO `source` filter — manual_bulk_update rows MUST be included so bulk
      // backfills (e.g. the 46 Closed Won + 101 Closed Lost moves) flow into
      // stage-velocity, funnel, Deals Closed and Dollars Funded metrics.
      let query = supabase
        .from('deal_stage_history')
        .select(`
          deal_id,
          changed_at,
          to_stage,
          to_stage_id,
          from_stage_id,
          changed_by,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id,
            status,
            mrr,
            deal_owner
          )
        `)
        .eq('event_type', 'stage_enter')
        .in('to_stage', queryStages)
        .gte('changed_at', startDate)
        .lte('changed_at', endDate + 'T23:59:59.999Z');

      if (pipelineIds && pipelineIds.length === 1) {
        query = query.eq('pipeline_id', pipelineIds[0]);
      } else if (pipelineIds && pipelineIds.length > 1) {
        query = query.in('pipeline_id', pipelineIds);
      }

      const { data: rows, error } = await query
        .order('changed_at', { ascending: true });

      if (error) throw error;
      if ((rows?.length ?? 0) === 0) {
        console.warn('[stage-entry-metric] 0 rows', { targetStages, pipelineIds, startDate, endDate });
      }
      const synthetic = await fetchClosedDealsAsSyntheticRows(
        primaryPipelineId,
        targetStages,
        `${startDate}T00:00:00.000Z`,
        `${endDate}T23:59:59.999Z`,
      );
      const merged = [...(rows ?? []), ...synthetic];
      await applyHistoricalValuesToRows(merged);
      return merged;
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading, mrr: 0 };

    const excludedOwners = new Set(
      (options?.excludeDealOwners ?? []).map((s) => s.toLowerCase().trim()),
    );
    const excludedChangedBy = new Set(options?.excludeChangedByUserIds ?? []);
    // Deduplicate: first entry per deal_id only
    const seen = new Map<string, StageEntryDeal>();
    for (const row of data) {
      if (seen.has(row.deal_id)) continue;
      const deal = row.deals as any;
      if (!deal) continue;
      // Excluded deal_owner filter (e.g. remove NDA entries authored under
      // former team member John Moffitt's ownership).
      if (excludedOwners.size > 0) {
        const owner = String(deal.deal_owner ?? '').toLowerCase().trim();
        if (owner && excludedOwners.has(owner)) continue;
      }
      // Excluded changed_by filter: skip stage entries authored by specific
      // users (e.g. former team member John Moffitt), regardless of current
      // deal_owner. This catches deals that were reassigned after Moffitt
      // originally logged the NDA / Needs List Sent entry.
      if (excludedChangedBy.size > 0) {
        const changedBy = String((row as any).changed_by ?? '');
        if (changedBy && excludedChangedBy.has(changedBy)) continue;
      }
      // If pipelineId filter specified but inner join didn't filter (safety)
        if (pipelineIds && !pipelineIds.includes(deal.pipeline_id)) continue;
        const stageSlug = normalizeMetricStageSlug(
          (row as any).to_stage,
          (row as any).to_stage_id,
          primaryPipelineId,
          targetStages,
        );
      if (!stageSlug || !targetStages.includes(stageSlug)) continue;
      seen.set(row.deal_id, {
        deal_id: row.deal_id,
        company: deal.company ?? '—',
        value: Number(deal.value) || 0,
        manager: deal.manager,
        current_stage: deal.stage,
        entered_at: (row as any).changed_at,
        pipeline_id: deal.pipeline_id,
        mrr: Number(deal.mrr) || 0,
      });
    }

    const deals: StageEntryDeal[] = Array.from(seen.values()).filter(d => !isExcludedDealName(d.company));
    const mrr = deals.reduce((s, d) => s + (d.mrr ?? 0), 0);
    return {
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + d.value, 0),
      deals,
      isLoading: loading,
      mrr,
    };
  }, [data, isLoading, isFetching, pipelineIds?.join(','), targetStages, excludeOwnersKey]);
}

/**
 * Returns deals that were added to a specific pipeline within a quarter.
 * Uses deals.created_at as the entry timestamp (no stage_change event for initial creation).
 */
function usePipelineAddedMetric(
  pipelineId: string,
  quarter: QuarterOption,
): StageMetricResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pipeline-added-metric', pipelineId, quarter.value],
    queryFn: async () => {
      const startDate = quarter.startDate;
      const endDate = quarter.endDate;

      const { data: rows, error } = await supabase
        .from('deals')
        .select('id, company, value, manager, stage, pipeline_id, created_at, mrr')
        .eq('pipeline_id', pipelineId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });

      if (error) throw error;
      // Apply historical value reconstruction: rewrite each deal's `value`
      // to what it was at the row's `created_at`, so widgets fed by this
      // hook reflect the deal size at pipeline entry rather than the
      // latest edit.
      const shaped = (rows ?? []).map((d: any) => ({
        deal_id: d.id,
        changed_at: d.created_at,
        deals: { value: d.value },
        __src: d,
      }));
      await applyHistoricalValuesToRows(shaped);
      return shaped.map((r) => ({ ...r.__src, value: r.deals.value }));
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading, mrr: 0 };

    const filtered = (data as any[]).filter(d => !isExcludedDealName(d.company));
    const deals: StageEntryDeal[] = filtered.map((d: any) => ({
        deal_id: d.id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager,
        current_stage: d.stage,
        entered_at: d.created_at,
        pipeline_id: d.pipeline_id ?? '',
        mrr: Number(d.mrr) || 0,
      }));
    const mrr = filtered.reduce((s: number, d: any) => s + (Number(d.mrr) || 0), 0);

    return {
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + d.value, 0),
      deals,
      isLoading: loading,
      mrr,
    };
  }, [data, isLoading, isFetching]);
}

/**
 * Returns deals added to a specific pipeline within the selected quarter.
 * Excludes closed-won, closed-lost, on-hold, and archived deals.
 */
function usePipelineDealsInPeriod(pipelineId: string, quarter: QuarterOption): StageMetricResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pipeline-deals-in-period', pipelineId, quarter.value],
    queryFn: async () => {
      const startDate = quarter.startDate;
      const endDate = quarter.endDate;

      const { data: rows, error } = await supabase
        .from('deals')
        .select('id, company, value, manager, stage, pipeline_id, created_at, status')
        .eq('pipeline_id', pipelineId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const shaped = (rows ?? []).map((d: any) => ({
        deal_id: d.id,
        changed_at: d.created_at,
        deals: { value: d.value },
        __src: d,
      }));
      await applyHistoricalValuesToRows(shaped);
      return shaped.map((r) => ({ ...r.__src, value: r.deals.value }));
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading };

    const excludedStatuses = ['closed-won', 'closed-lost', 'on-hold', 'archived'];
    const excludedStages = ['closed-won', 'closed-lost'];

    const activeDeals: StageEntryDeal[] = data
      .filter(d => {
        const status = (d.status || '').toLowerCase();
        const stage = (d.stage || '').toLowerCase();
        return !excludedStatuses.includes(status) && !excludedStages.includes(stage) && !isExcludedDealName(d.company);
      })
      .map(d => ({
        deal_id: d.id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager,
        current_stage: d.stage,
        entered_at: d.created_at,
        pipeline_id: d.pipeline_id ?? '',
      }));

    return {
      count: activeDeals.length,
      dollarVolume: activeDeals.reduce((s, d) => s + d.value, 0),
      deals: activeDeals,
      isLoading: loading,
    };
  }, [data, isLoading, isFetching]);
}

// 5th Line company's pipeline IDs
const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';
const DEBT_REALM_ID = '193514877331929';

// Stage IDs
const NDA_NEEDS_LIST_STAGE = 'ndaneeds-list-sent';
const FINAL_CREDIT_ITEMS_STAGE = 'final-credit-items';
const FUNDED_INVOICED_STAGE = 'funded-invoiced';
const FS_ACTIVE_CLIENT_STAGE = 'fs-active-client';
const PROPOSAL_ISSUED_STAGE = 'proposal-issued';
const TERMS_ISSUED_STAGE = 'terms-issued';
const IN_DUE_DILIGENCE_STAGE = 'in-due-diligence';

export interface PipelineMetrics {
  dealsOnBoard: StageMetricResult;
  debtDollarOnBoard: StageMetricResult;
  debtDealsSigned: StageMetricResult;
  debtDollarSigned: StageMetricResult;
  debtDealsClosed: StageMetricResult;
  debtDollarClosed: StageMetricResult;
  finservDealsOnBoard: StageMetricResult;
  finservClientsSigned: StageMetricResult;
  finservActiveClients: StageMetricResult & { mrr: number };
}

export function usePipelineStageMetrics(quarter: QuarterOption): PipelineMetrics {
  // Deals on Board & Debt $ on Board: deals added to active pipeline within the selected quarter
  const dealsOnBoard = usePipelineDealsInPeriod(ACTIVE_PIPELINE_ID, quarter);

  // Signed metrics remain stage-entry based
  const debtDealsSigned = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, quarter, ACTIVE_PIPELINE_ID);
  // Deals Closed = unique deals that entered the Funded / Invoiced stage in
  // the active pipeline within the selected period. (The active pipeline has
  // a single combined "Funded / Invoiced" stage, so a single stage-entry
  // metric naturally dedupes deals that touch both Funded and Invoiced.)
  const debtDealsClosed = useStageEntryMetric(FUNDED_INVOICED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const finservDealsOnBoard = usePipelineAddedMetric(FINSERV_PIPELINE_ID, quarter);
  const finservClientsSigned = useStageEntryMetric(FS_ACTIVE_CLIENT_STAGE, quarter, FINSERV_PIPELINE_ID);
  const finservActiveClients = useFinServActiveClientsCurrent();

  return {
    dealsOnBoard,
    debtDollarOnBoard: dealsOnBoard,
    debtDealsSigned,
    debtDollarSigned: debtDealsSigned,
    debtDealsClosed,
    debtDollarClosed: debtDealsClosed,
    finservDealsOnBoard,
    finservClientsSigned,
    finservActiveClients,
  };
}

/**
 * Current FinServ Active Clients snapshot.
 * Counts deals where pipeline_id = FinServ and stage = 'fs-active-client',
 * plus the sum of their MRR. RLS scopes to the user's accessible deals.
 */
function useFinServActiveClientsCurrent(): StageMetricResult & { mrr: number } {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['finserv-active-clients-current', user?.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deals')
        .select('id, company, value, manager, stage, pipeline_id, created_at, mrr')
        .eq('pipeline_id', FINSERV_PIPELINE_ID)
        .eq('stage', FS_ACTIVE_CLIENT_STAGE);
      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading, mrr: 0 };

    const deals: StageEntryDeal[] = data
      .filter((d: any) => !isExcludedDealName(d.company))
      .map((d: any) => ({
        deal_id: d.id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager,
        current_stage: d.stage,
        entered_at: d.created_at,
        pipeline_id: d.pipeline_id ?? '',
        mrr: Number(d.mrr) || 0,
      }));

    const mrr = data
      .filter((d: any) => !isExcludedDealName(d.company))
      .reduce((s: number, d: any) => s + (Number(d.mrr) || 0), 0);

    return {
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + d.value, 0),
      deals,
      isLoading: loading,
      mrr,
    };
  }, [data, isLoading, isFetching]);
}

/**
 * Consolidated Debt Pipeline Board metrics.
 *
 * All metrics use stage-entry logic via `activity_logs` (stage_change → metadata.to)
 * scoped to the Active Pipeline. Each metric exposes both count and dollarVolume,
 * so the dashboard can surface them as paired cards (count + $).
 *
 * Stage mapping (per product spec):
 *  - "Deals on the Board" / "Debt $ on the Board"  → entered "NDA/Needs List Sent"
 *  - "Proposals Issued"   / "Dollars Proposed"     → entered "Proposal Issued"
 *  - "Debt Deals Signed"  / "Debt $ Signed"        → entered "Final Credit Items"
 *  - "Terms Issued"       / "Terms Issued $"       → entered "Terms Issued"
 *  - "Terms Signed"       / "Terms Signed $"       → entered "In Due Diligence"
 */
export interface ConsolidatedDebtPipelineMetrics {
  ndaNeedsList: StageMetricResult;
  proposalsIssued: StageMetricResult;
  finalCreditItems: StageMetricResult;
  fundedInvoiced: StageMetricResult;
  fundedInvoicedOnly: StageMetricResult;
  fundedInvoicedTrend: StageTrendSeriesResult;
  ndaNeedsListTrend: StageTrendSeriesResult;
  finalCreditItemsTrend: StageTrendSeriesResult;
  closedSplitTrend: StageSplitTrendSeriesResult;
  termsIssued: StageMetricResult;
  inDueDiligence: StageMetricResult;
  averageDealOnBoard: AverageMetricResult;
  averageDealSigned: AverageMetricResult;
  averageDealClosed: AverageMetricResult;
  averageRevenuePerDealSigned: AverageMetricResult;
  averageRevenuePerDealClosed: AverageMetricResult;
  revenuePerDealHour: AverageMetricResult;
  // Trailing-12-month stage-entry counts, anchored on today. Used by the
  // Pipeline Conversion widgets on the Consolidated Debt dashboard.
  ttmCounts: {
    proposalIssued: StageMetricResult;
    finalCreditItems: StageMetricResult;
    submittedToLenders: StageMetricResult;
    termsIssued: StageMetricResult;
    inDueDiligence: StageMetricResult;
    fundedInvoiced: StageMetricResult;
    isLoading: boolean;
  };
  /** Prior-period (same-length window immediately preceding the selected
   *  quarter) stage-entry metrics for the top-row Sales KPIs. Used to render
   *  count and $ deltas vs prior on each Sales card. */
  priors: {
    ndaNeedsList: StageMetricResult;
    proposalsIssued: StageMetricResult;
    finalCreditItems: StageMetricResult;
    termsIssued: StageMetricResult;
    inDueDiligence: StageMetricResult;
    fundedInvoicedOnly: StageMetricResult;
  };
  /** Sets of deal_ids that have EVER entered each conversion-relevant stage
   *  on the Active Pipeline (any time, not restricted to TTM). Used by the
   *  denominator-anchored conversion toggle so each card can filter its
   *  numerator by whether the deal ever passed through the *denominator*
   *  stage — not just FCI. */
  lifetimeStageDealIds: {
    proposalIssued: Set<string>;
    finalCreditItems: Set<string>;
    submittedToLenders: Set<string>;
    termsIssued: Set<string>;
    inDueDiligence: Set<string>;
    fundedInvoiced: Set<string>;
    isLoading: boolean;
  };
}

export function useConsolidatedDebtPipelineMetrics(
  quarter: QuarterOption,
): ConsolidatedDebtPipelineMetrics {
  // Rolling windows anchor on the END of the selected period (capped at today
  // so we never project into the future). This means a Q2 2026 selection
  // yields a TTM window ending Jun 30, 2026 — matching the user's mental model
  // that "TTM as of Q2" ends at the close of Q2, not today.
  const todayAnchor = useMemo(() => {
    const today = new Date();
    const todayMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    let anchor = todayMonthEnd;
    if (quarter?.endDate) {
      const qEnd = new Date(quarter.endDate + 'T00:00:00');
      if (!Number.isNaN(qEnd.getTime()) && qEnd < todayMonthEnd) {
        anchor = qEnd;
      }
    }
    const y = anchor.getFullYear();
    const m = String(anchor.getMonth() + 1).padStart(2, '0');
    const last = new Date(y, anchor.getMonth() + 1, 0).getDate();
    return `${y}-${m}-${String(last).padStart(2, '0')}`;
  }, [quarter?.endDate]);
  const sixMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(todayAnchor, 6),
    [todayAnchor],
  );
  const twelveMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(todayAnchor, 12),
    [todayAnchor],
  );
  // Prior windows for KPI deltas.
  // For TTM-based KPIs the comparison is the TTM dataset ending one selected
  // period earlier (e.g. Apr 2026 selected → TTM as of Mar 2026 end; Q2 2026
  // selected → TTM as of Q1 2026 end). We anchor the prior rolling window on
  // the day immediately before the selected period's start date.
  const priorRollingAnchor = useMemo(() => {
    if (!quarter.startDate) return todayAnchor;
    const d = new Date(quarter.startDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [quarter.startDate, todayAnchor]);
  const priorSixMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(priorRollingAnchor, 6),
    [priorRollingAnchor],
  );
  const priorTwelveMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(priorRollingAnchor, 12),
    [priorRollingAnchor],
  );
  // "On the board" is scoped to the selected period itself, so its prior
  // comparison is the immediately preceding equal-length window.
  const priorQuarter = useMemo(() => buildPriorPeriodFor(quarter), [quarter]);

  // "Deals on the Board" / "Dollars on the Board" / "Average Deal on the Board":
  // distinct deals that ENTERED the "NDA / Needs List Sent" stage during the
  // selected period. Sourced from `deal_stage_history` (stage_enter events)
  // across BOTH the Active Pipeline and the In Development pipeline, so deals
  // that later moved to In Development (or were sent to lenders from there)
  // still count. The count and dollar volume move with the selected timeframe
  // (YTD, Last 6 Months, etc.) instead of being pinned to `deals.created_at`.
  const NDA_PIPELINES = ['b78ad452-b489-4c89-8a91-789347c05f79', '40b17dfb-9122-49e0-bf7c-5aa993d5d615'];
  // Exclude NDA / Needs List Sent activity authored under John Moffitt's
  // ownership from the "Deals on the Board" metrics — those entries are not
  // part of the current pipeline's activity we want to report on.
  const NDA_EXCLUDED_OWNERS = ['John Moffitt'];
  const ndaNeedsList = useStageEntryMetric(NDA_NEEDS_LIST_STAGE, quarter, NDA_PIPELINES, {
    excludeDealOwners: NDA_EXCLUDED_OWNERS,
  });
  const ndaNeedsListPrior = useStageEntryMetric(NDA_NEEDS_LIST_STAGE, priorQuarter, NDA_PIPELINES, {
    excludeDealOwners: NDA_EXCLUDED_OWNERS,
  });
  const proposalsIssued = useStageEntryMetric(PROPOSAL_ISSUED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const proposalsIssuedPrior = useStageEntryMetric(PROPOSAL_ISSUED_STAGE, priorQuarter, ACTIVE_PIPELINE_ID);
  const finalCreditItems = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const finalCreditItemsPrior = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, priorQuarter, ACTIVE_PIPELINE_ID);
  // Closed metrics aggregate BOTH "funded-invoiced" and "closed-won" stage
  // entries within the Active Pipeline, per product spec.
  const CLOSED_STAGES = [FUNDED_INVOICED_STAGE, 'closed-won'];
  const fundedInvoiced = useStageEntryMetric(CLOSED_STAGES, quarter, ACTIVE_PIPELINE_ID);
  // Closed KPI tiles (Deals Closed / Dollars Funded) are strictly entries into
  // Funded / Invoiced only — Closed Won is excluded per product spec. Trend
  // charts below continue to include Closed Won via CLOSED_STAGES.
  const fundedInvoicedOnly = useStageEntryMetric(FUNDED_INVOICED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const fundedInvoicedOnlyPrior = useStageEntryMetric(FUNDED_INVOICED_STAGE, priorQuarter, ACTIVE_PIPELINE_ID);
  const fundedInvoicedTrend = useStageEntryTrendSeries(CLOSED_STAGES, todayAnchor, ACTIVE_PIPELINE_ID);
  const ndaNeedsListTrend = useStageEntryTrendSeries(NDA_NEEDS_LIST_STAGE, todayAnchor, ACTIVE_PIPELINE_ID);
  const finalCreditItemsTrend = useStageEntryTrendSeries(FINAL_CREDIT_ITEMS_STAGE, todayAnchor, ACTIVE_PIPELINE_ID);
  const closedSplitTrend = useStageEntrySplitTrendSeries(todayAnchor, ACTIVE_PIPELINE_ID);
  const termsIssued = useStageEntryMetric(TERMS_ISSUED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const termsIssuedPrior = useStageEntryMetric(TERMS_ISSUED_STAGE, priorQuarter, ACTIVE_PIPELINE_ID);
  const inDueDiligence = useStageEntryMetric(IN_DUE_DILIGENCE_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const inDueDiligencePrior = useStageEntryMetric(IN_DUE_DILIGENCE_STAGE, priorQuarter, ACTIVE_PIPELINE_ID);

  const finalCreditItemsRolling6 = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling6 = useStageEntryMetric(CLOSED_STAGES, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const finalCreditItemsRolling12 = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling12 = useStageEntryMetric(CLOSED_STAGES, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  // Prior-period stage & revenue metrics for delta calculations.
  const finalCreditItemsRolling6Prior = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, priorSixMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling6Prior = useStageEntryMetric(CLOSED_STAGES, priorSixMonthPeriod, ACTIVE_PIPELINE_ID);
  const finalCreditItemsRolling12Prior = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, priorTwelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling12Prior = useStageEntryMetric(CLOSED_STAGES, priorTwelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const proposalIssuedRolling12 = useStageEntryMetric(PROPOSAL_ISSUED_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  // "Submitted to Lenders" for conversion widgets includes BOTH the
  // `submitted-to-lenders` and `lenders-in-review` stage entries. The metric
  // hook dedupes by deal_id (first entry wins), so a deal that hit both
  // stages inside the TTM window is only counted once.
  const submittedToLendersRolling12 = useStageEntryMetric(
    ['submitted-to-lenders', 'lenders-in-review'],
    twelveMonthPeriod,
    ACTIVE_PIPELINE_ID,
  );
  const termsIssuedRolling12 = useStageEntryMetric(TERMS_ISSUED_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const inDueDiligenceRolling12 = useStageEntryMetric(IN_DUE_DILIGENCE_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedOnlyRolling12 = useStageEntryMetric(FUNDED_INVOICED_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const debtRevenueRolling12 = useRevenueTotalForPeriod(DEBT_REALM_ID, twelveMonthPeriod);
  const debtRevenueRolling12Prior = useRevenueTotalForPeriod(DEBT_REALM_ID, priorTwelveMonthPeriod);
  const IN_DEVELOPMENT_PIPELINE_ID = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
  const dealHoursRolling12 = useDealHoursInPeriod(
    [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID],
    twelveMonthPeriod,
  );
  const dealHoursRolling12Prior = useDealHoursInPeriod(
    [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID],
    priorTwelveMonthPeriod,
  );

  // Lifetime deal_ids per conversion-relevant stage on the Active Pipeline —
  // used by the denominator-anchored conversion toggle so each card filters
  // its numerator by whether the deal ever entered *its own* denominator
  // stage (not just FCI). One query, bucketed client-side.
  const { user } = useAuth();
  const STAGE_GROUPS: Record<string, string[]> = {
    proposalIssued: [PROPOSAL_ISSUED_STAGE],
    finalCreditItems: [FINAL_CREDIT_ITEMS_STAGE],
    submittedToLenders: ['submitted-to-lenders', 'lenders-in-review'],
    termsIssued: [TERMS_ISSUED_STAGE],
    inDueDiligence: [IN_DUE_DILIGENCE_STAGE],
    fundedInvoiced: [FUNDED_INVOICED_STAGE],
  };
  const lifetimeStages = useQuery({
    queryKey: ['lifetime-stage-deal-ids', ACTIVE_PIPELINE_ID],
    queryFn: async () => {
      // Expand all target slugs to observed casings, then fetch in one shot
      // and bucket rows back to their canonical group key.
      const slugToGroup = new Map<string, string>();
      const allSlugs: string[] = [];
      for (const [group, slugs] of Object.entries(STAGE_GROUPS)) {
        for (const variant of expandStageLabels(slugs)) {
          slugToGroup.set(variant, group);
          allSlugs.push(variant);
        }
      }
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, to_stage')
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', allSlugs);
      if (error) throw error;
      const out: Record<string, Set<string>> = {
        proposalIssued: new Set(),
        finalCreditItems: new Set(),
        submittedToLenders: new Set(),
        termsIssued: new Set(),
        inDueDiligence: new Set(),
        fundedInvoiced: new Set(),
      };
      for (const r of (data ?? []) as Array<{ deal_id: string; to_stage: string }>) {
        const g = slugToGroup.get(r.to_stage);
        if (g) out[g].add(r.deal_id);
      }
      return out;
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const emptySet = useMemo(() => new Set<string>(), []);

  return {
    ndaNeedsList,
    proposalsIssued,
    finalCreditItems,
    fundedInvoiced,
    fundedInvoicedOnly,
    fundedInvoicedTrend,
    ndaNeedsListTrend,
    finalCreditItemsTrend,
    closedSplitTrend,
    termsIssued,
    inDueDiligence,
    // Average Deal on the Board = Debt $ on the Board / Deals on the Board for
    // the selected period (N/A when count is 0).
    averageDealOnBoard: useAverageDealMetric(ndaNeedsList, ndaNeedsListPrior),
    averageDealSigned: useAverageDealMetric(finalCreditItemsRolling6, finalCreditItemsRolling6Prior),
    averageDealClosed: useAverageDealMetric(fundedInvoicedRolling6, fundedInvoicedRolling6Prior),
    averageRevenuePerDealSigned: useRevenuePerDealMetric(
      debtRevenueRolling12,
      finalCreditItemsRolling12,
      { revenueTotal: debtRevenueRolling12Prior, stageMetric: finalCreditItemsRolling12Prior },
    ),
    averageRevenuePerDealClosed: useRevenuePerDealMetric(
      debtRevenueRolling12,
      fundedInvoicedRolling12,
      { revenueTotal: debtRevenueRolling12Prior, stageMetric: fundedInvoicedRolling12Prior },
    ),
    revenuePerDealHour: useRevenuePerHourMetric(
      debtRevenueRolling12,
      dealHoursRolling12,
      { revenueTotal: debtRevenueRolling12Prior, hours: dealHoursRolling12Prior },
    ),
    ttmCounts: {
      proposalIssued: proposalIssuedRolling12,
      finalCreditItems: finalCreditItemsRolling12,
      submittedToLenders: submittedToLendersRolling12,
      termsIssued: termsIssuedRolling12,
      inDueDiligence: inDueDiligenceRolling12,
      fundedInvoiced: fundedInvoicedOnlyRolling12,
      isLoading:
        proposalIssuedRolling12.isLoading ||
        finalCreditItemsRolling12.isLoading ||
        submittedToLendersRolling12.isLoading ||
        termsIssuedRolling12.isLoading ||
        inDueDiligenceRolling12.isLoading ||
        fundedInvoicedOnlyRolling12.isLoading,
    },
    priors: {
      ndaNeedsList: ndaNeedsListPrior,
      proposalsIssued: proposalsIssuedPrior,
      finalCreditItems: finalCreditItemsPrior,
      termsIssued: termsIssuedPrior,
      inDueDiligence: inDueDiligencePrior,
      fundedInvoicedOnly: fundedInvoicedOnlyPrior,
    },
    lifetimeStageDealIds: {
      proposalIssued: lifetimeStages.data?.proposalIssued ?? emptySet,
      finalCreditItems: lifetimeStages.data?.finalCreditItems ?? emptySet,
      submittedToLenders: lifetimeStages.data?.submittedToLenders ?? emptySet,
      termsIssued: lifetimeStages.data?.termsIssued ?? emptySet,
      inDueDiligence: lifetimeStages.data?.inDueDiligence ?? emptySet,
      fundedInvoiced: lifetimeStages.data?.fundedInvoiced ?? emptySet,
      isLoading: lifetimeStages.isLoading || lifetimeStages.isFetching,
    },
  };
}

/**
 * Total Revenue Opportunity: sum of `total_fee` across current Active Pipeline
 * deals whose stage sits anywhere in the Final Credit Items → In Due Diligence
 * range (inclusive). Excludes closed / on-hold / archived deals and the
 * globally-excluded demo/test companies.
 *
 * Returns a StageMetricResult so it slots into the existing MetricCardConfig
 * drilldown pipeline. Each returned deal's `value` is the deal's `total_fee`,
 * so the drilldown bar chart aggregates fees (not deal size).
 */
const TOTAL_REVENUE_OPPORTUNITY_STAGES: readonly string[] = [
  'final-credit-items',
  'client-strategy-review',
  'write-up-pending',
  'submitted-to-lenders',
  'lenders-in-review',
  'terms-issued',
  'in-due-diligence',
];

const TOTAL_REVENUE_OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  'final-credit-items': 'Final Credit Items',
  'client-strategy-review': 'Client Strategy Review',
  'write-up-pending': 'Write-Up Pending',
  'submitted-to-lenders': 'Submitted to Lenders',
  'lenders-in-review': 'Lenders in Review',
  'terms-issued': 'Terms Issued',
  'in-due-diligence': 'In Due Diligence',
};

export function useTotalRevenueOpportunity(): StageMetricResult {
  const { user } = useAuth();

  const stageSlugs = TOTAL_REVENUE_OPPORTUNITY_STAGES;
  const stageLabels = stageSlugs.map(s => TOTAL_REVENUE_OPPORTUNITY_STAGE_LABELS[s]);
  const stageFilterValues = Array.from(new Set([...stageSlugs, ...stageLabels]));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['total-revenue-opportunity', ACTIVE_PIPELINE_ID],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deals')
        .select('id, company, value, total_fee, success_fee_percent, retainer_fee, milestone_fee, manager, stage, pipeline_id, created_at, status, projected_close_date')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('stage', stageFilterValues);
      if (error) throw error;
      const dealRows = rows ?? [];
      const dealIds = dealRows.map((d: any) => d.id).filter(Boolean);
      let qtsByDeal = new Map<string, string>();
      if (dealIds.length > 0) {
        const { data: msRows, error: msErr } = await supabase
          .from('deal_milestones')
          .select('deal_id, title, due_date')
          .in('deal_id', dealIds)
          .ilike('title', '%qualified%');
        if (msErr) throw msErr;
        for (const m of msRows ?? []) {
          const t = String((m as any).title ?? '').toLowerCase();
          if (!t.includes('term')) continue;
          const dd = (m as any).due_date as string | null;
          if (!dd) continue;
          const existing = qtsByDeal.get((m as any).deal_id);
          if (!existing || dd < existing) qtsByDeal.set((m as any).deal_id, dd);
        }
      }
      return dealRows.map((d: any) => ({ ...d, __qts_due_date: qtsByDeal.get(d.id) ?? null }));
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading };

    const excludedStatuses = new Set(['closed-won', 'closed-lost', 'on-hold', 'archived']);

    const deals: StageEntryDeal[] = data
      .filter((d: any) => {
        const status = String(d.status ?? '').toLowerCase();
        if (excludedStatuses.has(status)) return false;
        if (isExcludedDealName(d.company)) return false;
        return true;
      })
      .map((d: any) => {
        const stored = Number(d.total_fee);
        const totalFee = Number.isFinite(stored) && stored > 0
          ? stored
          : (() => {
              const v = Number(d.value) || 0;
              const pctRaw = Number(d.success_fee_percent);
              if (!Number.isFinite(pctRaw) || pctRaw <= 0) return 0;
              const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw;
              return v * pct;
            })();
        const retainerRaw = Number(d.retainer_fee);
        const retainer = Number.isFinite(retainerRaw) && retainerRaw > 0 ? retainerRaw : 0;
        const milestoneRaw = Number(d.milestone_fee);
        const milestone = Number.isFinite(milestoneRaw) && milestoneRaw > 0 ? milestoneRaw : 0;
        const closing = Math.max(0, totalFee - milestone);
        return {
          deal_id: d.id,
          company: d.company ?? '—',
          value: totalFee,
          manager: d.manager ?? null,
          current_stage: d.stage,
          entered_at: d.created_at,
          pipeline_id: d.pipeline_id ?? '',
          retainer_fee: retainer,
          milestone_fee: milestone,
          closing_fee: closing,
          projected_close_date: d.projected_close_date ?? null,
          qts_due_date: d.__qts_due_date ?? null,
        } as StageEntryDeal;
      });

    return {
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + (d.value || 0), 0),
      deals,
      isLoading: loading,
    };
  }, [data, isLoading, isFetching]);
}
