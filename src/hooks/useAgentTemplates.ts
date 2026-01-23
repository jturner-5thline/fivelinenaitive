import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AgentTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  avatar_emoji: string;
  system_prompt: string;
  personality: string | null;
  temperature: number;
  can_access_deals: boolean;
  can_access_lenders: boolean;
  can_access_activities: boolean;
  can_access_milestones: boolean;
  can_search_web: boolean;
  suggested_triggers: Array<{
    trigger_type: string;
    description: string;
    schedule?: string;
  }>;
  is_featured: boolean;
  usage_count: number;
  created_at: string;
}

export function useAgentTemplates() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['agent-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_templates')
        .select('*')
        .order('is_featured', { ascending: false })
        .order('usage_count', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our interface
      return (data || []).map((item) => ({
        ...item,
        suggested_triggers: (item.suggested_triggers || []) as AgentTemplate['suggested_triggers'],
      })) as AgentTemplate[];
    },
    enabled: !!user,
  });

  const createAgentFromTemplate = useMutation({
    mutationFn: async (template: AgentTemplate) => {
      if (!user) throw new Error('Not authenticated');

      // Create the agent
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .insert({
          user_id: user.id,
          name: template.name,
          description: template.description,
          avatar_emoji: template.avatar_emoji,
          system_prompt: template.system_prompt,
          personality: template.personality,
          temperature: template.temperature,
          can_access_deals: template.can_access_deals,
          can_access_lenders: template.can_access_lenders,
          can_access_activities: template.can_access_activities,
          can_access_milestones: template.can_access_milestones,
          can_search_web: template.can_search_web,
        })
        .select()
        .single();

      if (agentError) throw agentError;

      // Increment template usage count
      await supabase
        .from('agent_templates')
        .update({ usage_count: template.usage_count + 1 })
        .eq('id', template.id);

      return agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-templates'] });
      toast.success('Agent created from template');
    },
    onError: (error) => {
      toast.error('Failed to create agent: ' + error.message);
    },
  });

  const featuredTemplates = templates.filter((t) => t.is_featured);
  const templatesByCategory = templates.reduce(
    (acc, template) => {
      const category = template.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push(template);
      return acc;
    },
    {} as Record<string, AgentTemplate[]>
  );

  return {
    templates,
    featuredTemplates,
    templatesByCategory,
    isLoading,
    createAgentFromTemplate,
  };
}
