import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
}

export function useTaskDependencies(taskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['task-dependencies', taskId];

  const { data: dependencies = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_dependencies')
        .select('*')
        .or(`task_id.eq.${taskId},depends_on_task_id.eq.${taskId}`);
      if (error) throw error;
      return (data || []) as TaskDependency[];
    },
  });

  const blockedBy = dependencies.filter(d => d.task_id === taskId);
  const blocking = dependencies.filter(d => d.depends_on_task_id === taskId);

  const addDependency = useMutation({
    mutationFn: async (dependsOnTaskId: string) => {
      if (!taskId) throw new Error('No task');
      const { error } = await supabase.from('task_dependencies').insert({
        task_id: taskId,
        depends_on_task_id: dependsOnTaskId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const removeDependency = useMutation({
    mutationFn: async (depId: string) => {
      const { error } = await supabase.from('task_dependencies').delete().eq('id', depId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { dependencies, blockedBy, blocking, isLoading, addDependency, removeDependency };
}
