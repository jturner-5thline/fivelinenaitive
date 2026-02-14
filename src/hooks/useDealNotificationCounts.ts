import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

let instanceCounter = 0;

export function useDealNotificationCounts(dealIds: string[]) {
  const [flexCounts, setFlexCounts] = useState<Record<string, number>>({});
  const dealIdsKey = dealIds.join(',');
  const instanceId = useRef(++instanceCounter);

  const fetchCounts = useCallback(async () => {
    if (dealIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('flex_info_notifications')
        .select('deal_id, status')
        .in('deal_id', dealIds)
        .in('status', ['pending', 'read']);

      if (error) {
        console.error('Error fetching deal notification counts:', error);
        return;
      }

      const counts: Record<string, number> = {};
      (data || []).forEach((row: { deal_id: string }) => {
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

  // Fallback polling every 10s to catch missed realtime events
  useEffect(() => {
    if (dealIds.length === 0) return;

    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, [fetchCounts, dealIdsKey]);

  return flexCounts;
}
