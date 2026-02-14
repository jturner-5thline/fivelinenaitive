import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useDealNotificationCounts(dealIds: string[]) {
  const [flexCounts, setFlexCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (dealIds.length === 0) return;

    const fetchCounts = async () => {
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
    };

    fetchCounts();
  }, [dealIds.join(',')]);

  return flexCounts;
}
