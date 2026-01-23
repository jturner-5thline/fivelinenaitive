import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from '@/hooks/use-toast';

export interface Agent {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  avatar_emoji: string;
  system_prompt: string;
  personality: string;
  temperature: number;
  can_access_deals: boolean;
  can_access_lenders: boolean;
  can_access_activities: boolean;
  can_access_milestones: boolean;
  can_search_web: boolean;
  is_shared: boolean;
  is_public: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentData {
  name: string;
  description?: string;
  avatar_emoji?: string;
  system_prompt: string;
  personality?: string;
  temperature?: number;
  can_access_deals?: boolean;
  can_access_lenders?: boolean;
  can_access_activities?: boolean;
  can_access_milestones?: boolean;
  can_search_web?: boolean;
  is_shared?: boolean;
  is_public?: boolean;
}

export function useAgents() {
  const { user } = useAuth();
  const { company } = useCompany();

  return useQuery({
    queryKey: ['agents', user?.id, company?.id],
    queryFn: async () => {
      if (!user) return [];

      // Query all agents the user can see (own + shared + public)
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!user,
  });
}

export function useAgent(agentId: string | undefined) {
  return useQuery({
    queryKey: ['agent', agentId],
    queryFn: async () => {
      if (!agentId) return null;

      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error) throw error;
      return data as Agent;
    },
    enabled: !!agentId,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (data: CreateAgentData) => {
      if (!user) throw new Error('User not authenticated');

      const { data: agent, error } = await supabase
        .from('agents')
        .insert({
          ...data,
          user_id: user.id,
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return agent as Agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({
        title: 'Agent created',
        description: 'Your new AI agent is ready to use.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error creating agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Agent> & { id: string }) => {
      const { data: agent, error } = await supabase
        .from('agents')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return agent as Agent;
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      toast({
        title: 'Agent updated',
        description: 'Changes saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error updating agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', agentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({
        title: 'Agent deleted',
        description: 'The agent has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error deleting agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDuplicateAgent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (agent: Agent) => {
      if (!user) throw new Error('User not authenticated');

      const { data: newAgent, error } = await supabase
        .from('agents')
        .insert({
          name: `${agent.name} (Copy)`,
          description: agent.description,
          avatar_emoji: agent.avatar_emoji,
          system_prompt: agent.system_prompt,
          personality: agent.personality,
          temperature: agent.temperature,
          can_access_deals: agent.can_access_deals,
          can_access_lenders: agent.can_access_lenders,
          can_access_activities: agent.can_access_activities,
          can_access_milestones: agent.can_access_milestones,
          can_search_web: agent.can_search_web,
          is_shared: false,
          is_public: false,
          user_id: user.id,
          company_id: company?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return newAgent as Agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast({
        title: 'Agent duplicated',
        description: 'A copy of the agent has been created.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error duplicating agent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
