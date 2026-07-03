import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ClaapQuotaStatus {
  callsMade: number;
  dailyLimit: number;
  protectMode: boolean;
  outOfQuota: boolean;
  resetAt: string | null;
  lastSyncedAt: string | null;
}

/**
 * Reads the current daily Claap API quota (from the `claap_quota_status`
 * SQL function) plus the most recent successful hydration timestamp — used
 * to render the "Claap sync paused — last synced at X" banner when we're
 * out of quota.
 */
export function useClaapQuotaStatus() {
  return useQuery({
    queryKey: ['claap-quota-status'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<ClaapQuotaStatus> => {
      const [{ data: quota }, { data: lastRow }] = await Promise.all([
        supabase.rpc('claap_quota_status'),
        supabase
          .from('claap_recordings')
          .select('hydrated_at')
          .eq('hydration_complete', true)
          .order('hydrated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const row = Array.isArray(quota) ? quota[0] : quota;
      return {
        callsMade: row?.calls_made ?? 0,
        dailyLimit: row?.daily_limit ?? 1000,
        protectMode: !!row?.protect_mode,
        outOfQuota: !!row?.out_of_quota,
        resetAt: row?.reset_at ?? null,
        lastSyncedAt: (lastRow as any)?.hydrated_at ?? null,
      };
    },
  });
}

/**
 * "Refresh when available" — enqueues a high-priority refresh for a specific
 * recording. Inside daily quota it fires immediately; when we're out, the
 * edge function stores `refresh_requested_at` and the next post-reset run of
 * `claap-bulk-sync` picks it up first.
 */
export function useRequestClaapRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recordingRowId: string) => {
      const { data, error } = await supabase.functions.invoke('claap-sync-recording-content', {
        body: { recording_id: recordingRowId, priority: 'high' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['claap-quota-status'] });
      qc.invalidateQueries({ queryKey: ['claap-recordings'] });
    },
  });
}