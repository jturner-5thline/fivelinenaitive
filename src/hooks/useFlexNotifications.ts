import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FlexNotification {
  id: string;
  user_id: string;
  deal_id: string;
  alert_type: string;
  title: string;
  message: string;
  lender_name: string | null;
  lender_email: string | null;
  engagement_score: number | null;
  read_at: string | null;
  created_at: string;
  deal_name?: string;
}

export function useFlexNotifications(limit: number = 10) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<FlexNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Fetch flex notifications with deal name
    const { data, error } = await supabase
      .from('flex_notifications')
      .select(`
        id,
        user_id,
        deal_id,
        alert_type,
        title,
        message,
        lender_name,
        lender_email,
        engagement_score,
        read_at,
        created_at,
        deals:deal_id (company)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching flex notifications:', error);
      setNotifications([]);
    } else {
      const mapped = (data || []).map((n: any) => ({
        ...n,
        deal_name: n.deals?.company,
      }));
      setNotifications(mapped);
    }

    setIsLoading(false);
  }, [user, limit]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('flex-notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'flex_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = useCallback(async (notificationIds: string[]) => {
    if (!user || notificationIds.length === 0) return;

    const { error } = await supabase
      .from('flex_notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', notificationIds)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error marking notifications as read:', error);
    } else {
      setNotifications(prev =>
        prev.map(n =>
          notificationIds.includes(n.id)
            ? { ...n, read_at: new Date().toISOString() }
            : n
        )
      );
    }
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;

    await markAsRead(unreadIds);
  }, [user, notifications, markAsRead]);

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return {
    notifications,
    isLoading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
