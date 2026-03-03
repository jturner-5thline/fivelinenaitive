import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCallback } from 'react';

// Types (not from auto-generated types since tables are new)
export interface ClientRequest {
  id: string;
  deal_id: string;
  thread_id: string | null;
  client_email: string | null;
  client_name: string | null;
  title: string;
  description: string | null;
  status: 'pending' | 'queued_for_email' | 'included_in_draft' | 'approved' | 'sent';
  draft_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  company_id: string | null;
}

export interface ClientRequestDraft {
  id: string;
  deal_id: string;
  thread_id: string | null;
  client_email: string | null;
  client_name: string | null;
  subject: string | null;
  body_html: string;
  body_text: string | null;
  status: 'needs_approval' | 'approved' | 'rejected' | 'sent';
  request_count: number;
  trigger_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_notes: string | null;
  sent_at: string | null;
  new_requests_pending: boolean;
  created_at: string;
  updated_at: string;
  company_id: string | null;
}

export interface RequestAuditEntry {
  id: string;
  draft_id: string | null;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function useClientRequests(dealId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['client-requests', dealId],
    queryFn: async () => {
      let query = supabase
        .from('client_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (dealId) query = query.eq('deal_id', dealId);
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ClientRequest[];
    },
    enabled: !!user,
  });
}

export function useClientRequestDrafts(status?: 'needs_approval' | 'approved' | 'rejected' | 'sent') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['client-request-drafts', status],
    queryFn: async () => {
      let query = supabase
        .from('client_request_drafts')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as ClientRequestDraft[];
    },
    enabled: !!user,
  });
}

export function useDraftRequests(draftId: string) {
  return useQuery({
    queryKey: ['draft-requests', draftId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_requests')
        .select('*')
        .eq('draft_id', draftId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ClientRequest[];
    },
  });
}

export function useCreateClientRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      deal_id: string;
      thread_id?: string;
      client_email?: string;
      client_name?: string;
      title: string;
      description?: string;
      company_id?: string;
    }) => {
      const { data, error } = await supabase.from('client_requests').insert({
        ...input,
        created_by: user?.id,
        status: 'pending',
      } as any).select().single();
      if (error) throw error;

      // Evaluate batch triggers after adding
      supabase.functions.invoke('evaluate-request-batch', {
        body: { mode: 'evaluate' },
      }).catch(console.error);

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-requests'] });
      toast.success('Request added');
    },
    onError: () => toast.error('Failed to add request'),
  });
}

export function useApproveDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (draftId: string) => {
      const { data, error } = await supabase.functions.invoke('evaluate-request-batch', {
        body: { mode: 'approve', draft_id: draftId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-request-drafts'] });
      qc.invalidateQueries({ queryKey: ['client-requests'] });
      toast.success('Draft approved');
    },
    onError: () => toast.error('Failed to approve draft'),
  });
}

export function useRejectDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ draftId, notes }: { draftId: string; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke('evaluate-request-batch', {
        body: { mode: 'reject', draft_id: draftId, notes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-request-drafts'] });
      qc.invalidateQueries({ queryKey: ['client-requests'] });
      toast.success('Draft rejected – requests returned to pending');
    },
    onError: () => toast.error('Failed to reject draft'),
  });
}

export function useForceGenerateDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (dealId: string) => {
      const { data, error } = await supabase.functions.invoke('evaluate-request-batch', {
        body: { mode: 'force_draft', deal_id: dealId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-request-drafts'] });
      qc.invalidateQueries({ queryKey: ['client-requests'] });
      toast.success('Draft generated');
    },
    onError: () => toast.error('Failed to generate draft'),
  });
}

/** Summary stats for pending requests */
export function usePendingRequestStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-request-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_requests')
        .select('deal_id, thread_id, client_name, created_at')
        .eq('status', 'pending');
      if (error) throw error;

      const requests = (data || []) as unknown as Pick<ClientRequest, 'deal_id' | 'thread_id' | 'client_name' | 'created_at'>[];

      // Group by deal
      const byDeal: Record<string, { count: number; oldest: string; client_name: string | null }> = {};
      for (const r of requests) {
        if (!byDeal[r.deal_id]) {
          byDeal[r.deal_id] = { count: 0, oldest: r.created_at, client_name: r.client_name };
        }
        byDeal[r.deal_id].count++;
        if (r.created_at < byDeal[r.deal_id].oldest) {
          byDeal[r.deal_id].oldest = r.created_at;
        }
      }

      return {
        totalPending: requests.length,
        byDeal,
      };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}
