import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export type TriggerType = 
  | 'deal_created'
  | 'deal_stage_change'
  | 'deal_closed'
  | 'lender_added'
  | 'lender_stage_change'
  | 'milestone_due'
  | 'milestone_completed'
  | 'scheduled';

export type ActionType = 
  | 'generate_insight'
  | 'send_notification'
  | 'update_notes'
  | 'create_activity';

export interface AgentTrigger {
  id: string;
  agent_id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: Json;
  action_type: ActionType;
  action_config: Json;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AgentRun {
  id: string;
  agent_id: string;
  trigger_id: string | null;
  user_id: string;
  deal_id: string | null;
  lender_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  trigger_event: string | null;
  input_context: Json;
  output_content: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  // Joined data
  agents?: { name: string; avatar_emoji: string };
  deals?: { company: string };
  agent_triggers?: { name: string };
}

export interface CreateTriggerData {
  agent_id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_config?: Json;
  action_type?: ActionType;
  action_config?: Json;
  is_active?: boolean;
}

export function useAgentTriggers(agentId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['agent-triggers', agentId, user?.id],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('agent_triggers')
        .select('*')
        .order('created_at', { ascending: false });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AgentTrigger[];
    },
    enabled: !!user,
  });
}

export function useAgentRuns(agentId?: string, limit = 50) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['agent-runs', agentId, user?.id, limit],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('agent_runs')
        .select(`
          *,
          agents:agent_id (name, avatar_emoji),
          deals:deal_id (company),
          agent_triggers:trigger_id (name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AgentRun[];
    },
    enabled: !!user,
  });
}

export function useCreateAgentTrigger() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateTriggerData) => {
      if (!user) throw new Error('User not authenticated');

      const insertData: {
        agent_id: string;
        name: string;
        trigger_type: string;
        trigger_config: Json;
        action_type: string;
        action_config: Json;
        is_active: boolean;
        user_id: string;
      } = {
        agent_id: data.agent_id,
        name: data.name,
        trigger_type: data.trigger_type,
        trigger_config: (data.trigger_config || {}) as Json,
        action_type: data.action_type || 'generate_insight',
        action_config: (data.action_config || {}) as Json,
        is_active: data.is_active ?? true,
        user_id: user.id,
      };

      const { data: trigger, error } = await supabase
        .from('agent_triggers')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return trigger as AgentTrigger;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-triggers'] });
      toast({
        title: 'Trigger created',
        description: 'Your automation trigger is now active.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error creating trigger',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateAgentTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<AgentTrigger> & { id: string }) => {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.trigger_type !== undefined) updateData.trigger_type = data.trigger_type;
      if (data.trigger_config !== undefined) updateData.trigger_config = data.trigger_config;
      if (data.action_type !== undefined) updateData.action_type = data.action_type;
      if (data.action_config !== undefined) updateData.action_config = data.action_config;

      const { data: trigger, error } = await supabase
        .from('agent_triggers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return trigger as AgentTrigger;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-triggers'] });
      toast({
        title: 'Trigger updated',
        description: 'Changes saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error updating trigger',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteAgentTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (triggerId: string) => {
      const { error } = await supabase
        .from('agent_triggers')
        .delete()
        .eq('id', triggerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-triggers'] });
      toast({
        title: 'Trigger deleted',
        description: 'The automation trigger has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error deleting trigger',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useToggleAgentTrigger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data: trigger, error } = await supabase
        .from('agent_triggers')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return trigger as AgentTrigger;
    },
    onSuccess: (trigger) => {
      queryClient.invalidateQueries({ queryKey: ['agent-triggers'] });
      toast({
        title: trigger.is_active ? 'Trigger enabled' : 'Trigger disabled',
        description: trigger.is_active 
          ? 'This automation will now run when triggered.' 
          : 'This automation has been paused.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error updating trigger',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useExecutePendingRuns() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId?: string) => {
      const { data, error } = await supabase.functions.invoke('execute-agent-trigger', {
        body: { run_id: runId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agent-runs'] });
      toast({
        title: 'Runs processed',
        description: `Processed ${data.processed} agent run(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error processing runs',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
