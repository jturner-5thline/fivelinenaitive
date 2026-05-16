import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

const PROPOSAL_OR_BEYOND = [
  'proposal-issued', 'final-credit-items', 'terms-issued',
  'agreement-pending', 'closed-won', 'funded-invoiced',
];
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
  return useQuery({
    queryKey: ['partner_promotion_criteria', company?.id, partnerName?.toLowerCase()],
    enabled: !!company?.id && !!partnerName,
    queryFn: async (): Promise<PartnerCriteria> => {
      const name = (partnerName || '').toLowerCase();
      const now = Date.now();
      const threeMoAgo = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
      const twelveMoAgo = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();

      const { data: deals } = await supabase
        .from('deals')
        .select('id, value, stage, referred_by, sourced_via, created_at, closing_date')
        .eq('company_id', company!.id)
        .or(`referred_by.ilike.${name},sourced_via.ilike.${name}`);

      const rows = (deals || []) as Array<{ value: number | null; stage: string | null; created_at: string; closing_date: string | null }>;

      const proposalsCount = rows.filter(d =>
        d.stage && PROPOSAL_OR_BEYOND.includes(d.stage) && d.created_at >= threeMoAgo
      ).length;
      const signedCount = rows.filter(d => d.stage && SIGNED_STAGES.includes(d.stage)).length;
      const ttmRevenue = rows
        .filter(d => d.stage && SIGNED_STAGES.includes(d.stage) && (d.closing_date || d.created_at) >= twelveMoAgo)
        .reduce((s, d) => s + (d.value || 0), 0);

      const details = {
        proposals: proposalsCount >= 3,
        signed: signedCount >= 1,
        revenue: ttmRevenue >= 100_000,
      };
      const metCount = Number(details.proposals) + Number(details.signed) + Number(details.revenue);
      return { proposalsCount, signedCount, ttmRevenue, metCount, details };
    },
  });
}
