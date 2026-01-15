import { useState, useEffect, useCallback, useRef } from 'react';
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
  
  // Use ref to avoid stale closure issues in callbacks
  const notificationsRef = useRef<FlexInfoNotification[]>([]);
  notificationsRef.current = notifications;

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

  const notifyFlex = useCallback(async (
    notificationId: string, 
    notificationDealId: string, 
    status: 'approved' | 'denied',
    notification: FlexInfoNotification
  ) => {
    try {
      const { error } = await supabase.functions.invoke('notify-flex-info-response', {
        body: {
          notification_id: notificationId,
          deal_id: notificationDealId,
          status,
          user_email: notification.user_email,
          lender_name: notification.lender_name,
          company_name: notification.company_name,
        },
      });
      
      if (error) {
        console.error('Error notifying Flex:', error);
      }
    } catch (error) {
      console.error('Error calling notify-flex-info-response:', error);
    }
  }, []);

  const approveAccess = useCallback(async (notificationId: string) => {
    const notification = notificationsRef.current.find(n => n.id === notificationId);
    if (!notification) return false;

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

      // Notify Flex about the approval
      notifyFlex(notificationId, notification.deal_id, 'approved', notification);

      return true;
    } catch (error) {
      console.error('Error approving access:', error);
      return false;
    }
  }, [notifyFlex]);

  const denyAccess = useCallback(async (notificationId: string) => {
    const notification = notificationsRef.current.find(n => n.id === notificationId);
    if (!notification) return false;

    try {
      const { error } = await supabase
        .from('flex_info_notifications')
        .update({ status: 'denied' })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, status: 'denied' } : n
        )
      );

      // Notify Flex about the denial
      notifyFlex(notificationId, notification.deal_id, 'denied', notification);

      return true;
    } catch (error) {
      console.error('Error denying access:', error);
      return false;
    }
  }, [notifyFlex]);

  const markAllAsRead = useCallback(async () => {
    const currentNotifications = notificationsRef.current;
    const pendingIds = currentNotifications.filter(n => n.status === 'pending').map(n => n.id);
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
  }, []);

  const pendingCount = notifications.filter(n => n.status === 'pending').length;

  return {
    notifications,
    isLoading,
    pendingCount,
    approveAccess,
    denyAccess,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
