import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isDealStaleByBusinessDays } from '@/lib/dealFreshness';

/**
 * Returns the most recent `status_change` / `stage_change` timestamp for a
 * batch of deals so the left-column pipeline tile can show a soft "stale"
 * glow when more than `STALE_BUSINESS_DAYS` business days have elapsed.
 */

export const DEAL_FRESHNESS_QUERY_KEY = ['deal-freshness'] as const;

export interface DealFreshnessMap {
  /** dealId → ISO timestamp of most recent status/stage change. */
  lastChange: Map<string, string>;
  /** dealId → boolean (true when stale by business days). */
  isStale: Map<string, boolean>;
}

export function useDealFreshness(dealIds: string[]) {
  const qc = useQueryClient();
  const idsKey = useMemo(
    () => dealIds.filter(Boolean).slice().sort().join(','),
    [dealIds],
  );

  // Realtime: any new status_change / stage_change activity log invalidates
  // the freshness cache so the left-column tile glow recomputes immediately
  // regardless of where the edit happened.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!idsKey) return;
    const flush = () => {
      timer.current = null;
      qc.invalidateQueries({ queryKey: DEAL_FRESHNESS_QUERY_KEY });
    };
    const ch = supabase
      .channel(`deal-freshness-${idsKey.slice(0, 24)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        (payload) => {
          const row = payload?.new as { activity_type?: string; deal_id?: string } | undefined;
          if (!row) return;
          if (row.activity_type !== 'status_change' && row.activity_type !== 'stage_change') return;
          if (!row.deal_id || !idsKey.split(',').includes(row.deal_id)) return;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 150);
        },
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [idsKey, qc]);

  return useQuery({
    queryKey: [...DEAL_FRESHNESS_QUERY_KEY, idsKey],
    enabled: dealIds.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DealFreshnessMap> => {
      const ids = idsKey ? idsKey.split(',') : [];
      if (ids.length === 0) {
        return { lastChange: new Map(), isStale: new Map() };
      }
      const { data, error } = await supabase
        .from('activity_logs')
        .select('deal_id, activity_type, created_at')
        .in('deal_id', ids)
        .in('activity_type', ['status_change', 'stage_change'])
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;

      const lastChange = new Map<string, string>();
      for (const row of data || []) {
        if (!row.deal_id || !row.created_at) continue;
        // Rows are pre-sorted desc, so the first hit per deal wins.
        if (!lastChange.has(row.deal_id)) {
          lastChange.set(row.deal_id, row.created_at as string);
        }
      }
      const now = new Date();
      const isStale = new Map<string, boolean>();
      for (const [id, ts] of lastChange) {
        isStale.set(id, isDealStaleByBusinessDays(ts, undefined, now));
      }
      return { lastChange, isStale };
    },
  });
}

/**
 * Invalidate the deal freshness cache after a status or stage edit so the
 * left-column tile re-evaluates the glow immediately.
 */
export function useInvalidateDealFreshness() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: DEAL_FRESHNESS_QUERY_KEY });
}