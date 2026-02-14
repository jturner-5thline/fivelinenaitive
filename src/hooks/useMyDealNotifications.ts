import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';

/**
 * Fetches the total count of actionable FLEx info notifications
 * for deals where the current user is the manager or analyst.
 */
export function useMyDealNotifications() {
  const { profile } = useProfile();
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const displayName = profile?.display_name;

  const fetchCount = useCallback(async () => {
    if (!displayName) {
      setCount(0);
      setIsLoading(false);
      return;
    }

    try {
      // Find deals where current user is manager or analyst
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id')
        .or(`manager.eq.${displayName},analyst.eq.${displayName}`);

      if (dealsError) {
        console.error('Error fetching user deals for notifications:', dealsError);
        setIsLoading(false);
        return;
      }

      if (!deals || deals.length === 0) {
        setCount(0);
        setIsLoading(false);
        return;
      }

      const dealIds = deals.map(d => d.id);

      // Count pending/read flex info notifications for those deals
      const { count: notifCount, error: notifError } = await supabase
        .from('flex_info_notifications')
        .select('id', { count: 'exact', head: true })
        .in('deal_id', dealIds)
        .in('status', ['pending', 'read']);

      if (notifError) {
        console.error('Error fetching deal notification count:', notifError);
        setIsLoading(false);
        return;
      }

      setCount(notifCount || 0);
    } catch (err) {
      console.error('Error in useMyDealNotifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [displayName]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Subscribe to realtime changes on flex_info_notifications
  useEffect(() => {
    const channel = supabase
      .channel('my-deal-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flex_info_notifications',
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return { count, isLoading, refresh: fetchCount };
}
