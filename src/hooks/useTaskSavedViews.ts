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
    filterPriorities?: string[]; // legacy — kept for back-compat read
    urgentOnly?: boolean;
    showAllDeals?: boolean;
    filterDueDate?: string; // 'all' | 'overdue' | 'today' | 'this_week' | 'no_date'
    filterRecurring?: string; // 'all' | 'recurring' | 'paused'
  };
  is_default: boolean;
  position: number;
  created_at: string;
  pinned_at?: string | null;
}

const KEY = ['task-saved-views'];
export const MAX_PINNED_VIEWS = 3;

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
        // Pinned first (newest pin first), then position
        .order('pinned_at', { ascending: false, nullsFirst: false })
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

  const renameView = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Name required');
      const { error } = await supabase
        .from('task_saved_views')
        .update({ name: trimmed })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success('Preset renamed');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to rename preset'),
  });

  const togglePinView = useMutation({
    mutationFn: async (view: TaskSavedView) => {
      const isPinned = !!view.pinned_at;
      if (!isPinned) {
        const pinnedCount = savedViews.filter(v => !!v.pinned_at).length;
        if (pinnedCount >= MAX_PINNED_VIEWS) {
          throw new Error(`You can pin up to ${MAX_PINNED_VIEWS} presets. Unpin one first.`);
        }
      }
      const { error } = await supabase
        .from('task_saved_views')
        .update({ pinned_at: isPinned ? null : new Date().toISOString() } as any)
        .eq('id', view.id);
      if (error) throw error;
      return !isPinned;
    },
    onSuccess: (nowPinned) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(nowPinned ? 'Preset pinned' : 'Preset unpinned');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update pin'),
  });

  const duplicateView = useMutation({
    mutationFn: async (view: TaskSavedView) => {
      if (!user) throw new Error('Not authenticated');
      // Choose a unique copy name
      const base = view.name.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, '');
      const existing = new Set(savedViews.map(v => v.name.toLowerCase()));
      let name = `${base} (copy)`;
      let n = 2;
      while (existing.has(name.toLowerCase())) {
        name = `${base} (copy ${n++})`;
      }
      const { data, error } = await supabase
        .from('task_saved_views')
        .insert({
          user_id: user.id,
          name,
          view_config: view.view_config,
          position: (view.position ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TaskSavedView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      toast.success('Preset duplicated');
    },
    onError: () => toast.error('Failed to duplicate preset'),
  });

  return { savedViews, isLoading, saveView, deleteView, renameView, duplicateView, togglePinView };
}
