import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationRead {
  notification_type: string;
  notification_id: string;
}

export function useNotificationReads() {
  const { user } = useAuth();
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Create a unique key for a notification
  const getKey = (type: string, id: string) => `${type}:${id}`;

  const fetchReadNotifications = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('notification_reads')
      .select('notification_type, notification_id')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching notification reads:', error);
    } else {
      const readSet = new Set(
        data?.map(r => getKey(r.notification_type, r.notification_id)) || []
      );
      setReadNotifications(readSet);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchReadNotifications();
  }, [fetchReadNotifications]);

  const isRead = useCallback((type: string, id: string): boolean => {
    return readNotifications.has(getKey(type, id));
  }, [readNotifications]);

  const markAsRead = useCallback(async (notifications: NotificationRead[]) => {
    if (!user || notifications.length === 0) return;

    const inserts = notifications
      .filter(n => !isRead(n.notification_type, n.notification_id))
      .map(n => ({
        user_id: user.id,
        notification_type: n.notification_type,
        notification_id: n.notification_id,
      }));

    if (inserts.length === 0) return;

    const { error } = await supabase
      .from('notification_reads')
      .upsert(inserts, { onConflict: 'user_id,notification_type,notification_id' });

    if (error) {
      console.error('Error marking notifications as read:', error);
    } else {
      setReadNotifications(prev => {
        const next = new Set(prev);
        inserts.forEach(n => next.add(getKey(n.notification_type, n.notification_id)));
        return next;
      });
    }
  }, [user, isRead]);

  const markAllAsRead = useCallback(async (notifications: NotificationRead[]) => {
    await markAsRead(notifications);
  }, [markAsRead]);

  return {
    isRead,
    markAsRead,
    markAllAsRead,
    isLoading,
    refresh: fetchReadNotifications,
  };
}
