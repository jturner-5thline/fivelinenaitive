import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface TemplateTask {
  title: string;
  priority: string;
  relative_due_days?: number; // days from template application
}

export interface TaskTemplate {
  id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  template_tasks: TemplateTask[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

const KEY = ['task-templates'];

export function useTaskTemplates() {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as TaskTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async ({ name, description, template_tasks }: { name: string; description?: string; template_tasks: TemplateTask[] }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('task_templates').insert({
        name,
        description: description || null,
        template_tasks: template_tasks as any,
        created_by: user.id,
        company_id: company?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success('Template created');
    },
    onError: () => toast.error('Failed to create template'),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success('Template deleted');
    },
  });

  const applyTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      if (!user) throw new Error('Not authenticated');
      const template = templates.find(t => t.id === templateId);
      if (!template) throw new Error('Template not found');

      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const tasks = template.template_tasks.map((t, i) => ({
        title: t.title,
        priority: t.priority || 'medium',
        assigned_to: user.id,
        assigned_by: user.id,
        company_id: membership?.company_id || null,
        position: i,
        due_date: t.relative_due_days
          ? new Date(Date.now() + t.relative_due_days * 86400000).toISOString().split('T')[0]
          : null,
      }));

      const { data: createdTasks, error } = await supabase.from('tasks').insert(tasks as any).select();
      if (error) throw error;

      // Fire-and-forget Asana sync for each created task
      try {
        const companyId = membership?.company_id || null;
        const ctx = await getAsanaSyncContext(companyId);
        if (ctx && createdTasks) {
          const { data: profile } = await supabase.from('profiles').select('email').eq('user_id', user.id).maybeSingle();
          for (const t of createdTasks) {
            await syncTaskToAsana(ctx, {
              id: (t as any).id,
              title: (t as any).title,
              due_date: (t as any).due_date || null,
              assignee_email: profile?.email || null,
            });
          }
        }
      } catch (e) {
        console.error('[AsanaSync] Template task sync failed:', e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast.success('Template applied — tasks created');
    },
    onError: () => toast.error('Failed to apply template'),
  });

  return { templates, isLoading, createTemplate, deleteTemplate, applyTemplate };
}
