import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

export interface NaitiveStageHistoryRow {
  id: string;
  dealId: string;
  fromStage: string | null;
  toStage: string | null;
  changedAt: string;
}

export function useNaitiveStageHistory(pipelineId: string | null) {
  const [history, setHistory] = useState<NaitiveStageHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!pipelineId) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('deal_stage_history')
        .select('id, deal_id, from_stage, to_stage, changed_at')
        .eq('pipeline_id', pipelineId)
        .eq('company_id', FIFTH_LINE_COMPANY_ID)
        .order('changed_at', { ascending: false })
        .limit(2000);
      if (cancelled) return;
      if (error) {
        console.error('stage history fetch failed', error);
        setHistory([]);
      } else {
        setHistory(
          (data || []).map((r: any) => ({
            id: r.id,
            dealId: r.deal_id,
            fromStage: r.from_stage,
            toStage: r.to_stage,
            changedAt: r.changed_at,
          })),
        );
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pipelineId]);

  return { history, isLoading };
}