import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FlexInfoNotification {
  id: string;
  type: string;
  deal_id: string;
  message: string;
  user_email: string | null;
  lender_name: string | null;
  company_name: string | null;
  status: string;
  created_at: string;
}

export function useFlexInfoNotifications(dealId: string | undefined) {
  const [notifications, setNotifications] = useState<FlexInfoNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!dealId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('flex_info_notifications')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setNotifications((data as FlexInfoNotification[]) || []);
    } catch (error) {
      console.error('Error fetching flex info notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`flex_info_notifications:${dealId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flex_info_notifications',
          filter: `deal_id=eq.${dealId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId, fetchNotifications]);

  const approveAccess = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('flex_info_notifications')
        .update({ status: 'approved' })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, status: 'approved' } : n
        )
      );

      return true;
    } catch (error) {
      console.error('Error approving access:', error);
      return false;
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const pendingIds = notifications.filter(n => n.status === 'pending').map(n => n.id);
    if (pendingIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('flex_info_notifications')
        .update({ status: 'read' })
        .in('id', pendingIds);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n =>
          pendingIds.includes(n.id) ? { ...n, status: 'read' } : n
        )
      );
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }, [notifications]);

  const pendingCount = notifications.filter(n => n.status === 'pending').length;

  return {
    notifications,
    isLoading,
    pendingCount,
    approveAccess,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
