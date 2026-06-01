import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Deal, DealLender, DealMilestone } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';
import { resetNaitivePipelineCache } from '@/utils/naitivePipelineExclusion';
import { seedMissingStageDescriptions, resolveSystemStageType } from '@/config/naitivePipelineConfig';

const NAITIVE_PIPELINE_NAME = 'naitive Pipeline';

const DEFAULT_NAITIVE_STAGES: DealStageOption[] = [
  { id: 'prospects', label: 'Prospects', color: 'bg-slate-500', systemStageType: 'prospects', isActive: true },
  { id: 'dormant', label: 'Dormant', color: 'bg-zinc-500', systemStageType: 'dormant', isActive: true },
  { id: 'on-hold', label: 'On Hold', color: 'bg-amber-500', systemStageType: 'on-hold', isActive: true },
  { id: 'qual-call', label: 'Qual Call', color: 'bg-blue-500', systemStageType: 'qual-call', isActive: true },
  { id: 'demo-access', label: 'Demo Access', color: 'bg-indigo-500', systemStageType: 'demo-access', isActive: true },
  { id: 'pilot-agreed', label: 'Pilot Agreed', color: 'bg-cyan-500', systemStageType: 'pilot-agreed', isActive: true },
  { id: 'onboarding', label: 'Onboarding', color: 'bg-violet-500', systemStageType: 'onboarding', isActive: true },
  { id: 'active', label: 'Active', color: 'bg-green-500', systemStageType: 'active', isActive: true },
  { id: 'churned', label: 'Churned', color: 'bg-orange-500', systemStageType: 'churned', isActive: true },
  { id: 'closed-lost', label: 'Closed Lost', color: 'bg-red-500', systemStageType: 'closed-lost', isActive: true },
];

interface NaitivePipelineData {
  pipelineId: string | null;
  stages: DealStageOption[];
  deals: Deal[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveStages: (next: DealStageOption[]) => Promise<boolean>;
}

export function useNaitivePipelineData(): NaitivePipelineData {
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStageOption[]>(DEFAULT_NAITIVE_STAGES);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ensurePipeline = useCallback(async (): Promise<string | null> => {
    // Check if naitive pipeline already exists for 5th Line
    const { data: existing, error: fetchErr } = await supabase
      .from('deal_pipelines')
      .select('id, stages')
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .eq('name', NAITIVE_PIPELINE_NAME)
      .maybeSingle();

    if (fetchErr) {
      console.error('Error fetching naitive pipeline:', fetchErr);
      setError('Failed to load pipeline');
      return null;
    }

    if (existing) {
      // Parse stages
      if (existing.stages && Array.isArray(existing.stages)) {
        const parsed = (existing.stages as any[])
          .filter(
            (s: any) =>
              s && typeof s.id === 'string' && typeof s.label === 'string' && typeof s.color === 'string',
          )
          .map((s: any) => ({
            id: s.id,
            label: s.label,
            color: s.color,
            description: typeof s.description === 'string' ? s.description : undefined,
            systemStageType: typeof s.systemStageType === 'string' ? s.systemStageType : undefined,
            isActive: typeof s.isActive === 'boolean' ? s.isActive : true,
            sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : undefined,
          })) as DealStageOption[];
        if (parsed.length > 0) {
          // Auto-seed canonical type + description on load (non-destructive)
          const { stages: seeded, changed } = seedMissingStageDescriptions(parsed);
          setStages(seeded);
          if (changed) {
            supabase
              .from('deal_pipelines')
              .update({ stages: seeded as any })
              .eq('id', existing.id)
              .then(() => {});
          }
        }
      }
      return existing.id;
    }

    // Create the pipeline
    const { data: created, error: createErr } = await supabase
      .from('deal_pipelines')
      .insert({
        company_id: FIFTH_LINE_COMPANY_ID,
        name: NAITIVE_PIPELINE_NAME,
        is_default: false,
        position: 99,
        stages: DEFAULT_NAITIVE_STAGES as any,
      })
      .select('id')
      .single();

    if (createErr) {
      console.error('Error creating naitive pipeline:', createErr);
      setError('Failed to create pipeline');
      return null;
    }

    // Reset cache so the exclusion filter picks up the new ID
    resetNaitivePipelineCache();

    return created.id;
  }, []);

  const fetchDeals = useCallback(async (pipId: string) => {
    const { data, error: fetchErr } = await supabase
      .from('deals')
      .select(`
        *,
        deal_lenders (*),
        deal_milestones (*)
      `)
      .eq('pipeline_id', pipId)
      .eq('company_id', FIFTH_LINE_COMPANY_ID)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      console.error('Error fetching naitive deals:', fetchErr);
      setError('Failed to load deals');
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
      stage: d.stage || 'prospects',
      status: d.status || 'on-track',
      engagementType: d.engagement_type || 'advisory',
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
      dealClass: (d.deal_class || 'naitive') as 'standard' | 'naitive',
      // ── Naitive sales-pipeline extras (tacked onto Deal for display) ──
      icpCategory: d.icp_category || undefined,
      ownedBy: d.owned_by || undefined,
      contactTitle: d.contact_title || undefined,
      nextStep: d.next_step || undefined,
      nextStepDate: d.next_step_date || undefined,
      prospectType: d.prospect_type || undefined,
      outcome: d.outcome || undefined,
      painPointsConfirmed: d.pain_points_confirmed || undefined,
      objectionsRaised: d.objections_raised || undefined,
      competitorsMentioned: d.competitors_mentioned || undefined,
      keySignal: d.key_signal || undefined,
      productGapFlagged: d.product_gap_flagged || undefined,
      dmPresent: d.dm_present || undefined,
      whyNotMovingForward: d.why_not_moving_forward || undefined,
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

  useEffect(() => {
    init();
  }, [init]);

  const refetch = useCallback(async () => {
    if (pipelineId) {
      await fetchDeals(pipelineId);
    }
  }, [pipelineId, fetchDeals]);

  // Realtime: when any deal in the naitive pipeline is updated/inserted/deleted
  // (e.g. stage change made from the deal detail panel), refetch so the kanban
  // board reflects the new column placement immediately.
  useEffect(() => {
    if (!pipelineId) return;
    const channel = supabase
      .channel(`naitive-pipeline-deals-${pipelineId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals' },
        (payload) => {
          const newRow: any = (payload as any).new || {};
          const oldRow: any = (payload as any).old || {};
          // Only refetch if the change concerns this pipeline (either now or before)
          if (newRow.pipeline_id === pipelineId || oldRow.pipeline_id === pipelineId) {
            fetchDeals(pipelineId);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pipelineId, fetchDeals]);

  const saveStages = useCallback(
    async (next: DealStageOption[]): Promise<boolean> => {
      if (!pipelineId) return false;
      // Normalize sortOrder + ensure canonical type resolved when possible
      const normalized = next.map((s, idx) => ({
        ...s,
        sortOrder: idx,
        isActive: s.isActive !== false,
        systemStageType: s.systemStageType || resolveSystemStageType(s) || undefined,
      }));
      const { error: updErr } = await supabase
        .from('deal_pipelines')
        .update({ stages: normalized as any })
        .eq('id', pipelineId);
      if (updErr) {
        console.error('Error saving naitive stages:', updErr);
        return false;
      }
      setStages(normalized);
      return true;
    },
    [pipelineId],
  );

  return { pipelineId, stages, deals, isLoading, error, refetch, saveStages };
}
