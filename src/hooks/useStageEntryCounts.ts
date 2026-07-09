import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * Count of distinct deals that entered a given stage within a trailing window.
 * Reads from `deal_stage_history` (event_type = 'stage_enter'), scoped to the
 * Active Deals pipeline and excluding globally-excluded test deals.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

export interface StageEntryCountResult {
  count: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useStageEntryCount(
  stageId: string,
  trailingMonths: number = 12,
): StageEntryCountResult {
  const { user } = useAuth();

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - trailingMonths);
  const sinceIso = since.toISOString();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['stage-entry-count', ACTIVE_PIPELINE_ID, stageId, sinceIso.slice(0, 10)],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, deals!inner(company)')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .eq('event_type', 'stage_enter')
        .eq('to_stage_id', stageId)
        .gte('changed_at', sinceIso);
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const distinct = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    const company = r.deals?.company ?? '';
    if (isExcludedDealName(company)) continue;
    if (r.deal_id) distinct.add(r.deal_id);
  }

  return {
    count: distinct.size,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}