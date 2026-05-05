import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';
import { isExcludedDealName } from '@/utils/excludedDeals';

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
}

interface StageMetricResult {
  count: number;
  dollarVolume: number;
  deals: StageEntryDeal[];
  isLoading: boolean;
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
  targetStage: string,
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
    if (row.created_at < windowStart || row.created_at > windowEnd) continue;
    if (seen.has(row.deal_id)) continue;

    const deal = row.deals as Record<string, any> | null;
    if (!deal || deal.pipeline_id !== pipelineId || isExcludedDealName(deal.company)) continue;

    const bucketKey = grain === 'monthly' ? row.created_at.slice(0, 7) : getQuarterKey(row.created_at);
    const bucket = bucketMap.get(bucketKey);
    if (!bucket) continue;

    seen.add(row.deal_id);

    const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
    const entry: StageEntryDeal = {
      deal_id: row.deal_id,
      company: deal.company ?? '—',
      value: Number(deal.value) || 0,
      manager: deal.manager ?? null,
      current_stage: deal.stage ?? '',
      entered_at: row.created_at,
      pipeline_id: deal.pipeline_id ?? '',
      from_stage: typeof metadata.from === 'string' ? metadata.from : null,
      to_stage: typeof metadata.to === 'string' ? metadata.to : targetStage,
    };

    bucket.count += 1;
    bucket.dollarVolume += entry.value;
    bucket.deals.push(entry);
  }

  return buckets;
}

function useStageEntryTrendSeries(
  targetStage: string,
  anchorEndDate: string,
  pipelineId: string,
): StageTrendSeriesResult {
  const { user } = useAuth();

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
    queryKey: ['stage-entry-trend-series', targetStage, pipelineId, queryStart, queryEnd],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('activity_logs')
        .select(`
          deal_id,
          created_at,
          metadata,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id
          )
        `)
        .eq('activity_type', 'stage_change')
        .eq('metadata->>to', targetStage)
        .gte('created_at', queryStart)
        .lte('created_at', `${queryEnd}T23:59:59.999Z`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user && !!queryStart && !!queryEnd,
    staleTime: 30_000,
  });

  return useMemo(() => ({
    monthly: aggregateStageEntryTrendBuckets(data ?? [], monthlyBuckets, 'monthly', pipelineId, targetStage),
    quarterly: aggregateStageEntryTrendBuckets(data ?? [], quarterlyBuckets, 'quarterly', pipelineId, targetStage),
    isLoading: isLoading || isFetching,
  }), [data, isLoading, isFetching, monthlyBuckets, pipelineId, quarterlyBuckets, targetStage]);
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
  targetStage: string,
  quarter: QuarterOption,
  pipelineId?: string,
): StageMetricResult {
  const { user } = useAuth();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['stage-entry-metric', targetStage, quarter.value, pipelineId],
    queryFn: async () => {
      const startDate = quarter.startDate;
      const endDate = quarter.endDate;

      // Get all stage_change events to the target stage in this period
      let query = supabase
        .from('activity_logs')
        .select(`
          deal_id,
          created_at,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id,
            status
          )
        `)
        .eq('activity_type', 'stage_change')
        .eq('metadata->>to', targetStage)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z');

      if (pipelineId) {
        query = query.eq('deals.pipeline_id', pipelineId);
      }

      const { data: rows, error } = await query
        .order('created_at', { ascending: true });

      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user,
  });

  return useMemo(() => {
    const loading = isLoading || isFetching;
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading };

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
        entered_at: row.created_at,
        pipeline_id: deal.pipeline_id,
      });
    }

    const deals = Array.from(seen.values()).filter(d => !isExcludedDealName(d.company));
    return {
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + d.value, 0),
      deals,
      isLoading: loading,
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
        .select('id, company, value, manager, stage, pipeline_id, created_at')
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
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading: loading };

    const deals: StageEntryDeal[] = data
      .filter(d => !isExcludedDealName(d.company))
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
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + d.value, 0),
      deals,
      isLoading: loading,
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

  return {
    dealsOnBoard,
    debtDollarOnBoard: dealsOnBoard,
    debtDealsSigned,
    debtDollarSigned: debtDealsSigned,
    debtDealsClosed,
    debtDollarClosed: debtDealsClosed,
    finservDealsOnBoard,
    finservClientsSigned,
  };
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
  const sixMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(quarter.endDate, 6),
    [quarter.endDate],
  );
  const twelveMonthPeriod = useMemo(
    () => buildRollingMonthsPeriod(quarter.endDate, 12),
    [quarter.endDate],
  );

  const ndaNeedsList = useStageEntryMetric(NDA_NEEDS_LIST_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const proposalsIssued = useStageEntryMetric(PROPOSAL_ISSUED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const finalCreditItems = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const fundedInvoiced = useStageEntryMetric(FUNDED_INVOICED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const fundedInvoicedTrend = useStageEntryTrendSeries(FUNDED_INVOICED_STAGE, quarter.endDate, ACTIVE_PIPELINE_ID);
  const termsIssued = useStageEntryMetric(TERMS_ISSUED_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const inDueDiligence = useStageEntryMetric(IN_DUE_DILIGENCE_STAGE, quarter, ACTIVE_PIPELINE_ID);

  const ndaNeedsListRolling6 = useStageEntryMetric(NDA_NEEDS_LIST_STAGE, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const finalCreditItemsRolling6 = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling6 = useStageEntryMetric(FUNDED_INVOICED_STAGE, sixMonthPeriod, ACTIVE_PIPELINE_ID);
  const finalCreditItemsRolling12 = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const fundedInvoicedRolling12 = useStageEntryMetric(FUNDED_INVOICED_STAGE, twelveMonthPeriod, ACTIVE_PIPELINE_ID);
  const debtRevenueRolling12 = useRevenueTotalForPeriod(DEBT_REALM_ID, twelveMonthPeriod);

  return {
    ndaNeedsList,
    proposalsIssued,
    finalCreditItems,
    fundedInvoiced,
    fundedInvoicedTrend,
    termsIssued,
    inDueDiligence,
    averageDealOnBoard: useAverageDealMetric(ndaNeedsListRolling6),
    averageDealSigned: useAverageDealMetric(finalCreditItemsRolling6),
    averageDealClosed: useAverageDealMetric(fundedInvoicedRolling6),
    averageRevenuePerDealSigned: useRevenuePerDealMetric(debtRevenueRolling12, finalCreditItemsRolling12),
    averageRevenuePerDealClosed: useRevenuePerDealMetric(debtRevenueRolling12, fundedInvoicedRolling12),
  };
}
