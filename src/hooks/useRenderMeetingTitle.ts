import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useMeetingTitleTemplates } from './useMeetingTitleTemplates';
import { renderMeetingTitle, type MeetingTitleDeal } from '@/lib/renderMeetingTitle';

interface DealRow {
  id: string;
  company: string | null;
  stage_id: string | null;
  lender_name?: string | null;
  partner_name?: string | null;
  referral_source?: string | null;
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
        .select('id, company, stage_id, lender_name, partner_name, referral_source')
        .eq('id', dealId)
        .maybeSingle();
      if (!cancelled) setDeal((data as DealRow) ?? null);
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
    const stage = deal?.stage_id ? stages.find((s) => s.id === deal.stage_id) : undefined;
    const dealForRender: MeetingTitleDeal = {
      company_name: deal?.company ?? null,
      name: deal?.company ?? null,
      stage_id: deal?.stage_id ?? null,
      stage_label: stage?.label ?? null,
      lender_name: deal?.lender_name ?? null,
      partner_name: deal?.partner_name ?? null,
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