import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface SlackAgentRoute {
  id: string;
  user_id: string;
  company_id: string | null;
  agent_id: string;
  slack_channel_id: string;
  slack_channel_name: string | null;
  is_active: boolean;
  route_type: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members: number;
}

export interface DealSLARule {
  id: string;
  user_id: string;
  company_id: string | null;
  agent_id: string | null;
  name: string;
  description: string | null;
  rule_type: string;
  conditions: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  slack_channel_id: string | null;
  is_active: boolean;
  check_interval_hours: number;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Slack Channel Routes ─────────────────────────────────────────────────────

export function useSlackAgentRoutes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['slack-agent-routes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('slack_agent_routes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SlackAgentRoute[];
    },
    enabled: !!user,
  });
}

export function useCreateSlackRoute() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (data: {
      agent_id: string;
      slack_channel_id: string;
      slack_channel_name?: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: route, error } = await supabase
        .from('slack_agent_routes')
        .insert({
          ...data,
          user_id: user.id,
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return route as SlackAgentRoute;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-agent-routes'] });
      toast.success('Slack route created');
    },
    onError: (error) => {
      toast.error('Failed to create Slack route: ' + error.message);
    },
  });
}

export function useDeleteSlackRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (routeId: string) => {
      const { error } = await supabase
        .from('slack_agent_routes')
        .delete()
        .eq('id', routeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slack-agent-routes'] });
      toast.success('Slack route removed');
    },
    onError: (error) => {
      toast.error('Failed to remove route: ' + error.message);
    },
  });
}

// ─── Slack Channels ───────────────────────────────────────────────────────────

export function useSlackChannels() {
  return useQuery({
    queryKey: ['slack-channels'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('slack-agent-gateway', {
        body: { action: 'list_channels' },
      });

      if (error) throw error;
      return (data?.channels || []) as SlackChannel[];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// ─── SLA Rules ────────────────────────────────────────────────────────────────

export function useDealSLARules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['deal-sla-rules', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_sla_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DealSLARule[];
    },
    enabled: !!user,
  });
}

export function useCreateSLARule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      rule_type?: string;
      conditions: Json;
      action_type?: string;
      action_config?: Json;
      slack_channel_id?: string;
      agent_id?: string;
      check_interval_hours?: number;
    }) => {
      if (!user) throw new Error('Not authenticated');

      const { data: rule, error } = await supabase
        .from('deal_sla_rules')
        .insert({
          ...data,
          user_id: user.id,
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return rule as DealSLARule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-sla-rules'] });
      toast.success('SLA rule created');
    },
    onError: (error) => {
      toast.error('Failed to create SLA rule: ' + error.message);
    },
  });
}

export function useUpdateSLARule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, Json | string | number | boolean | null | undefined>) => {
      const { data: rule, error } = await supabase
        .from('deal_sla_rules')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return rule as DealSLARule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-sla-rules'] });
      toast.success('SLA rule updated');
    },
    onError: (error) => {
      toast.error('Failed to update SLA rule: ' + error.message);
    },
  });
}

export function useDeleteSLARule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase
        .from('deal_sla_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deal-sla-rules'] });
      toast.success('SLA rule deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete SLA rule: ' + error.message);
    },
  });
}

// ─── Agent Actions ────────────────────────────────────────────────────────────

export function useSendSlackMessage() {
  return useMutation({
    mutationFn: async (data: {
      channel: string;
      text: string;
      thread_ts?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke('slack-agent-gateway', {
        body: { action: 'send_message', ...data },
      });

      if (error) throw error;
      return result;
    },
    onError: (error) => {
      toast.error('Failed to send Slack message: ' + error.message);
    },
  });
}

export function useDraftDealFollowup() {
  return useMutation({
    mutationFn: async (data: {
      deal_id: string;
      channel_id: string;
      agent_id?: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke('slack-agent-gateway', {
        body: { action: 'draft_followup', ...data },
      });

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success('Follow-up drafted and sent to Slack');
    },
    onError: (error) => {
      toast.error('Failed to draft follow-up: ' + error.message);
    },
  });
}

export function useUpdateDealViaSlack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      deal_id: string;
      new_stage?: string;
      new_status?: string;
      channel_id: string;
      user_id: string;
    }) => {
      const { data: result, error } = await supabase.functions.invoke('slack-agent-gateway', {
        body: { action: 'update_deal_status', ...data },
      });

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal updated and Slack notified');
    },
    onError: (error) => {
      toast.error('Failed to update deal: ' + error.message);
    },
  });
}
