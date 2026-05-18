import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Deal, DealLender, DealMilestone } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

const FINSERV_PIPELINE_NAME = 'FinServ Pipeline';

export const FINSERV_STAGES: DealStageOption[] = [
  { id: 'fs-qualification', label: 'Qualification', color: 'bg-slate-500' },
  { id: 'fs-discovery', label: 'Discovery', color: 'bg-blue-500' },
  { id: 'fs-qualified', label: 'Qualified', color: 'bg-indigo-500' },
  { id: 'fs-scoping', label: 'Scoping', color: 'bg-violet-500' },
  { id: 'fs-proposal-sent', label: 'Proposal Sent', color: 'bg-purple-500' },
  { id: 'fs-negotiation', label: 'Negotiation', color: 'bg-amber-500' },
  { id: 'fs-closed-won', label: 'Active Client', color: 'bg-green-500' },
  { id: 'fs-churned', label: 'Churned', color: 'bg-orange-500' },
  { id: 'fs-closed-lost', label: 'Closed Lost', color: 'bg-red-500' },
];

interface FinServPipelineData {
  pipelineId: string | null;
  stages: DealStageOption[];
  deals: Deal[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFinServPipelineData(): FinServPipelineData {
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStageOption[]>(FINSERV_STAGES);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ensurePipeline = useCallback(async (): Promise<string | null> => {
    const { data: existing, error: fetchErr } = await supabase
      .from('deal_pipelines')
      .select('id, stages')
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .eq('name', FINSERV_PIPELINE_NAME)
      .maybeSingle();

    if (fetchErr) {
      setError('Failed to load FinServ pipeline');
      return null;
    }

    if (existing) {
      if (existing.stages && Array.isArray(existing.stages)) {
        const parsed = (existing.stages as any[]).filter(
          (s: any) => s && typeof s.id === 'string' && typeof s.label === 'string' && typeof s.color === 'string'
        ) as DealStageOption[];
        if (parsed.length > 0) setStages(parsed);
      }
      return existing.id;
    }

    const { data: created, error: createErr } = await supabase
      .from('deal_pipelines')
      .insert({
        company_id: FIFTH_LINE_COMPANY_ID,
        name: FINSERV_PIPELINE_NAME,
        is_default: false,
        position: 100,
        stages: FINSERV_STAGES as any,
      })
      .select('id')
      .single();

    if (createErr) {
      setError('Failed to create FinServ pipeline');
      return null;
    }

    return created.id;
  }, []);

  const fetchDeals = useCallback(async (pipId: string) => {
    const { data, error: fetchErr } = await supabase
      .from('deals')
      .select(`*, deal_lenders (*), deal_milestones (*)`)
      .eq('pipeline_id', pipId)
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      setError('Failed to load FinServ deals');
      return;
    }

    const mapped: Deal[] = (data || []).map((d: any) => ({
      id: d.id,
      name: d.company || d.name || '',
      company: d.company || '',
      narrative: d.narrative || undefined,
      companyUrl: d.company_url || undefined,
      businessModel: d.business_model || undefined,
      contactInfo: d.contact_info || undefined,
      stage: d.stage || FINSERV_STAGES[0].id,
      status: d.status || 'on-track',
      engagementType: d.engagement_type || 'guided',
      exclusivity: d.exclusivity || undefined,
      dealTypes: d.deal_types || undefined,
      manager: d.manager || '',
      dealOwner: d.deal_owner || undefined,
      analyst: d.analyst || undefined,
      isFlagged: d.is_flagged || false,
      flagNotes: d.flag_notes || undefined,
      lender: d.lender || '',
      value: d.value || 0,
      totalFee: d.total_fee || 0,
      retainerFee: d.retainer_fee || undefined,
      milestoneFee: d.milestone_fee || undefined,
      successFeePercent: d.success_fee_percent || undefined,
      preSigningHours: d.pre_signing_hours || undefined,
      postSigningHours: d.post_signing_hours || undefined,
      contact: d.contact || '',
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      notes: d.notes || undefined,
      notesUpdatedAt: d.notes_updated_at || undefined,
      pipelineId: d.pipeline_id || undefined,
      closingDate: d.closing_date || null,
      sourcedVia: d.sourced_via || undefined,
      dealClass: 'finserv' as const,
      onHold: d.on_hold === true,
      lenders: (d.deal_lenders || []).map((l: any) => ({
        id: l.id,
        name: l.name || '',
        status: l.status || 'in-review',
        stage: l.stage || '',
        substage: l.substage || undefined,
        trackingStatus: l.tracking_status || 'active',
        passReason: l.pass_reason || undefined,
        score: l.score || null,
        notes: l.notes || undefined,
        notesUpdatedAt: l.notes_updated_at || undefined,
        updatedAt: l.updated_at || undefined,
      })) as DealLender[],
      milestones: (d.deal_milestones || []).map((m: any) => ({
        id: m.id,
        title: m.title || '',
        dueDate: m.due_date || undefined,
        completed: m.completed || false,
        completedAt: m.completed_at || undefined,
        position: m.position || 0,
        status: m.status || null,
      })) as DealMilestone[],
    }));

    setDeals(mapped);
  }, []);

  const init = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const pipId = await ensurePipeline();
    if (pipId) {
      setPipelineId(pipId);
      await fetchDeals(pipId);
    }
    setIsLoading(false);
  }, [ensurePipeline, fetchDeals]);

  useEffect(() => { init(); }, [init]);

  const refetch = useCallback(async () => {
    if (pipelineId) await fetchDeals(pipelineId);
  }, [pipelineId, fetchDeals]);

  return { pipelineId, stages, deals, isLoading, error, refetch };
}
