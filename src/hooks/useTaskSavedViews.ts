import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TaskSavedView {
  id: string;
  user_id: string;
  name: string;
  view_config: {
    viewMode?: string;
    filterStatus?: string;
    sortBy?: string;
    groupBy?: string;
    search?: string;
    ownerFilter?: string;
    filterDealIds?: string[];
    filterLabelIds?: string[];
    filterDueDate?: string; // 'all' | 'overdue' | 'today' | 'this_week' | 'no_date'
  };
  is_default: boolean;
  position: number;
  created_at: string;
}

const KEY = ['task-saved-views'];

export function useTaskSavedViews() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: savedViews = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('task_saved_views')
        .select('*')
        .eq('user_id', user.id)
        .order('position');
      if (error) throw error;
      return (data || []) as TaskSavedView[];
    },
  });

  const saveView = useMutation({
    mutationFn: async ({ name, view_config }: { name: string; view_config: TaskSavedView['view_config'] }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('task_saved_views').insert({
        user_id: user.id,
        name,
        view_config,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success('View saved');
    },
    onError: () => toast.error('Failed to save view'),
  });

  const deleteView = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_saved_views').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success('View deleted');
    },
  });

  return { savedViews, isLoading, saveView, deleteView };
}
