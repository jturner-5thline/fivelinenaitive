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
      const startDate = quarter.months[0].start;
      const endDate = quarter.months[quarter.months.length - 1].end;

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
      const startDate = quarter.months[0].start;
      const endDate = quarter.months[quarter.months.length - 1].end;

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
      const startDate = quarter.months[0].start;
      const endDate = quarter.months[quarter.months.length - 1].end;

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

// Stage IDs
const NDA_NEEDS_LIST_STAGE = 'ndaneeds-list-sent';
const FINAL_CREDIT_ITEMS_STAGE = 'final-credit-items';
const FS_ACTIVE_CLIENT_STAGE = 'fs-active-client';

export interface PipelineMetrics {
  dealsOnBoard: StageMetricResult;
  debtDollarOnBoard: StageMetricResult;
  debtDealsSigned: StageMetricResult;
  debtDollarSigned: StageMetricResult;
  finservDealsOnBoard: StageMetricResult;
  finservClientsSigned: StageMetricResult;
}

export function usePipelineStageMetrics(quarter: QuarterOption): PipelineMetrics {
  // Deals on Board & Debt $ on Board: deals added to active pipeline within the selected quarter
  const dealsOnBoard = usePipelineDealsInPeriod(ACTIVE_PIPELINE_ID, quarter);

  // Signed metrics remain stage-entry based
  const debtDealsSigned = useStageEntryMetric(FINAL_CREDIT_ITEMS_STAGE, quarter, ACTIVE_PIPELINE_ID);
  const finservDealsOnBoard = usePipelineAddedMetric(FINSERV_PIPELINE_ID, quarter);
  const finservClientsSigned = useStageEntryMetric(FS_ACTIVE_CLIENT_STAGE, quarter, FINSERV_PIPELINE_ID);

  return {
    dealsOnBoard,
    debtDollarOnBoard: dealsOnBoard,
    debtDealsSigned,
    debtDollarSigned: debtDealsSigned,
    finservDealsOnBoard,
    finservClientsSigned,
  };
}
