import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DealTask {
  id: string;
  deal_id: string | null;
  assigned_to: string;
  assigned_by: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealTasks(dealId: string | undefined) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DealTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    if (!dealId || !user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTasks((data as DealTask[]) || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, user]);

  const createTask = useCallback(async (task: {
    title: string;
    description?: string;
    due_date?: string;
    assigned_to: string;
  }) => {
    if (!dealId || !user) return null;
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          deal_id: dealId,
          assigned_to: task.assigned_to,
          assigned_by: user.id,
          title: task.title,
          description: task.description || null,
          due_date: task.due_date || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      setTasks(prev => [data as DealTask, ...prev]);
      return data;
    } catch (error) {
      console.error('Error creating task:', error);
      return null;
    }
  }, [dealId, user]);

  const updateTaskStatus = useCallback(async (taskId: string, status: string) => {
    try {
      const updates: any = { status };
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }
      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
      return true;
    } catch (error) {
      console.error('Error updating task:', error);
      return false;
    }
  }, []);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.filter(t => t.id !== taskId));
      return true;
    } catch (error) {
      console.error('Error deleting task:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, isLoading, createTask, updateTaskStatus, deleteTask, refetch: fetchTasks };
}
