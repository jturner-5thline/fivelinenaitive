import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ChannelTemplate {
  title?: string;
  subject?: string;
  body: string;
}

export interface ChannelConfig {
  channel_type: 'in_app' | 'email' | 'slack' | 'sms' | 'push';
  is_enabled: boolean;
  template: ChannelTemplate;
}

export interface DefaultRecipients {
  roles?: string[];
  user_ids?: string[];
  scope?: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_key: string;
  category: string;
  is_enabled: boolean;
  channels: ChannelConfig[];
  default_recipients: DefaultRecipients;
  metadata: Record<string, unknown>;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useNotificationRules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notification-rules'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_rules')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as NotificationRule[];
    },
  });
}

export function useUpdateNotificationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string } & Partial<Omit<NotificationRule, 'id' | 'created_at' | 'updated_at'>>) => {
      const { id, ...updates } = params;
      const { error } = await supabase
        .from('notification_rules')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });
}

export function useCreateNotificationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: Omit<NotificationRule, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase
        .from('notification_rules')
        .insert(params as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });
}

export function useDeleteNotificationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notification_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });
}
