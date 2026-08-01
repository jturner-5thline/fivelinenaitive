import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const normalize = (s: string) =>
  s.toLowerCase().replace(/\b(inc|llc|lp|ltd|corp|corporation|company|co|partners|capital|group|holdings)\b/g, '')
    .replace(/[^a-z0-9]/g, '').trim();

/**
 * Resolves whether a CRM company is also a funding source (master_lenders row).
 * Links by crm_company_id first; falls back to name/domain matching and
 * back-fills the link so the two records stay the same entity, not duplicates.
 */
export function useCompanyFundingSource(companyId?: string, companyName?: string, domain?: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['company-funding-source', companyId, companyName, domain],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: linked } = await supabase
        .from('master_lenders')
        .select('id, name, crm_company_id')
        .eq('crm_company_id', companyId!)
        .maybeSingle();
      if (linked) return linked;

      if (!companyName) return null;
      const { data: candidates } = await supabase
        .from('master_lenders')
        .select('id, name, website, crm_company_id')
        .is('crm_company_id', null)
        .limit(500);

      const target = normalize(companyName);
      const host = (domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      const match = (candidates || []).find((l: any) => {
        const n = normalize(l.name || '');
        if (n && (n === target || n.includes(target) || target.includes(n))) return true;
        if (host && l.website) {
          const lh = String(l.website).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
          if (lh && lh === host) return true;
        }
        return false;
      });
      if (!match) return null;

      await supabase.from('master_lenders').update({ crm_company_id: companyId }).eq('id', match.id);
      qc.invalidateQueries({ queryKey: ['master-lenders'] });
      return match;
    },
  });
}
