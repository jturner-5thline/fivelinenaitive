import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface TaskLabel {
  id: string;
  company_id: string | null;
  name: string;
  color: string;
  created_by: string;
  created_at: string;
}

const LABELS_KEY = ['task-labels'];

export function useTaskLabels() {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: labels = [], isLoading } = useQuery({
    queryKey: LABELS_KEY,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_labels')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as TaskLabel[];
    },
  });

  const createLabel = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('task_labels').insert({
        name,
        color,
        created_by: user.id,
        company_id: company?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABELS_KEY });
      toast.success('Label created');
    },
    onError: () => toast.error('Failed to create label'),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_labels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABELS_KEY });
    },
  });

  return { labels, isLoading, createLabel, deleteLabel };
}

export function useTaskLabelAssignments(taskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['task-label-assignments', taskId];

  const { data: assignedLabelIds = [] } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_label_assignments')
        .select('label_id')
        .eq('task_id', taskId);
      if (error) throw error;
      return (data || []).map(d => d.label_id);
    },
  });

  const toggleLabel = useMutation({
    mutationFn: async (labelId: string) => {
      if (!taskId) throw new Error('No task');
      const isAssigned = assignedLabelIds.includes(labelId);
      if (isAssigned) {
        const { error } = await supabase
          .from('task_label_assignments')
          .delete()
          .eq('task_id', taskId)
          .eq('label_id', labelId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_label_assignments')
          .insert({ task_id: taskId, label_id: labelId });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { assignedLabelIds, toggleLabel };
}
