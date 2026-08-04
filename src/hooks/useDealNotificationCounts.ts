import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startVisibilityAwareInterval } from '@/lib/visibilityAwareInterval';
let instanceCounter = 0;

// Batch an array into chunks to avoid URL length limits
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Returns a map of deal_id -> count of unresolved flag notes.
 *
 * Flex notifications are now merged into the Flag system via a DB
 * trigger (`flex_notification_to_flag`) that creates a `deal_flag_notes`
 * row for every new notification. This hook therefore reads the merged
 * surface so the per-row badge keeps reflecting attention items without
 * a separate Notifications subsystem.
 */
export function useDealNotificationCounts(dealIds: string[]) {
  const [flexCounts, setFlexCounts] = useState<Record<string, number>>({});
  const dealIdsKey = dealIds.join(',');
  const instanceId = useRef(++instanceCounter);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCounts = useCallback(async () => {
    if (dealIds.length === 0) {
      setFlexCounts({});
      return;
    }

    try {
      // Run the chunks in parallel — sequential round trips made large
      // pipelines (1,200+ deals = 13 chunks) block for seconds on load and
      // again on every realtime/poll refresh.
      const idChunks = chunk(dealIds, 150);
      const counts: Record<string, number> = {};
      const results = await Promise.all(
        idChunks.map((ids) =>
          supabase
            .from('deal_flag_notes')
            .select('deal_id')
            .in('deal_id', ids)
            .eq('resolved', false),
        ),
      );
      for (const { data, error } of results) {
        if (error) {
          console.error('Error fetching deal flag note counts:', error);
          continue;
        }
        (data as { deal_id: string }[] | null)?.forEach((row) => {
          counts[row.deal_id] = (counts[row.deal_id] || 0) + 1;
        });
      }
      setFlexCounts(counts);
    } catch (err) {
      console.error('Error fetching deal flag note counts:', err);
    }
  }, [dealIdsKey]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Real-time subscription with unique channel name per instance
  useEffect(() => {
    if (dealIds.length === 0) return;

    const channel = supabase
      .channel(`deal-flag-counts-${instanceId.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_flag_notes',
        },
        () => {
          // Coalesce bursts of flag-note writes (e.g. the auto-stale
          // reconcile) into a single refetch instead of one per row.
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => fetchCounts(), 1500);
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts, dealIdsKey]);

  // Fallback polling every 60s (reduced from 10s to avoid excessive requests).
  // Visibility-gated: pauses when the tab is hidden and re-fires on focus
  // so a backgrounded tab doesn't pile up Supabase queries across hours.
  useEffect(() => {
    if (dealIds.length === 0) return;
    return startVisibilityAwareInterval(fetchCounts, 60_000);
  }, [fetchCounts, dealIdsKey]);

  return flexCounts;
}
