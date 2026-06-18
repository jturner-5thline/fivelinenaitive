import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useCanSeeFlexSync } from '@/hooks/useCanSeeFlexSync';
import { isDealNotificationSuppressedById } from '@/utils/dealNotificationSuppression';

export interface MyDealNotificationItem {
  id: string;
  deal_id: string;
  message: string;
  status: string;
  type: string;
  lender_name: string | null;
  company_name: string | null;
  user_email: string | null;
  created_at: string;
}

/**
 * Fetches the actual list of actionable FLEx info notifications for deals
 * where the current user is manager or analyst. Companion to
 * `useMyDealNotifications` (which only returns the count). Powers the
 * Deal Management bell popover so users can review and clear items
 * directly from the header.
 */
export function useMyDealNotificationItems() {
  const { profile } = useProfile();
  const { canSeeFlexSync } = useCanSeeFlexSync();
  const [items, setItems] = useState<MyDealNotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const displayName = profile?.display_name;

  const fetchItems = useCallback(async () => {
    if (!displayName || !canSeeFlexSync) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, status, stage, pipeline_id')
        .or(`manager.eq.${displayName},analyst.eq.${displayName}`);

      if (dealsError || !deals || deals.length === 0) {
        setItems([]);
        setIsLoading(false);
        return;
      }

      const activeDeals = (deals || []).filter(
        (d: any) => !isDealNotificationSuppressedById(d)
      );
      if (activeDeals.length === 0) {
        setItems([]);
        setIsLoading(false);
        return;
      }
      const dealIds = activeDeals.map((d: any) => d.id);

      const { data, error } = await supabase
        .from('flex_info_notifications')
        .select('id, deal_id, message, status, type, lender_name, company_name, user_email, created_at')
        .in('deal_id', dealIds)
        .in('status', ['pending', 'read'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching deal notification items:', error);
        setItems([]);
      } else {
        setItems((data || []) as MyDealNotificationItem[]);
      }
    } catch (err) {
      console.error('Error in useMyDealNotificationItems:', err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [displayName, canSeeFlexSync]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const channel = supabase
      .channel('my-deal-notification-items')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flex_info_notifications',
        },
        () => {
          fetchItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  return { items, isLoading, refresh: fetchItems };
}