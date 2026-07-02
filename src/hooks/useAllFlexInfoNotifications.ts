import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Global list of pending FLEx info-request notifications (a lender / funding
 * source asking for access to a deal on FLEx) visible to the current user,
 * surfaced inside the Approval Queue alongside internal access requests.
 */
export interface FlexAccessRequest {
  id: string;
  deal_id: string;
  message: string | null;
  user_email: string | null;
  lender_name: string | null;
  company_name: string | null;
  status: string;
  created_at: string;
  deal_name?: string | null;
}

const KEY = ['flex-info-notifications', 'pending-global'] as const;

export function useAllFlexInfoNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`flex-info-notifications-global-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flex_info_notifications' },
        () => qc.invalidateQueries({ queryKey: KEY }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc]);

  return useQuery({
    queryKey: [...KEY, user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<FlexAccessRequest[]> => {
      const { data, error } = await supabase
        .from('flex_info_notifications')
        .select('*, deal:deals(id, company, name)')
        .in('status', ['pending', 'read'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) {
        // RLS will scope this — a permission error just means nothing to show.
        console.error('[flex-info-notifications] list', error);
        return [];
      }
      return ((data || []) as any[]).map((row) => ({
        ...row,
        deal_name: row.deal?.company || row.deal?.name || null,
      })) as FlexAccessRequest[];
    },
  });
}

async function notifyFlex(
  n: FlexAccessRequest,
  status: 'approved' | 'denied',
  denialMessage?: string,
) {
  try {
    await supabase.functions.invoke('notify-flex-info-response', {
      body: {
        notification_id: n.id,
        deal_id: n.deal_id,
        status,
        user_email: n.user_email,
        lender_name: n.lender_name,
        company_name: n.company_name,
        denial_message: denialMessage,
      },
    });
  } catch (err) {
    console.error('[flex-info-notifications] notifyFlex', err);
  }
}

export function useApproveFlexAccessRequest() {
  const qc = useQueryClient();
  return useCallback(async (n: FlexAccessRequest) => {
    const { error } = await supabase
      .from('flex_info_notifications')
      .update({ status: 'approved' })
      .eq('id', n.id);
    if (error) {
      toast.error('Could not approve access request');
      return { ok: false };
    }
    void notifyFlex(n, 'approved');
    qc.invalidateQueries({ queryKey: KEY });
    toast.success(`Approved access for ${n.lender_name || n.user_email || 'lender'}`);
    return { ok: true };
  }, [qc]);
}

export function useDeclineFlexAccessRequest() {
  const qc = useQueryClient();
  return useCallback(async (n: FlexAccessRequest, denialMessage?: string) => {
    const { error } = await supabase
      .from('flex_info_notifications')
      .update({ status: 'denied' })
      .eq('id', n.id);
    if (error) {
      toast.error('Could not decline access request');
      return { ok: false };
    }
    void notifyFlex(n, 'denied', denialMessage);
    qc.invalidateQueries({ queryKey: KEY });
    toast.message(`Declined access request from ${n.lender_name || n.user_email || 'lender'}`);
    return { ok: true };
  }, [qc]);
}