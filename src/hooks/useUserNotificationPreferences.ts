import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ChannelOverride {
  is_enabled: boolean;
}

export interface UserNotificationPreference {
  id: string;
  user_id: string;
  trigger_key: string;
  is_enabled: boolean;
  channel_overrides: Record<string, ChannelOverride>;
  custom_recipients: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useUserNotificationPreferences() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-notification-preferences', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      return (data || []) as unknown as UserNotificationPreference[];
    },
  });
}

export function useUpsertUserNotificationPreference() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      trigger_key: string;
      is_enabled?: boolean;
      channel_overrides?: Record<string, ChannelOverride>;
      custom_config?: Record<string, unknown>;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert(
          {
            user_id: user.id,
            trigger_key: params.trigger_key,
            is_enabled: params.is_enabled ?? true,
            channel_overrides: (params.channel_overrides ?? {}) as any,
            custom_recipients: (params.custom_config ?? null) as any,
          },
          { onConflict: 'user_id,trigger_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notification-preferences', user?.id] });
    },
  });
}

export function useResetUserNotificationPreference() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (triggerKey: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_notification_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('trigger_key', triggerKey);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notification-preferences', user?.id] });
    },
  });
}
