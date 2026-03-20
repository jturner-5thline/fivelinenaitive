import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import type { VdrTask } from '@/components/vdr/types';
import { toast } from 'sonner';

export type VdrTaskStatus = VdrTask['status'];
export type VdrTaskType = VdrTask['task_type'];

export function useVdrTasks(dealId: string) {
  const { user } = useAuth();
  const { company } = useCompany();
  const [tasks, setTasks] = useState<VdrTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!dealId || !company?.id) return;
    const { data, error } = await (supabase as any)
      .from('vdr_tasks')
      .select('*')
      .eq('deal_id', dealId)
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching VDR tasks:', error); return; }
    setTasks(data || []);
    setLoading(false);
  }, [dealId, company?.id]);

  useEffect(() => {
    if (dealId && company?.id) fetchTasks();
  }, [dealId, company?.id, fetchTasks]);

  const createTask = useCallback(async (task: {
    task_name: string;
    task_type: VdrTaskType;
    description?: string;
    instructions?: string;
    assignee?: string;
    hours_allocated?: number;
  }) => {
    if (!dealId || !company?.id) return;
    const { error } = await (supabase as any).from('vdr_tasks').insert({
      deal_id: dealId,
      company_id: company.id,
      task_name: task.task_name,
      task_type: task.task_type,
      description: task.description || null,
      instructions: task.instructions || null,
      assignee: task.assignee || null,
      hours_allocated: task.hours_allocated || 0,
      status: 'not_started',
      created_by: user?.id,
    });
    if (error) { toast.error('Failed to create task'); return; }
    await fetchTasks();
    toast.success('Task created');
  }, [dealId, company?.id, user?.id, fetchTasks]);

  const updateTask = useCallback(async (id: string, updates: Partial<VdrTask>) => {
    const { error } = await (supabase as any).from('vdr_tasks').update(updates).eq('id', id);
    if (error) { toast.error('Failed to update task'); return; }
    await fetchTasks();
  }, [fetchTasks]);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from('vdr_tasks').delete().eq('id', id);
    if (error) { toast.error('Failed to delete task'); return; }
    await fetchTasks();
    toast.success('Task deleted');
  }, [fetchTasks]);

  return { tasks, loading, createTask, updateTask, deleteTask, refetch: fetchTasks };
}
