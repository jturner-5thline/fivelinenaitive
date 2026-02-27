import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface NotificationInstance {
  id: string;
  rule_id: string | null;
  trigger_key: string;
  recipient_user_id: string;
  channel_type: string;
  status: string;
  title: string | null;
  body: string | null;
  rendered_data: Record<string, unknown>;
  context: Record<string, unknown>;
  actor_user_id: string | null;
  provider_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export function useInAppNotifications(limit = 50) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['in-app-notifications', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notification_instances')
        .select('*')
        .eq('recipient_user_id', user.id)
        .eq('channel_type', 'in_app')
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as NotificationInstance[];
    },
  });

  // Subscribe to realtime for new in-app notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`in-app-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_instances',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['in-app-notifications', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const unreadCount = (query.data || []).filter(n => !n.read_at).length;

  return { ...query, unreadCount };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notification_instances')
        .update({ read_at: new Date().toISOString() } as any)
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['in-app-notifications', user?.id] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from('notification_instances')
        .update({ read_at: new Date().toISOString() } as any)
        .eq('recipient_user_id', user.id)
        .eq('channel_type', 'in_app')
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['in-app-notifications', user?.id] });
    },
  });
}
