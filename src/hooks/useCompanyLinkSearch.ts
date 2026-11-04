import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export function useCompanyLinkSearch(search: string, page: number, enabled: boolean) {
  const { company } = useCompany();
  const companyId = company?.id;
  return useQuery({
    queryKey: ['company-link-search', companyId, search, page],
    enabled: enabled && !!companyId,
    queryFn: async () => {
      if (!companyId) throw new Error('No workspace selected');
      let query = supabase.from('crm_companies')
        .select('id, name, domain, additional_domains', { count: 'exact' })
        .eq('org_company_id', companyId);
      // Each token can match the name or either domain field. Strip filter syntax.
      const tokens = search.trim().split(/\s+/)
        .map(token => token.replace(/[^\p{L}\p{N}.@&'_-]/gu, '')).filter(Boolean);
      for (const token of tokens) {
        query = query.or(`name.ilike.%${token}%,domain.ilike.%${token}%,additional_domains.cs.{${token.toLowerCase()}}`);
      }
      const { data, count, error } = await query.order('name').order('id').range(page * 50, page * 50 + 49);
      if (error) throw error;
      return { data: data ?? [], totalPages: Math.ceil((count ?? 0) / 50) };
    },
  });
}