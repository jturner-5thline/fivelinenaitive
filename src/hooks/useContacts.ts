import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { applyFiltersToQuery } from '@/lib/filterUtils';

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  additional_emails: string[];
  phone_work: string | null;
  phone_mobile: string | null;
  phone_other: string | null;
  job_title: string | null;
  department: string | null;
  seniority: string | null;
  timezone: string | null;
  locale: string | null;
  lifecycle_stage: string;
  status: string;
  buying_role: string | null;
  contact_score: number;
  behavioral_score: number;
  fit_score: number;
  owner_user_id: string | null;
  sdr_owner_id: string | null;
  ae_owner_id: string | null;
  primary_company_id: string | null;
  lead_source: string | null;
  lead_source_original: string | null;
  lead_source_latest: string | null;
  campaign: string | null;
  last_activity_date: string | null;
  last_outbound_touch_date: string | null;
  last_inbound_activity_date: string | null;
  next_activity_date: string | null;
  preferred_channel: string | null;
  email_opt_in: boolean;
  phone_opt_in: boolean;
  sms_opt_in: boolean;
  linkedin_url: string | null;
  website_url: string | null;
  contact_type: string | null;
  description: string | null;
  hubspot_contact_id: string | null;
  source_system: string | null;
  migrated_from_hubspot: boolean;
  synced_with_hubspot: boolean;
  custom_fields: Record<string, any>;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  org_company_id: string | null;
  // Dynamic HubSpot columns
  [key: string]: any;
  // Joined
  primary_company?: { id: string; name: string; industry: string | null } | null;
  sdr_owner?: { display_name: string | null; avatar_url: string | null } | null;
  ae_owner?: { display_name: string | null; avatar_url: string | null } | null;
}

const LIST_COLUMNS = 'id, first_name, last_name, full_name, email, phone_work, phone_mobile, job_title, contact_type, linkedin_url, lifecycle_stage, status, contact_score, primary_company_id, lead_source, last_activity_date, created_at, hubspot_contact_id, synced_with_hubspot, crm_company_id, owner_user_id, hs_city, hs_state, hs_industry, hs_contact_status, hs_contact_type, hs_company_name, hs_notes_last_contacted, hs_hs_email_optout, email_domain_normalized, crm_company:crm_companies!crm_company_id(id, name)';

export interface ContactsListParams {
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

export function useContacts(params: ContactsListParams = {}) {
  const { company } = useCompany();
  const { page = 0, pageSize = 50, search, lifecycleStage, status, quickFilter, advancedFilters = [], matchMode = 'all' } = params;

  return useQuery<PaginatedResult<Contact>>({
    queryKey: ['contacts', company?.id, page, pageSize, search, lifecycleStage, status, quickFilter, advancedFilters, matchMode],
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select(LIST_COLUMNS, { count: 'exact' })
        .eq('org_company_id', company!.id);

      // Server-side search
      if (search?.trim()) {
        const s = search.trim();
        const parts = s.split(/\s+/).filter(Boolean);
        let ors: string[] = [
          `full_name.ilike.%${s}%`,
          `first_name.ilike.%${s}%`,
          `last_name.ilike.%${s}%`,
          `email.ilike.%${s}%`,
          `job_title.ilike.%${s}%`,
          `linkedin_url.ilike.%${s}%`,
          `contact_type.ilike.%${s}%`,
        ];
        // Keep multi-word searches precise so "Mike Ferraro" is not buried behind every Mike or Ferraro.
        if (parts.length >= 2) {
          ors = [
            `full_name.ilike.%${s}%`,
            `email.ilike.%${s}%`,
            `job_title.ilike.%${s}%`,
            `linkedin_url.ilike.%${s}%`,
            `contact_type.ilike.%${s}%`,
            `and(first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[parts.length - 1]}%)`,
          ];
        }
        query = query.or(ors.join(','));
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
          case 'new_leads':
            query = query.eq('status', 'new');
            break;
          case 'meeting_scheduled':
            query = query.eq('status', 'meeting_scheduled');
            break;
          case 'high_score':
            query = query.gte('contact_score', 70);
            break;
          case 'no_activity_7d': {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
            query = query.or(`last_activity_date.is.null,last_activity_date.lt.${sevenDaysAgo}`);
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
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      const totalCount = count ?? 0;
      return {
        data: (data || []) as unknown as Contact[],
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

export function useContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (error) throw error;
      return data as Contact;
    },
    enabled: !!contactId,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (contact: Partial<Contact>) => {
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          ...contact,
          created_by: user?.id,
          org_company_id: company?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created');
      // Fire-and-forget: kick off AI enrichment scan against recent activity.
      if (data?.id) {
        supabase.functions
          .invoke('field-suggestion-engine', {
            body: {
              contact_id: data.id,
              source_type: 'new_contact_enrichment',
              company_id: data.org_company_id,
            },
          })
          .then(() => queryClient.invalidateQueries({ queryKey: ['field-suggestions'] }))
          .catch((e) => console.warn('[contact enrichment] failed', e));
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create contact');
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update({ ...updates, last_modified_by: user?.id } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', vars.id] });
      toast.success('Contact updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update contact');
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact deleted');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete contact');
    },
  });
}

export function useContactActivities(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-activities', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('contact_activities')
        .select('*')
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId,
  });
}

export function useCreateContactActivity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (activity: { contact_id: string; activity_type: string; subject?: string; body?: string; deal_id?: string }) => {
      const { data, error } = await supabase
        .from('contact_activities')
        .insert({ ...activity, logged_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', vars.contact_id] });
    },
  });
}

export function useContactDeals(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-deals', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('contact_deals')
        .select('*, deal:deals(id, company, stage, value, closing_date, status)')
        .eq('contact_id', contactId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId,
  });
}

export const LIFECYCLE_STAGES = [
  { value: 'subscriber', label: 'Subscriber' },
  { value: 'lead', label: 'Lead' },
  { value: 'mql', label: 'MQL' },
  { value: 'sql', label: 'SQL' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'customer', label: 'Customer' },
  { value: 'evangelist', label: 'Evangelist' },
  { value: 'other', label: 'Other' },
];

export const CONTACT_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'working', label: 'Working' },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { value: 'no_show', label: 'No Show' },
  { value: 'no_fit', label: 'No Fit' },
  { value: 'nurture', label: 'Nurture' },
  { value: 'bad_data', label: 'Bad Data' },
  { value: 'converted', label: 'Converted' },
  { value: 'closed', label: 'Closed' },
];

export const BUYING_ROLES = [
  { value: 'economic_buyer', label: 'Economic Buyer' },
  { value: 'champion', label: 'Champion' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'user', label: 'User' },
  { value: 'blocker', label: 'Blocker' },
  { value: 'legal', label: 'Legal' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' },
];
