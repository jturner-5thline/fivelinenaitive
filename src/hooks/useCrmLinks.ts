import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Link contact to CRM company
export function useLinkContactToCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, companyId }: { contactId: string; companyId: string }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ crm_company_id: companyId } as any)
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', vars.contactId] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-contacts', vars.companyId] });
      toast.success('Contact linked to company');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to link contact'),
  });
}

// Unlink contact from company
export function useUnlinkContactFromCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, companyId }: { contactId: string; companyId?: string }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ crm_company_id: null } as any)
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', vars.contactId] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-contacts'] });
      toast.success('Contact unlinked from company');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to unlink contact'),
  });
}

// Link contact to deal
export function useLinkContactToDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, dealId }: { contactId: string; dealId: string }) => {
      const { error } = await supabase
        .from('contact_deals')
        .insert({ contact_id: contactId, deal_id: dealId } as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contact-deals', vars.contactId] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-deals'] });
      queryClient.invalidateQueries({ queryKey: ['company-affiliated-deals'] });
      toast.success('Contact linked to deal');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to link contact to deal'),
  });
}

// Unlink contact from deal
export function useUnlinkContactFromDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, dealId }: { contactId: string; dealId: string }) => {
      const { error } = await supabase
        .from('contact_deals')
        .delete()
        .eq('contact_id', contactId)
        .eq('deal_id', dealId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contact-deals', vars.contactId] });
      toast.success('Deal unlinked from contact');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to unlink deal'),
  });
}

// Link deal to CRM company
export function useLinkDealToCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, companyId }: { dealId: string; companyId: string }) => {
      const { error } = await supabase
        .from('deals')
        .update({ crm_company_id: companyId } as any)
        .eq('id', dealId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal', vars.dealId] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-deals', vars.companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-affiliated-deals'] });
      toast.success('Deal linked to company');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to link deal'),
  });
}

// Unlink deal from CRM company
export function useUnlinkDealFromCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId }: { dealId: string }) => {
      const { error } = await supabase
        .from('deals')
        .update({ crm_company_id: null } as any)
        .eq('id', dealId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deal', vars.dealId] });
      queryClient.invalidateQueries({ queryKey: ['crm-company-deals'] });
      queryClient.invalidateQueries({ queryKey: ['company-affiliated-deals'] });
      toast.success('Deal unlinked from company');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to unlink deal'),
  });
}

// Get deals linked to a CRM company
export function useCrmCompanyDeals(companyId: string | undefined) {
  return useQuery({
    queryKey: ['crm-company-deals', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, stage, status, value, closing_date')
        .eq('crm_company_id', companyId as any)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

// Get all deals (for search modals)
export function useAllDeals(enabled: boolean = true) {
  return useQuery({
    queryKey: ['all-deals-for-link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, stage, value, status')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled,
  });
}

// Get contact's CRM company
export function useContactCrmCompany(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['crm-company', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name, domain, industry, logo_url')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}
