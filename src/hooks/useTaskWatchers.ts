import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TaskWatcher {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
}

export function useTaskWatchers(taskId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['task-watchers', taskId];

  const { data: watchers = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_watchers')
        .select('*')
        .eq('task_id', taskId);
      if (error) throw error;
      return (data || []) as TaskWatcher[];
    },
  });

  const isWatching = watchers.some(w => w.user_id === user?.id);

  const toggleWatch = useMutation({
    mutationFn: async () => {
      if (!user || !taskId) throw new Error('Missing context');
      if (isWatching) {
        const { error } = await supabase
          .from('task_watchers')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_watchers')
          .insert({ task_id: taskId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { watchers, isWatching, isLoading, toggleWatch };
}
