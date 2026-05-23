import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { usePartnerRules, DEFAULT_PARTNER_RULES } from '@/hooks/usePartnerRules';
import { filterDealsForPartner } from '@/lib/partnerNameMatch';

const SIGNED_STAGES = ['final-credit-items', 'closed-won', 'funded-invoiced', 'terms-issued', 'agreement-pending'];

export interface PartnerCriteria {
  proposalsCount: number; // trailing 3 mo
  signedCount: number;    // any time
  ttmRevenue: number;     // trailing 12 mo
  metCount: number;       // of 3
  details: { proposals: boolean; signed: boolean; revenue: boolean };
}

export function usePartnerPromotionCriteria(partnerName?: string | null) {
  const { company } = useCompany();
  const { data: rules } = usePartnerRules();
  const ap = (rules?.stages.activePartner) || DEFAULT_PARTNER_RULES.stages.activePartner;
  const qualifiedStages = (rules?.tiers.qualifiedDealStages) || DEFAULT_PARTNER_RULES.tiers.qualifiedDealStages;
  return useQuery({
    queryKey: ['partner_promotion_criteria', company?.id, partnerName?.toLowerCase(), ap, qualifiedStages],
    enabled: !!company?.id && !!partnerName,
    queryFn: async (): Promise<PartnerCriteria> => {
      const name = (partnerName || '').toLowerCase();
      const now = Date.now();
      const proposalWindow = new Date(now - ap.referralToProposalMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
      const signedWindow = new Date(now - ap.signedClientMonths * 30 * 24 * 60 * 60 * 1000).toISOString();
      const revenueWindow = new Date(now - ap.referredRevenueMonths * 30 * 24 * 60 * 60 * 1000).toISOString();

      // Match partner -> deals client-side via shared fuzzy matcher.
      const { data: deals } = await supabase
        .from('deals')
        .select('id, value, stage, referred_by, sourced_via, created_at, closing_date')
        .eq('company_id', company!.id)
        .or('referred_by.not.is.null,sourced_via.not.is.null');

      const rows = filterDealsForPartner(
        (deals || []) as Array<{
          value: number | null;
          stage: string | null;
          referred_by: string | null;
          sourced_via: string | null;
          created_at: string;
          closing_date: string | null;
        }>,
        partnerName || '',
      );

      const proposalsCount = rows.filter(d =>
        d.stage && qualifiedStages.includes(d.stage) && d.created_at >= proposalWindow
      ).length;
      const signedCount = rows.filter(d =>
        d.stage && SIGNED_STAGES.includes(d.stage) && (d.closing_date || d.created_at) >= signedWindow
      ).length;
      const ttmRevenue = rows
        .filter(d => d.stage && SIGNED_STAGES.includes(d.stage) && (d.closing_date || d.created_at) >= revenueWindow)
        .reduce((s, d) => s + (d.value || 0), 0);

      const details = {
        proposals: proposalsCount >= ap.referralToProposalThreshold,
        signed: signedCount >= ap.signedClientThreshold,
        revenue: ttmRevenue >= ap.referredRevenueThreshold,
      };
      const metCount = Number(details.proposals) + Number(details.signed) + Number(details.revenue);
      return { proposalsCount, signedCount, ttmRevenue, metCount, details };
    },
  });
}
