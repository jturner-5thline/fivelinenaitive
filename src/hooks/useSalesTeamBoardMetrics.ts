import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { StageEntryDeal } from '@/hooks/usePipelineStageMetrics';

// Pipeline IDs (5th Line)
const IN_DEVELOPMENT_PIPELINE_ID = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';

// Stage IDs (note: In Development pipeline overloads canonical stage ids)
// "Indication of Interest" in In Development is stored as `closed-won` (see mem://technical/pipeline-stage-id-overloading)
const IN_DEV_INDICATION_STAGE = 'closed-won';
const FS_INDICATION_STAGE = 'fs-indication-of-interest';
const FS_ACTIVE_CLIENT_STAGE = 'fs-active-client';
// "Proposal Issued" in FinServ maps to the existing `fs-proposal-sent` stage (label: "Proposal Sent")
const FS_PROPOSAL_ISSUED_STAGE = 'fs-proposal-sent';

export interface MetricResult {
  count: number;
  dollarVolume: number;
  deals: StageEntryDeal[];
  isLoading: boolean;
}

export interface SalesTeamBoardMetrics {
  inDevIndication: MetricResult;
  finservOnBoard: MetricResult;
  finservSigned: MetricResult;
  finservProposalsIssued: MetricResult;
  finservAvgDealSizeOnBoard: { value: number; isLoading: boolean; deals: StageEntryDeal[] };
}

/** Stage-entry metric: deals whose first transition INTO targetStage occurred during the quarter. */
function useStageEntryMetric(
  targetStage: string,
  pipelineId: string,
  quarter: QuarterOption,
): MetricResult {
  const { user } = useAuth();
  const startDate = quarter.months[0].start;
  const endDate = quarter.months[quarter.months.length - 1].end;

  const { data, isLoading } = useQuery({
    queryKey: ['stb-stage-entry', targetStage, pipelineId, quarter.value],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('activity_logs')
        .select(`
          deal_id,
          created_at,
          deals!inner ( company, value, manager, stage, pipeline_id )
        `)
        .eq('activity_type', 'stage_change')
        .eq('metadata->>to', targetStage)
        .eq('deals.pipeline_id', pipelineId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!user,
  });

  return useMemo(() => {
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading };
    const seen = new Map<string, StageEntryDeal>();
    for (const row of data) {
      if (seen.has(row.deal_id)) continue; // dedupe: first entry only
      const d = row.deals as any;
      if (!d || d.pipeline_id !== pipelineId) continue;
      seen.set(row.deal_id, {
        deal_id: row.deal_id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager,
        current_stage: d.stage,
        entered_at: row.created_at,
        pipeline_id: d.pipeline_id,
      });
    }
    const deals = Array.from(seen.values()).filter(d => !isExcludedDealName(d.company));
    return {
      count: deals.length,
      dollarVolume: deals.reduce((s, d) => s + d.value, 0),
      deals,
      isLoading,
    };
  }, [data, isLoading, pipelineId]);
}

/** Pipeline-added metric: deals created in the pipeline during the quarter. */
function usePipelineAddedMetric(pipelineId: string, quarter: QuarterOption): MetricResult {
  const { user } = useAuth();
  const startDate = quarter.months[0].start;
  const endDate = quarter.months[quarter.months.length - 1].end;

  const { data, isLoading } = useQuery({
    queryKey: ['stb-pipeline-added', pipelineId, quarter.value],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deals')
        .select('id, company, value, manager, stage, pipeline_id, created_at')
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
    if (!data) return { count: 0, dollarVolume: 0, deals: [], isLoading };
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
      isLoading,
    };
  }, [data, isLoading]);
}

export function useSalesTeamBoardMetrics(quarter: QuarterOption): SalesTeamBoardMetrics {
  const inDevIndication = useStageEntryMetric(IN_DEV_INDICATION_STAGE, IN_DEVELOPMENT_PIPELINE_ID, quarter);
  const finservOnBoard = usePipelineAddedMetric(FINSERV_PIPELINE_ID, quarter);
  const finservSigned = useStageEntryMetric(FS_ACTIVE_CLIENT_STAGE, FINSERV_PIPELINE_ID, quarter);
  const finservProposalsIssued = useStageEntryMetric(FS_PROPOSAL_ISSUED_STAGE, FINSERV_PIPELINE_ID, quarter);

  // Avg deal size = mean of value across qualifying deals added; null/zero values excluded from denominator
  const finservAvgDealSizeOnBoard = useMemo(() => {
    const withValue = finservOnBoard.deals.filter(d => d.value > 0);
    const avg = withValue.length === 0
      ? 0
      : withValue.reduce((s, d) => s + d.value, 0) / withValue.length;
    return { value: avg, isLoading: finservOnBoard.isLoading, deals: finservOnBoard.deals };
  }, [finservOnBoard]);

  return {
    inDevIndication,
    finservOnBoard,
    finservSigned,
    finservProposalsIssued,
    finservAvgDealSizeOnBoard,
  };
}
