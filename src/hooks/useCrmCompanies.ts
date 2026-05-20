import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { applyFiltersToQuery } from '@/lib/filterUtils';

export interface CrmCompany {
  id: string;
  name: string;
  domain: string | null;
  additional_domains: string[];
  logo_url: string | null;
  company_type: string;
  status: string;
  owner_user_id: string | null;
  industry: string | null;
  sub_industry: string | null;
  employee_count: number | null;
  employee_range: string | null;
  annual_revenue: number | null;
  revenue_band: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  hq_postal_code: string | null;
  regions_served: string[];
  parent_company_id: string | null;
  customer_tier: string | null;
  segment: string | null;
  lifecycle_stage: string;
  arr: number | null;
  mrr: number | null;
  total_contract_value: number | null;
  recent_deal_amount: number | null;
  recent_deal_close_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  renewal_date: string | null;
  key_products: string[];
  description: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  phone: string | null;
  main_contact_email: string | null;
  tags: string[];
  last_activity_date: string | null;
  next_activity_date: string | null;
  hubspot_company_id: string | null;
  external_ids: Record<string, any>;
  source_system: string | null;
  migrated_from_hubspot: boolean;
  synced_with_hubspot: boolean;
  custom_fields: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  org_company_id: string | null;
  address: string | null;
  hq_address: string | null;
  notes: string | null;
}

export const CRM_COMPANY_TYPES = [
  { value: 'customer', label: 'Customer' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'partner', label: 'Partner' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'internal', label: 'Internal' },
  { value: 'other', label: 'Other' },
];

export const CRM_COMPANY_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'target', label: 'Target' },
  { value: 'churned', label: 'Churned' },
];

export const CRM_COMPANY_LIFECYCLES = [
  { value: 'target', label: 'Target' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'customer', label: 'Customer' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'churn_risk', label: 'Churn Risk' },
];

const LIST_COLUMNS = 'id, name, domain, logo_url, industry, lifecycle_stage, status, segment, annual_revenue, arr, employee_range, company_type, created_at, hubspot_company_id, synced_with_hubspot, hq_city, hq_country, last_activity_date, renewal_date, owner_user_id, website_url, linkedin_url, phone, address, hq_address, notes';

export interface CrmCompaniesListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  lifecycleStage?: string;
  status?: string;
  quickFilter?: string;
  advancedFilters?: FilterRule[];
  matchMode?: MatchMode;
}

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useCrmCompanies(params: CrmCompaniesListParams = {}) {
  const { company } = useCompany();
  const { page = 0, pageSize = 50, search, lifecycleStage, status, quickFilter, advancedFilters = [], matchMode = 'all' } = params;

  return useQuery<PaginatedResult<CrmCompany>>({
    queryKey: ['crm-companies', company?.id, page, pageSize, search, lifecycleStage, status, quickFilter, advancedFilters, matchMode],
    queryFn: async () => {
      let query = supabase
        .from('crm_companies')
        .select(LIST_COLUMNS, { count: 'exact' })
        .eq('org_company_id', company!.id);

      // Server-side search
      if (search?.trim()) {
        query = query.or(
          `name.ilike.%${search}%,domain.ilike.%${search}%,industry.ilike.%${search}%,address.ilike.%${search}%,hq_address.ilike.%${search}%,notes.ilike.%${search}%,website_url.ilike.%${search}%,linkedin_url.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }

      // Server-side filters
      if (lifecycleStage && lifecycleStage !== 'all') {
        query = query.eq('lifecycle_stage', lifecycleStage as any);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status as any);
      }

      // Quick filters (tab filters from the page)
      if (quickFilter && quickFilter !== 'all') {
        switch (quickFilter) {
          case 'customers':
            query = query.eq('lifecycle_stage', 'customer');
            break;
          case 'prospects':
            query = query.eq('company_type', 'prospect');
            break;
          case 'churn_risk':
            query = query.eq('lifecycle_stage', 'churn_risk');
            break;
          case 'no_activity_30d':
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
            query = query.or(`last_activity_date.is.null,last_activity_date.lt.${thirtyDaysAgo}`);
            break;
          case 'renewal_90d': {
            const now = new Date().toISOString();
            const ninetyDays = new Date(Date.now() + 90 * 86400000).toISOString();
            query = query.gt('renewal_date', now).lt('renewal_date', ninetyDays);
            break;
          }
        }
      }

      // Advanced filters
      if (advancedFilters.length > 0) {
        query = applyFiltersToQuery(query, advancedFilters, matchMode);
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const totalCount = count ?? 0;
      return {
        data: (data || []) as CrmCompany[],
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    },
    enabled: !!company?.id,
    placeholderData: (prev) => prev,
  });
}

export function useCrmCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['crm-company', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('crm_companies')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as CrmCompany;
    },
    enabled: !!id,
  });
}

export function useCreateCrmCompany() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (input: Partial<CrmCompany>) => {
      const { data, error } = await supabase
        .from('crm_companies')
        .insert({ ...input, created_by: user?.id, org_company_id: company?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
      toast.success('Company created');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to create company'),
  });
}

export function useUpdateCrmCompany() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CrmCompany> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_companies')
        .update({ ...updates, last_modified_by: user?.id } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
      queryClient.invalidateQueries({ queryKey: ['crm-company', vars.id] });
      toast.success('Company updated');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update company'),
  });
}

export function useDeleteCrmCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
      toast.success('Company deleted');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete company'),
  });
}

export function useCrmCompanyActivities(companyId: string | undefined) {
  return useQuery({
    queryKey: ['crm-company-activities', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('crm_company_activities')
        .select('*')
        .eq('crm_company_id', companyId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

export function useCreateCrmCompanyActivity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (activity: { crm_company_id: string; activity_type: string; subject?: string; body?: string; deal_id?: string; contact_id?: string }) => {
      const { data, error } = await supabase
        .from('crm_company_activities')
        .insert({ ...activity, logged_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm-company-activities', vars.crm_company_id] });
    },
  });
}

// Get contacts linked to a CRM company
export function useCrmCompanyContacts(companyId: string | undefined) {
  return useQuery({
    queryKey: ['crm-company-contacts', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, job_title, buying_role, last_activity_date')
        .eq('crm_company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });
}

// Get subsidiaries
export function useCrmSubsidiaries(parentId: string | undefined) {
  return useQuery({
    queryKey: ['crm-subsidiaries', parentId],
    queryFn: async () => {
      if (!parentId) return [];
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name, domain, lifecycle_stage, arr')
        .eq('parent_company_id', parentId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!parentId,
  });
}
