import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AffiliatedDealRow {
  id: string;
  company: string | null;
  stage: string | null;
  status: string | null;
  value: number | null;
  closing_date: string | null;
  /** How the deal is related to this company */
  via: 'company' | 'contact';
}

/**
 * Deals tagged to a CRM company — either linked directly (deals.crm_company_id)
 * or affiliated through one of the company's contacts (contact_deals).
 */
export function useCompanyAffiliatedDeals(companyId?: string, contactIds: string[] = []) {
  const idsKey = [...contactIds].sort().join(',');
  return useQuery({
    queryKey: ['company-affiliated-deals', companyId, idsKey],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<AffiliatedDealRow[]> => {
      const select = 'id, company, stage, status, value, closing_date';

      const { data: direct, error } = await supabase
        .from('deals')
        .select(select)
        .eq('crm_company_id', companyId as any)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const byId = new Map<string, AffiliatedDealRow>();
      for (const d of direct || []) byId.set((d as any).id, { ...(d as any), via: 'company' });

      if (contactIds.length) {
        const { data: links } = await supabase
          .from('contact_deals')
          .select('deal_id')
          .in('contact_id', contactIds);
        const dealIds = Array.from(
          new Set((links || []).map((l: any) => l.deal_id).filter(Boolean))
        ).filter((id) => !byId.has(id));
        if (dealIds.length) {
          const { data: viaContacts } = await supabase
            .from('deals')
            .select(select)
            .in('id', dealIds);
          for (const d of viaContacts || []) {
            if (!byId.has((d as any).id)) byId.set((d as any).id, { ...(d as any), via: 'contact' });
          }
        }
      }

      return Array.from(byId.values());
    },
  });
}
