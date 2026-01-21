import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface BehaviorInsight {
  id: string;
  user_id: string;
  company_id: string | null;
  insight_type: 'bottleneck' | 'pattern' | 'opportunity' | 'efficiency';
  category: 'deal_activity' | 'time_patterns' | 'team_collaboration' | 'feature_adoption';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  data: Record<string, any>;
  suggested_workflow_id: string | null;
  is_dismissed: boolean;
  dismissed_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface WorkflowSuggestion {
  id: string;
  user_id: string;
  company_id: string | null;
  insight_id: string | null;
  name: string;
  description: string;
  reasoning: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  actions: Array<{ type: string; config: Record<string, any> }>;
  priority: 'high' | 'medium' | 'low';
  is_applied: boolean;
  applied_at: string | null;
  is_dismissed: boolean;
  dismissed_at: string | null;
  created_at: string;
}

export interface TeamMetric {
  id: string;
  company_id: string;
  metric_date: string;
  metric_type: 'avg_response_time' | 'collaboration_score' | 'handoff_efficiency' | 'stage_duration';
  metric_value: number;
  breakdown: Record<string, any>;
  created_at: string;
}

export function useBehaviorInsights() {
  const { user } = useAuth();
  const { company } = useCompany();

  return useQuery({
    queryKey: ['behavior-insights', user?.id, company?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_behavior_insights')
        .select('*')
        .eq('is_dismissed', false)
        .or(`user_id.eq.${user.id}${company?.id ? `,company_id.eq.${company.id}` : ''}`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as BehaviorInsight[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useWorkflowSuggestions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['workflow-suggestions', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('workflow_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_dismissed', false)
        .eq('is_applied', false)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as WorkflowSuggestion[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeamMetrics() {
  const { company } = useCompany();

  return useQuery({
    queryKey: ['team-metrics', company?.id],
    queryFn: async () => {
      if (!company?.id) return [];

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('team_interaction_metrics')
        .select('*')
        .eq('company_id', company.id)
        .gte('metric_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('metric_date', { ascending: false });

      if (error) throw error;
      return data as TeamMetric[];
    },
    enabled: !!company?.id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useDismissInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      const { error } = await supabase
        .from('user_behavior_insights')
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', insightId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behavior-insights'] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('workflow_suggestions')
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-suggestions'] });
      toast.success('Suggestion dismissed');
    },
  });
}

export function useApplySuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('workflow_suggestions')
        .update({ is_applied: true, applied_at: new Date().toISOString() })
        .eq('id', suggestionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-suggestions'] });
    },
  });
}

export function useAnalyzeBehavior() {
  const queryClient = useQueryClient();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('analyze-behavior', {
        body: { companyId: company?.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['behavior-insights'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['team-metrics'] });
      
      if (data.insights > 0 || data.suggestions > 0) {
        toast.success(`Found ${data.insights} insights and ${data.suggestions} workflow suggestions`);
      } else {
        toast.info('No new insights at this time');
      }
    },
    onError: (error) => {
      console.error('Error analyzing behavior:', error);
      toast.error('Failed to analyze behavior');
    },
  });
}
