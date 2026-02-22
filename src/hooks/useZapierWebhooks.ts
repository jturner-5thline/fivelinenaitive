import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export const ZAPIER_EVENT_TYPES = [
  { value: 'deal_created', label: 'Deal Created' },
  { value: 'deal_stage_change', label: 'Deal Stage Changed' },
  { value: 'deal_closed', label: 'Deal Closed' },
  { value: 'deal_updated', label: 'Deal Updated' },
  { value: 'lender_added', label: 'Lender Added' },
  { value: 'lender_stage_change', label: 'Lender Stage Changed' },
  { value: 'milestone_completed', label: 'Milestone Completed' },
  { value: 'milestone_added', label: 'Milestone Added' },
  { value: 'task_created', label: 'Task Created' },
  { value: 'task_assigned', label: 'Task Assigned' },
] as const;

export type ZapierEventType = typeof ZAPIER_EVENT_TYPES[number]['value'];

export interface ZapierWebhook {
  id: string;
  user_id: string;
  company_id: string | null;
  label: string;
  webhook_url: string;
  is_active: boolean;
  event_types: string[];
  created_at: string;
  updated_at: string;
}

export interface ZapierWebhookLog {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  status_code: number | null;
  response_body: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export function useZapierWebhooks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const webhooksQuery = useQuery({
    queryKey: ['zapier-webhooks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zapier_webhooks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ZapierWebhook[];
    },
    enabled: !!user,
  });

  const createWebhook = useMutation({
    mutationFn: async (input: { label: string; webhook_url: string; event_types: string[] }) => {
      const { data, error } = await supabase
        .from('zapier_webhooks')
        .insert({
          user_id: user!.id,
          label: input.label,
          webhook_url: input.webhook_url,
          event_types: input.event_types,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zapier-webhooks'] });
      toast({ title: 'Webhook added', description: 'Your Zapier webhook has been configured.' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async (input: { id: string; label?: string; webhook_url?: string; event_types?: string[]; is_active?: boolean }) => {
      const { id, ...updates } = input;
      const { error } = await supabase
        .from('zapier_webhooks')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zapier-webhooks'] });
      toast({ title: 'Webhook updated' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('zapier_webhooks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zapier-webhooks'] });
      toast({ title: 'Webhook deleted' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const testWebhook = useMutation({
    mutationFn: async (webhookId: string) => {
      const webhook = webhooksQuery.data?.find(w => w.id === webhookId);
      if (!webhook) throw new Error('Webhook not found');

      const response = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          event_type: 'test',
          timestamp: new Date().toISOString(),
          message: 'Test event from Naitive',
          triggered_from: window.location.origin,
        }),
      });

      return { sent: true };
    },
    onSuccess: () => {
      toast({ title: 'Test sent', description: 'Check your Zap history to confirm it was received.' });
    },
    onError: (err) => {
      toast({ title: 'Test failed', description: err.message, variant: 'destructive' });
    },
  });

  return {
    webhooks: webhooksQuery.data || [],
    isLoading: webhooksQuery.isLoading,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
  };
}

export function useZapierWebhookLogs(webhookId: string | null) {
  return useQuery({
    queryKey: ['zapier-webhook-logs', webhookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zapier_webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as ZapierWebhookLog[];
    },
    enabled: !!webhookId,
  });
}
