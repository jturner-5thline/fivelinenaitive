import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

export type ChannelType = Database['public']['Enums']['channel_type'];

export interface ChannelEntry {
  id: string;
  company_id: string;
  channel_type: ChannelType;
  contact_id: string | null;
  crm_company_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined data
  contact?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone_work: string | null;
    phone_mobile: string | null;
    job_title: string | null;
    crm_company_id: string | null;
  } | null;
  crm_company?: {
    id: string;
    name: string;
    domain: string | null;
    phone: string | null;
    main_contact_email: string | null;
    industry: string | null;
  } | null;
}

export function useChannelEntries() {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['channel_entries', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_entries')
        .select(`
          *,
          contact:contacts!channel_entries_contact_id_fkey(id, full_name, email, phone_work, phone_mobile, job_title, crm_company_id),
          crm_company:crm_companies!channel_entries_crm_company_id_fkey(id, name, domain, phone, main_contact_email, industry)
        `)
        .eq('company_id', company!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ChannelEntry[];
    },
  });
}

export function useCreateChannelEntry() {
  const { company } = useCompany();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (values: { channel_type: ChannelType; contact_id?: string | null; crm_company_id?: string | null; notes?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('channel_entries')
        .insert({
          company_id: company!.id,
          channel_type: values.channel_type,
          contact_id: values.contact_id || null,
          crm_company_id: values.crm_company_id || null,
          notes: values.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel_entries'] });
      toast.success('Company added to channel');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateChannelEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; channel_type?: ChannelType; contact_id?: string | null; crm_company_id?: string | null; notes?: string | null }) => {
      const { error } = await supabase
        .from('channel_entries')
        .update(values)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel_entries'] });
      toast.success('Company updated');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteChannelEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('channel_entries')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel_entries'] });
      toast.success('Company removed from channel');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useSearchContacts(search: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['channel_search_contacts', company?.id, search],
    enabled: !!company?.id && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, email, phone_work, job_title, crm_company_id, primary_company_id')
        .eq('org_company_id', company!.id)
        .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useSearchCrmCompanies(search: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['channel_search_crm_companies', company?.id, search],
    enabled: !!company?.id && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_companies')
        .select('id, name, domain, phone, main_contact_email, industry')
        .eq('org_company_id', company!.id)
        .ilike('name', `%${search}%`)
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });
}
