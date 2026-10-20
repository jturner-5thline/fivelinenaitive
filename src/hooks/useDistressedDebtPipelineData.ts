import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';
import type { DealStageOption } from '@/contexts/DealStagesContext';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { DISTRESSED_DEBT_PIPELINE_NAME, DISTRESSED_DEBT_STAGES } from '@/lib/distressedDebtPipeline';

export function useDistressedDebtPipelineData() {
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStageOption[]>(DISTRESSED_DEBT_STAGES);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const ensurePipeline = useCallback(async (): Promise<string | null> => {
    const { data: existing } = await supabase
      .from('deal_pipelines')
      .select('id, stages')
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .eq('name', DISTRESSED_DEBT_PIPELINE_NAME)
      .maybeSingle();
    if (existing) {
      const parsed = Array.isArray(existing.stages)
        ? (existing.stages as any[]).filter((s) => s && typeof s.id === 'string' && typeof s.label === 'string')
        : [];
      if (parsed.length) setStages(parsed as DealStageOption[]);
      return existing.id;
    }
    const { data: created, error } = await supabase
      .from('deal_pipelines')
      .insert({
        company_id: FIFTH_LINE_COMPANY_ID,
        name: DISTRESSED_DEBT_PIPELINE_NAME,
        is_default: false,
        position: 110,
        stages: DISTRESSED_DEBT_STAGES as any,
      })
      .select('id')
      .single();
    if (error) { console.error('Failed to create Distressed Debt pipeline', error); return null; }
    return created.id;
  }, []);

  const fetchDeals = useCallback(async (pipId: string) => {
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('pipeline_id', pipId)
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    setDeals((data || []).map((d: any) => ({
      id: d.id,
      name: d.company || d.name || '',
      company: d.company || '',
      narrative: d.narrative || undefined,
      stage: d.stage || DISTRESSED_DEBT_STAGES[0].id,
      status: d.status ?? null,
      engagementType: d.engagement_type || 'advisory',
      manager: d.manager || '',
      dealOwner: d.deal_owner || undefined,
      lender: d.lender || '',
      value: d.value || 0,
      totalFee: d.total_fee || 0,
      contact: d.contact || '',
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      pipelineId: d.pipeline_id || undefined,
      dealClass: 'distressed' as const,
      currentLenderId: d.current_lender_id || undefined,
      currentLenderName: d.current_lender_name || undefined,
      lenders: [],
      milestones: [],
    })) as unknown as Deal[]);
  }, []);

  const init = useCallback(async () => {
    setIsLoading(true);
    const id = await ensurePipeline();
    if (id) { setPipelineId(id); await fetchDeals(id); }
    setIsLoading(false);
  }, [ensurePipeline, fetchDeals]);

  useEffect(() => { init(); }, [init]);

  const refetch = useCallback(async () => { if (pipelineId) await fetchDeals(pipelineId); }, [pipelineId, fetchDeals]);

  useEffect(() => {
    if (!pipelineId) return;
    const ch = supabase
      .channel(`distressed-pipeline-deals-${pipelineId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals', filter: `pipeline_id=eq.${pipelineId}` }, () => fetchDeals(pipelineId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pipelineId, fetchDeals]);

  return { pipelineId, stages, deals, isLoading, refetch };
}
