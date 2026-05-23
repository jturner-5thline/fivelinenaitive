import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useMeetingTitleTemplates } from './useMeetingTitleTemplates';
import { renderMeetingTitle, type MeetingTitleDeal } from '@/lib/renderMeetingTitle';

interface DealRow {
  id: string;
  company: string | null;
  stage: string | null;
  referral_source: string | null;
}

/**
 * Hydrates everything the renderer needs for a given deal and returns a
 * memoised render() helper. Safe to call without a dealId — render() will
 * then use whatever overrides are passed.
 */
export function useRenderMeetingTitle(dealId?: string | null) {
  const { user } = useAuth();
  const { stages } = useDealStages();
  const { templates, isLoading: templatesLoading } = useMeetingTitleTemplates();
  const [deal, setDeal] = useState<DealRow | null>(null);
  const [isLoadingDeal, setIsLoadingDeal] = useState(false);
  const [userMeta, setUserMeta] = useState<{ first_name: string | null; full_name: string | null }>({
    first_name: null,
    full_name: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!dealId) { setDeal(null); return; }
    setIsLoadingDeal(true);
    (async () => {
      const { data } = await supabase
        .from('deals')
        .select('id, company, stage, referral_source')
        .eq('id', dealId)
        .maybeSingle();
      if (!cancelled) setDeal((data as unknown as DealRow) ?? null);
      if (!cancelled) setIsLoadingDeal(false);
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  // Load user display name once.
  useEffect(() => {
    if (!user) return;
    const fromMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const full = (fromMeta.full_name as string) || (fromMeta.name as string) || user.email || null;
    const first = full ? String(full).split(/\s+/)[0] : null;
    setUserMeta({ first_name: first, full_name: full });
  }, [user]);

  const render = useCallback((overrides?: Partial<MeetingTitleDeal>) => {
    // deals.stage stores the stage label/id as text; try to resolve to a
    // configured stage row either by id or by case-insensitive label match.
    const rawStage = deal?.stage ?? null;
    const stage = rawStage
      ? stages.find((s) => s.id === rawStage || s.label.toLowerCase() === rawStage.toLowerCase())
      : undefined;
    const dealForRender: MeetingTitleDeal = {
      company_name: deal?.company ?? null,
      name: deal?.company ?? null,
      stage_id: stage?.id ?? rawStage,
      stage_label: stage?.label ?? rawStage,
      lender_name: null,
      partner_name: null,
      referrer_name: deal?.referral_source ?? null,
      ...overrides,
    };
    return renderMeetingTitle({
      deal: dealForRender,
      user: userMeta,
      templates,
    });
  }, [deal, stages, templates, userMeta]);

  return {
    render,
    isLoading: templatesLoading || isLoadingDeal,
    deal,
    stages,
    templates,
  };
}