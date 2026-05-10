import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FieldSuggestion {
  id: string;
  contact_id: string;
  company_id: string;
  field_name: string;
  current_value: string | null;
  suggested_value: string;
  confidence: number;
  source_type: string;
  source_id: string | null;
  source_snippet: string | null;
  status: string;
  snoozed_until: string | null;
  acted_by_user_id: string | null;
  acted_at: string | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  job_title: 'Job Title',
  email: 'Email',
  phone_work: 'Work Phone',
  phone_mobile: 'Mobile Phone',
  department: 'Department',
  seniority: 'Seniority',
  linkedin_url: 'LinkedIn',
  company_name: 'Company',
};

export function getFieldLabel(fieldName: string) {
  return FIELD_LABELS[fieldName] || fieldName;
}

export function useContactFieldSuggestions(contactId: string | undefined, status = 'pending') {
  return useQuery({
    queryKey: ['field-suggestions', contactId, status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_field_suggestions')
        .select('*')
        .eq('contact_id', contactId!)
        .eq('status', status)
        .order('confidence', { ascending: false });

      if (error) throw error;
      return (data || []) as FieldSuggestion[];
    },
    enabled: !!contactId,
  });
}

export function useAllFieldSuggestions(filters?: { status?: string; field_name?: string }) {
  return useQuery({
    queryKey: ['field-suggestions', 'all', filters],
    queryFn: async () => {
      let query = supabase
        .from('contact_field_suggestions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.field_name) query = query.eq('field_name', filters.field_name);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as FieldSuggestion[];
    },
  });
}

export function useFieldSuggestionAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action: 'accept' | 'reject' | 'snooze' | 'bulk_accept' | 'bulk_reject';
      suggestion_id?: string;
      suggestion_ids?: string[];
      snooze_until?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('field-suggestion-action', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['field-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['contact'] });
      const action = vars.action.replace('bulk_', '');
      toast.success(`Suggestion ${action}ed`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Action failed');
    },
  });
}

export function useScanContactForSuggestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      contact_id: string;
      source_type: string;
      source_id?: string;
      email_data?: any;
      company_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('field-suggestion-engine', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['field-suggestions'] });
      if (data.suggestions_created > 0) {
        toast.success(`${data.suggestions_created} suggestion(s) found`);
      } else {
        const ctx = data.scan_context;
        const evidence = ctx ? `${ctx.emailCount} email(s), ${ctx.eventCount} meeting(s) in last ${ctx.lookbackDays}d` : '';
        toast.info(
          data.no_activity
            ? `No recent activity found for this contact${evidence ? ` (${evidence})` : ''}`
            : `No changes detected${evidence ? ` — scanned ${evidence}` : ''}`
        );
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Scan failed');
    },
  });
}

// ---- CRM Update Queue ----
export interface QueueSuggestion extends FieldSuggestion {
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
}

export function usePendingSuggestionsCount() {
  return useQuery({
    queryKey: ['field-suggestions', 'pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('contact_field_suggestions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

export function useCrmUpdateQueue() {
  return useQuery({
    queryKey: ['field-suggestions', 'queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_field_suggestions')
        .select('*, contacts:contact_id(full_name, first_name, last_name, email, org_company_id), companies:company_id(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        contact_name:
          row.contacts?.full_name ||
          [row.contacts?.first_name, row.contacts?.last_name].filter(Boolean).join(' ') ||
          null,
        contact_email: row.contacts?.email ?? null,
        contact_company: row.companies?.name ?? null,
      })) as QueueSuggestion[];
    },
  });
}
