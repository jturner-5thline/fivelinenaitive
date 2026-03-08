import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

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
  // Joined
  primary_company?: { id: string; name: string; industry: string | null } | null;
  sdr_owner?: { display_name: string | null; avatar_url: string | null } | null;
  ae_owner?: { display_name: string | null; avatar_url: string | null } | null;
}

export function useContacts() {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['contacts', company?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Contact[];
    },
    enabled: !!company?.id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created');
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
        .select('*, deal:deals(id, company, stage, value, close_date, status)')
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
