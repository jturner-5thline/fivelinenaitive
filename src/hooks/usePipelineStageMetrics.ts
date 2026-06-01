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
  'closed-won': ['closed-won', 'Closed Won', 'Closed won'],
};

/** Expand canonical slugs → full list of `to_stage` text values to filter on. */
export function expandStageLabels(slugs: string[]): string[] {
  const out = new Set<string>();
  for (const slug of slugs) {
    out.add(slug);
    for (const v of STAGE_LABEL_VARIANTS[slug] ?? []) out.add(v);
  }
  return Array.from(out);
}

/** Normalize any observed to_stage text or to_stage_id back to a canonical slug. */
export function normalizeStageSlug(toStage: string | null | undefined, toStageId?: string | null): string | null {
  for (const [slug, variants] of Object.entries(STAGE_LABEL_VARIANTS)) {
    if (toStage && variants.includes(toStage)) return slug;
  }
  // Last-resort fallback: trust to_stage_id only when it's one of our known slugs.
  if (toStageId && Object.prototype.hasOwnProperty.call(STAGE_LABEL_VARIANTS, toStageId)) return toStageId;
  return null;
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

  const queryStart = quarterlyBuckets[0]?.start ?? monthlyBuckets[0]?.start ?? '';
  const queryEnd = quarterlyBuckets[quarterlyBuckets.length - 1]?.end ?? monthlyBuckets[monthlyBuckets.length - 1]?.end ?? '';

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
      return rows ?? [];
    },
    enabled: !!user && !!queryStart && !!queryEnd,
    staleTime: 30_000,
  });

  return useMemo(() => ({
    monthly: aggregateStageEntryTrendBuckets(data ?? [], monthlyBuckets, 'monthly', pipelineId, targetStages),
    quarterly: aggregateStageEntryTrendBuckets(data ?? [], quarterlyBuckets, 'quarterly', pipelineId, targetStages),
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
    const stageId: string = row.to_stage_id;
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
      to_stage: stageId,
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

  const queryStart = quarterlyBuckets[0]?.start ?? monthlyBuckets[0]?.start ?? '';
  const queryEnd = quarterlyBuckets[quarterlyBuckets.length - 1]?.end ?? monthlyBuckets[monthlyBuckets.length - 1]?.end ?? '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stage-entry-split-trend-dsh', pipelineId, queryStart, queryEnd],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deal_stage_history')
        .select(`
          deal_id,
          changed_at,
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
        .in('to_stage_id', targetStages)
        .gte('changed_at', queryStart)
        .lte('changed_at', `${queryEnd}T23:59:59.999Z`)
        .order('changed_at', { ascending: true });

      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user && !!queryStart && !!queryEnd,
    staleTime: 30_000,
  });

  return useMemo(() => {
    const monthly = aggregateStageEntrySplitTrendBuckets(data ?? [], monthlyBuckets, 'monthly', pipelineId);
    const quarterly = aggregateStageEntrySplitTrendBuckets(data ?? [], quarterlyBuckets, 'quarterly', pipelineId);
    const total = monthly.reduce((s, b) => s + b.total, 0);
    return {
      monthly,
      quarterly,
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

function useAverageDealMetric(stageMetric: StageMetricResult): AverageMetricResult {
  return useMemo(() => ({
    value: stageMetric.count > 0 ? stageMetric.dollarVolume / stageMetric.count : null,
    numerator: stageMetric.dollarVolume,
    denominator: stageMetric.count,
    deals: stageMetric.deals,
    isLoading: stageMetric.isLoading,
  }), [stageMetric.count, stageMetric.dollarVolume, stageMetric.deals, stageMetric.isLoading]);
}

function useRevenuePerDealMetric(
  revenueTotal: RevenuePeriodTotalResult,
  stageMetric: StageMetricResult,
): AverageMetricResult {
  return useMemo(() => ({
    value: stageMetric.count > 0 ? revenueTotal.total / stageMetric.count : null,
    numerator: revenueTotal.total,
    denominator: stageMetric.count,
    deals: stageMetric.deals,
    isLoading: revenueTotal.isLoading || stageMetric.isLoading,
  }), [revenueTotal.total, revenueTotal.isLoading, stageMetric.count, stageMetric.deals, stageMetric.isLoading]);
}

/**
 * Returns deals that entered a specific stage within a quarter,
 * using activity_logs (stage_change) as the source of truth.
 * Deduplication: only the FIRST entry into the target stage per deal is counted.
 */
function useStageEntryMetric(
  targetStage: string | string[],
  quarter: QuarterOption,
  pipelineId?: string,
): StageMetricResult {
  const { user } = useAuth();
  const targetStages = Array.isArray(targetStage) ? targetStage : [targetStage];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stage-entry-metric-dsh', targetStages.join(','), quarter.value, pipelineId],
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
          to_stage_id,
          from_stage_id,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id,
            status,
            mrr
          )
        `)
        .eq('event_type', 'stage_enter')
        .in('to_stage_id', targetStages)
        .gte('changed_at', startDate)
        .lte('changed_at', endDate + 'T23:59:59.999Z');

      if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId);
      }

      const { data: rows, error } = await query
        .order('changed_at', { ascending: true });

      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading, mrr: 0 };

    // Deduplicate: first entry per deal_id only
    const seen = new Map<string, StageEntryDeal>();
    for (const row of data) {
      if (seen.has(row.deal_id)) continue;
      const deal = row.deals as any;
      if (!deal) continue;
      // If pipelineId filter specified but inner join didn't filter (safety)
      if (pipelineId && deal.pipeline_id !== pipelineId) continue;
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
  }, [data, isLoading, isFetching, pipelineId]);
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
      return rows ?? [];
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
      return rows ?? [];
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
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
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
  fundedInvoicedTrend: StageTrendSeriesResult;
  closedSplitTrend: StageSplitTrendSeriesResult;
  termsIssued: StageMetricResult;
  inDueDiligence: StageMetricResult;
  averageDealOnBoard: AverageMetricResult;
  averageDealSigned: AverageMetricResult;
  averageDealClosed: AverageMetricResult;
  averageRevenuePerDealSigned: AverageMetricResult;
  averageRevenuePerDealClosed: AverageMetricResult;
}

