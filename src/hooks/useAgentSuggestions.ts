import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AgentSuggestion {
  id: string;
  user_id: string;
  company_id: string | null;
  insight_id: string | null;
  template_id: string | null;
  name: string;
  description: string;
  reasoning: string;
  suggested_prompt: string | null;
  suggested_triggers: Array<{ trigger_type: string; description: string }>;
  priority: 'high' | 'medium' | 'low';
  category: string | null;
  is_applied: boolean;
  applied_at: string | null;
  is_dismissed: boolean;
  dismissed_at: string | null;
  created_at: string;
}

export function useAgentSuggestions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['agent-suggestions', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('agent_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .eq('is_applied', false)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data || []).map((s) => ({
        ...s,
        suggested_triggers: Array.isArray(s.suggested_triggers) 
          ? s.suggested_triggers 
          : [],
        priority: s.priority as 'high' | 'medium' | 'low',
      })) as AgentSuggestion[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDismissAgentSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('agent_suggestions')
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-suggestions'] });
      toast.success('Suggestion dismissed');
    },
  });
}

export function useApplyAgentSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('agent_suggestions')
        .update({ is_applied: true, applied_at: new Date().toISOString() })
        .eq('id', suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-suggestions'] });
    },
  });
}
