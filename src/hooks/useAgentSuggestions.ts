import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
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

export interface SuggestionAnalyticsEvent {
  suggestion_id: string;
  suggestion_name: string;
  suggestion_category: string | null;
  suggestion_priority: 'high' | 'medium' | 'low';
  action_type: 'viewed' | 'applied' | 'dismissed' | 'deep_dive_opened';
  reasoning_length?: number;
  time_to_action_seconds?: number;
  metadata?: Record<string, string | number | boolean | null>;
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

export function useTrackSuggestionAnalytics() {
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (event: SuggestionAnalyticsEvent) => {
      if (!user) return;

      const { error } = await supabase
        .from('agent_suggestion_analytics')
        .insert([{
          suggestion_id: event.suggestion_id,
          user_id: user.id,
          company_id: company?.id || null,
          action_type: event.action_type,
          suggestion_name: event.suggestion_name,
          suggestion_category: event.suggestion_category,
          suggestion_priority: event.suggestion_priority,
          reasoning_length: event.reasoning_length,
          time_to_action_seconds: event.time_to_action_seconds,
          metadata: event.metadata || {},
        }]);

      if (error) throw error;
    },
  });
}

export function useSuggestionAnalyticsStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['suggestion-analytics-stats', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('agent_suggestion_analytics')
        .select('action_type, suggestion_category, suggestion_priority, suggestion_name')
        .eq('user_id', user.id);

      if (error) throw error;

      // Aggregate stats
      const categoryStats = new Map<string, { applied: number; dismissed: number; viewed: number; deep_dives: number }>();
      const priorityStats = new Map<string, { applied: number; dismissed: number }>();
      const suggestionStats = new Map<string, { name: string; applied: number; dismissed: number }>();

      (data || []).forEach((row) => {
        // By category
        const cat = row.suggestion_category || 'uncategorized';
        if (!categoryStats.has(cat)) {
          categoryStats.set(cat, { applied: 0, dismissed: 0, viewed: 0, deep_dives: 0 });
        }
        const catStat = categoryStats.get(cat)!;
        if (row.action_type === 'applied') catStat.applied++;
        if (row.action_type === 'dismissed') catStat.dismissed++;
        if (row.action_type === 'viewed') catStat.viewed++;
        if (row.action_type === 'deep_dive_opened') catStat.deep_dives++;

        // By priority
        const pri = row.suggestion_priority || 'medium';
        if (!priorityStats.has(pri)) {
          priorityStats.set(pri, { applied: 0, dismissed: 0 });
        }
        const priStat = priorityStats.get(pri)!;
        if (row.action_type === 'applied') priStat.applied++;
        if (row.action_type === 'dismissed') priStat.dismissed++;

        // By suggestion name
        const name = row.suggestion_name;
        if (!suggestionStats.has(name)) {
          suggestionStats.set(name, { name, applied: 0, dismissed: 0 });
        }
        const nameStat = suggestionStats.get(name)!;
        if (row.action_type === 'applied') nameStat.applied++;
        if (row.action_type === 'dismissed') nameStat.dismissed++;
      });

      return {
        byCategory: Array.from(categoryStats.entries()).map(([category, stats]) => ({
          category,
          ...stats,
          applyRate: stats.applied + stats.dismissed > 0 
            ? Math.round((stats.applied / (stats.applied + stats.dismissed)) * 100) 
            : 0,
        })),
        byPriority: Array.from(priorityStats.entries()).map(([priority, stats]) => ({
          priority,
          ...stats,
          applyRate: stats.applied + stats.dismissed > 0 
            ? Math.round((stats.applied / (stats.applied + stats.dismissed)) * 100) 
            : 0,
        })),
        bySuggestion: Array.from(suggestionStats.values())
          .sort((a, b) => (b.applied + b.dismissed) - (a.applied + a.dismissed))
          .slice(0, 10),
        totals: {
          applied: data?.filter(d => d.action_type === 'applied').length || 0,
          dismissed: data?.filter(d => d.action_type === 'dismissed').length || 0,
          viewed: data?.filter(d => d.action_type === 'viewed').length || 0,
          deepDives: data?.filter(d => d.action_type === 'deep_dive_opened').length || 0,
        },
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDismissAgentSuggestion() {
  const queryClient = useQueryClient();
  const trackAnalytics = useTrackSuggestionAnalytics();

  return useMutation({
    mutationFn: async (suggestion: AgentSuggestion) => {
      // Track dismiss event
      await trackAnalytics.mutateAsync({
        suggestion_id: suggestion.id,
        suggestion_name: suggestion.name,
        suggestion_category: suggestion.category,
        suggestion_priority: suggestion.priority,
        action_type: 'dismissed',
        reasoning_length: suggestion.reasoning?.length || 0,
      });

      const { error } = await supabase
        .from('agent_suggestions')
        .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', suggestion.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['suggestion-analytics-stats'] });
      toast.success('Suggestion dismissed');
    },
  });
}

export function useApplyAgentSuggestion() {
  const queryClient = useQueryClient();
  const trackAnalytics = useTrackSuggestionAnalytics();

  return useMutation({
    mutationFn: async (suggestion: AgentSuggestion) => {
      // Track apply event
      await trackAnalytics.mutateAsync({
        suggestion_id: suggestion.id,
        suggestion_name: suggestion.name,
        suggestion_category: suggestion.category,
        suggestion_priority: suggestion.priority,
        action_type: 'applied',
        reasoning_length: suggestion.reasoning?.length || 0,
      });

      const { error } = await supabase
        .from('agent_suggestions')
        .update({ is_applied: true, applied_at: new Date().toISOString() })
        .eq('id', suggestion.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['suggestion-analytics-stats'] });
    },
  });
}

export function useTrackSuggestionView() {
  const trackAnalytics = useTrackSuggestionAnalytics();

  return useMutation({
    mutationFn: async (suggestion: AgentSuggestion) => {
      await trackAnalytics.mutateAsync({
        suggestion_id: suggestion.id,
        suggestion_name: suggestion.name,
        suggestion_category: suggestion.category,
        suggestion_priority: suggestion.priority,
        action_type: 'viewed',
      });
    },
  });
}

export function useTrackDeepDiveOpened() {
  const trackAnalytics = useTrackSuggestionAnalytics();

  return useMutation({
    mutationFn: async (suggestion: AgentSuggestion) => {
      await trackAnalytics.mutateAsync({
        suggestion_id: suggestion.id,
        suggestion_name: suggestion.name,
        suggestion_category: suggestion.category,
        suggestion_priority: suggestion.priority,
        action_type: 'deep_dive_opened',
        reasoning_length: suggestion.reasoning?.length || 0,
      });
    },
  });
}
