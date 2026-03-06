import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChecklistItem {
  id: string;
  subtask_id: string;
  label: string;
  is_completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useSubtaskChecklist(subtaskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['subtask-checklist', subtaskId];

  const { data: items = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!subtaskId,
    queryFn: async () => {
      if (!subtaskId) return [];
      const { data, error } = await supabase
        .from('subtask_checklist_items' as any)
        .select('*')
        .eq('subtask_id', subtaskId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ChecklistItem[];
    },
  });

  const completedCount = items.filter(i => i.is_completed).length;

  const addItem = useMutation({
    mutationFn: async (label: string) => {
      if (!subtaskId) throw new Error('No subtask');
      const { error } = await supabase
        .from('subtask_checklist_items' as any)
        .insert({
          subtask_id: subtaskId,
          label,
          position: items.length,
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ChecklistItem> }) => {
      const { error } = await supabase
        .from('subtask_checklist_items' as any)
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('subtask_checklist_items' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const toggleItem = useMutation({
    mutationFn: async (id: string) => {
      const item = items.find(i => i.id === id);
      if (!item) throw new Error('Item not found');
      const { error } = await supabase
        .from('subtask_checklist_items' as any)
        .update({ is_completed: !item.is_completed })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { items, completedCount, totalCount: items.length, isLoading, addItem, updateItem, deleteItem, toggleItem };
}
