import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCanSeeFlexSync } from '@/hooks/useCanSeeFlexSync';
import { isPostSubmissionDealStage } from '@/utils/dealStageUtils';
import { isDealNotificationSuppressedById } from '@/utils/dealNotificationSuppression';
let instanceCounter = 0;

// Batch an array into chunks to avoid URL length limits
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function useDealNotificationCounts(dealIds: string[]) {
  const { canSeeFlexSync } = useCanSeeFlexSync();
  const [flexCounts, setFlexCounts] = useState<Record<string, number>>({});
  const dealIdsKey = dealIds.join(',');
  const instanceId = useRef(++instanceCounter);

  const fetchCounts = useCallback(async () => {
    if (dealIds.length === 0 || !canSeeFlexSync) {
      setFlexCounts({});
      return;
    }

    try {
      // Batch deal ID lookups in chunks of 50 to avoid URL length limits
      const dealChunks = chunk(dealIds, 50);
      const allActiveDeals: { id: string; stage: string; status: string; pipeline_id: string | null }[] = [];

      for (const ids of dealChunks) {
        const { data: activeDeals } = await supabase
          .from('deals')
          .select('id, stage, status, pipeline_id')
          .in('id', ids);
        if (activeDeals) allActiveDeals.push(...(activeDeals as any[]));
      }

      // Filter out suppressed deals
      const nonSuppressedDeals = allActiveDeals.filter(
        (deal) => !isDealNotificationSuppressedById(deal)
      );

      const activeDealIds = nonSuppressedDeals
        .filter((deal) => isPostSubmissionDealStage(deal.stage))
        .map((deal) => deal.id);
      if (activeDealIds.length === 0) {
        setFlexCounts({});
        return;
      }

      // Batch notification lookups too
      const notifChunks = chunk(activeDealIds, 50);
      const allNotifs: { deal_id: string }[] = [];

      for (const ids of notifChunks) {
        const { data, error } = await supabase
          .from('flex_info_notifications')
          .select('deal_id, status')
          .in('deal_id', ids)
          .in('status', ['pending', 'read']);

        if (error) {
          console.error('Error fetching deal notification counts:', error);
          continue;
        }
        if (data) allNotifs.push(...(data as { deal_id: string }[]));
      }

      const counts: Record<string, number> = {};
      allNotifs.forEach((row) => {
        counts[row.deal_id] = (counts[row.deal_id] || 0) + 1;
      });
      setFlexCounts(counts);
    } catch (err) {
      console.error('Error fetching deal notification counts:', err);
    }
  }, [dealIdsKey]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Real-time subscription with unique channel name per instance
  useEffect(() => {
    if (dealIds.length === 0) return;

    const channel = supabase
      .channel(`deal-notif-counts-${instanceId.current}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flex_info_notifications',
        },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
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
