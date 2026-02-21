import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TaskTimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  duration_minutes: number;
  description: string | null;
  logged_date: string;
  created_at: string;
}

export function useTaskTimeEntries(taskId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['task-time-entries', taskId];

  const { data: entries = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_time_entries')
        .select('*')
        .eq('task_id', taskId)
        .order('logged_date', { ascending: false });
      if (error) throw error;
      return (data || []) as TaskTimeEntry[];
    },
  });

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  const logTime = useMutation({
    mutationFn: async ({ duration_minutes, description, logged_date }: { duration_minutes: number; description?: string; logged_date?: string }) => {
      if (!user || !taskId) throw new Error('Missing context');
      const { error } = await supabase.from('task_time_entries').insert({
        task_id: taskId,
        user_id: user.id,
        duration_minutes,
        description: description || null,
        logged_date: logged_date || new Date().toISOString().split('T')[0],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success('Time logged');
    },
    onError: () => toast.error('Failed to log time'),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_time_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { entries, totalMinutes, isLoading, logTime, deleteEntry };
}
