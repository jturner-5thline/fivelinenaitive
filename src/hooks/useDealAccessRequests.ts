import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Pending requests from users asking for access to a specific deal.
 * Surfaced inside the Approval Queue alongside AI suggestions and styled
 * after the lender sync-request rows on the Management tab.
 */
export type DealAccessRequestStatus = 'pending' | 'approved' | 'declined';

export interface DealAccessRequest {
  id: string;
  deal_id: string;
  requester_user_id: string | null;
  requester_email: string;
  requester_name: string | null;
  message: string | null;
  status: DealAccessRequestStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
  // Joined deal info (denormalized client-side)
  deal_name?: string | null;
}

const KEY = ['deal-access-requests', 'pending'] as const;

function useRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const flush = () => {
      timer.current = null;
      qc.invalidateQueries({ queryKey: KEY });
    };
    const ch = supabase
      .channel(`deal-access-requests-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deal_access_requests' },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 250);
        },
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);
}

/** List all pending deal access requests visible to the current user (RLS-scoped). */
export function useDealAccessRequests() {
  const { user } = useAuth();
  useRealtime();

  return useQuery({
    queryKey: [...KEY, user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DealAccessRequest[]> => {
      const { data, error } = await supabase
        .from('deal_access_requests' as any)
        .select('*, deal:deals(id, company, name)')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({
        ...row,
        deal_name: row.deal?.company || row.deal?.name || null,
      })) as DealAccessRequest[];
    },
  });
}

export function useApproveDealAccessRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(
    async (req: DealAccessRequest) => {
      if (!user) return { ok: false };
      const { error } = await supabase
        .from('deal_access_requests' as any)
        .update({
          status: 'approved',
          decided_at: new Date().toISOString(),
          decided_by: user.id,
        })
        .eq('id', req.id);
      if (error) {
        toast.error('Could not approve access request');
        return { ok: false };
      }
      qc.invalidateQueries({ queryKey: KEY });
      toast.success(`Approved access for ${req.requester_name || req.requester_email}`);
      return { ok: true };
    },
    [user, qc],
  );
}

export function useDeclineDealAccessRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(
    async (req: DealAccessRequest, note?: string) => {
      if (!user) return { ok: false };
      const { error } = await supabase
        .from('deal_access_requests' as any)
        .update({
          status: 'declined',
          decided_at: new Date().toISOString(),
          decided_by: user.id,
          decision_note: note ?? null,
        })
        .eq('id', req.id);
      if (error) {
        toast.error('Could not decline access request');
        return { ok: false };
      }
      qc.invalidateQueries({ queryKey: KEY });
      toast.message(`Declined request from ${req.requester_name || req.requester_email}`);
      return { ok: true };
    },
    [user, qc],
  );
}

export interface CreateDealAccessRequestArgs {
  deal_id: string;
  message?: string;
}

export function useCreateDealAccessRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(
    async ({ deal_id, message }: CreateDealAccessRequestArgs) => {
      if (!user) {
        toast.error('Sign in to request access');
        return null;
      }
      const { data, error } = await supabase
        .from('deal_access_requests' as any)
        .insert({
          deal_id,
          requester_user_id: user.id,
          requester_email: user.email ?? '',
          requester_name: (user.user_metadata as any)?.full_name || null,
          message: message ?? null,
        })
        .select('*')
        .single();
      if (error) {
        console.error('[deal-access-request] insert', error);
        toast.error('Could not submit access request');
        return null;
      }
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Access request submitted');
      return data as unknown as DealAccessRequest;
    },
    [user, qc],
  );
}