export function useConsolidatedDebtPipelineMetrics(
  quarter: QuarterOption,
): ConsolidatedDebtPipelineMetrics {
  // Rolling windows anchor on TODAY (current month-end), independent of the
  // selectedQuarter. This ensures the Closed Trend, Average Deal Closed, and
  // Average Revenue per Deal Closed always include the most recent activity
  // (e.g. the May 2026 bulk Closed Won moves) even when the user is viewing a
  // prior quarter.
  const todayAnchor = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const last = new Date(y, d.getMonth() + 1, 0).getDate();
    return `${y}-${m}-${String(last).padStart(2, '0')}`;
  }, []);
  const sixMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(todayAnchor, 6),
    [todayAnchor],
  );
  const twelveMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(todayAnchor, 12),
    [todayAnchor],
  );

  const ndaNeedsList = useStageEntryMetric(NDA_NEEDS_LIST_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const proposalsIssued = useStageEntryMetric(PROPOSAL_ISSUED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const finalCreditItems = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, quarter, ACTIVE_PIPELINE_ID);
  // Closed metrics aggregate BOTH "funded-invoiced" and "closed-won" stage
  // entries within the Active Pipeline, per product spec.
  const CLOSED_STAGES = [FUNDED_INVOICED_STAGE, 'closed-won'];
  const fundedInvoiced = useStageEntryMetric(CLOSED_STAGES, quarter, ACTIVE_PIPELINE_ID);
  const fundedInvoicedTrend = useStageEntryTrendSeries(CLOSED_STAGES, todayAnchor, ACTIVE_PIPELINE_ID);
  const closedSplitTrend = useStageEntrySplitTrendSeries(todayAnchor, ACTIVE_PIPELINE_ID);
  const termsIssued = useStageEntryMetric(TERMS_ISSUED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const inDueDiligence = useStageEntryMetric(IN_DUE_DILIGENCE_STAGE, quarter, ACTIVE_PIPELINE_ID);

  const ndaNeedsListRolling6 = useStageEntryMetric(NDA_NEEDS_LIST_STAGE, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const finalCreditItemsRolling6 = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling6 = useStageEntryMetric(CLOSED_STAGES, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const finalCreditItemsRolling12 = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling12 = useStageEntryMetric(CLOSED_STAGES, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const debtRevenueRolling12 = useRevenueTotalForPeriod(DEBT_REALM_ID, twelveMonthPeriod);

  return {
    ndaNeedsList,
    proposalsIssued,
    finalCreditItems,
    fundedInvoiced,
    fundedInvoicedTrend,
    closedSplitTrend,
    termsIssued,
    inDueDiligence,
    averageDealOnBoard: useAverageDealMetric(ndaNeedsListRolling6),
    averageDealSigned: useAverageDealMetric(finalCreditItemsRolling6),
    averageDealClosed: useAverageDealMetric(fundedInvoicedRolling6),
    averageRevenuePerDealSigned: useRevenuePerDealMetric(debtRevenueRolling12, finalCreditItemsRolling12),
    averageRevenuePerDealClosed: useRevenuePerDealMetric(debtRevenueRolling12, fundedInvoicedRolling12),
  };
}
