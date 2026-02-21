import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface Task {
  id: string;
  project_id: string | null;
  section_id: string | null;
  parent_task_id: string | null;
  deal_id: string | null;
  company_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  status: string;
  priority: string;
  task_type: string;
  due_date: string | null;
  start_date: string | null;
  position: number;
  completed_at: string | null;
  completed_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assignee_profile?: { display_name: string; avatar_url: string | null; email: string } | null;
  creator_profile?: { display_name: string; avatar_url: string | null; email: string } | null;
  deal?: { company: string } | null;
  project?: { name: string; color: string; icon: string } | null;
  subtasks?: Task[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  author_profile?: { display_name: string; avatar_url: string | null } | null;
}

export interface TaskActivityEvent {
  id: string;
  task_id: string;
  actor_id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  actor_profile?: { display_name: string; avatar_url: string | null } | null;
}

const TASKS_KEY = ['my-tasks'];

export function useMyTasks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: TASKS_KEY,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .or(`assigned_to.eq.${user.id},assigned_by.eq.${user.id}`)
        .is('archived_at', null)
        .is('parent_task_id', null)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  // Fetch profiles for all tasks
  const userIds = [...new Set(tasks.flatMap(t => [t.assigned_to, t.assigned_by].filter(Boolean)))];
  const { data: profiles = [] } = useQuery({
    queryKey: ['task-profiles', userIds.sort().join(',')],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .in('user_id', userIds);
      if (error) throw error;
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]));

  const enrichedTasks = tasks.map(t => ({
    ...t,
    assignee_profile: profileMap[t.assigned_to] || null,
    creator_profile: profileMap[t.assigned_by] || null,
  }));

  const createTask = useMutation({
    mutationFn: async (task: { title: string; priority?: string; due_date?: string; status?: string; project_id?: string; section_id?: string; deal_id?: string }) => {
      if (!user) throw new Error('Not authenticated');
      // Get company_id
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: task.title,
          assigned_to: user.id,
          assigned_by: user.id,
          priority: task.priority || 'medium',
          due_date: task.due_date || null,
          status: task.status || 'not_started',
          project_id: task.project_id || null,
          section_id: task.section_id || null,
          deal_id: task.deal_id || null,
          company_id: membership?.company_id || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
    },
    onError: () => toast.error('Failed to create task'),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const updateData: Record<string, any> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.status !== undefined) {
        updateData.status = updates.status;
        if (updates.status === 'complete' || updates.status === 'completed') {
          updateData.completed_at = new Date().toISOString();
          const { data: { user: u } } = await supabase.auth.getUser();
          updateData.completed_by = u?.id;
        } else {
          updateData.completed_at = null;
          updateData.completed_by = null;
        }
      }
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.due_date !== undefined) updateData.due_date = updates.due_date;
      if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
      if (updates.assigned_to !== undefined) updateData.assigned_to = updates.assigned_to;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.position !== undefined) updateData.position = updates.position;
      if (updates.section_id !== undefined) updateData.section_id = updates.section_id;
      if (updates.project_id !== undefined) updateData.project_id = updates.project_id;
      if (updates.task_type !== undefined) updateData.task_type = updates.task_type;

      const { error } = await supabase.from('tasks').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
    onError: () => toast.error('Failed to update task'),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success('Task deleted');
    },
    onError: () => toast.error('Failed to delete task'),
  });

  return { tasks: enrichedTasks, isLoading, createTask, updateTask, deleteTask };
}

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['task-comments', taskId];

  const { data: comments = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as TaskComment[];
    },
  });

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !taskId) throw new Error('Missing context');
      const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        author_id: user.id,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { comments, isLoading, addComment };
}

export function useTaskActivity(taskId: string | null) {
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['task-activity', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_activity')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as TaskActivityEvent[];
    },
  });

  return { activity, isLoading };
}

export function useSubtasks(parentTaskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['subtasks', parentTaskId];

  const { data: subtasks = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!parentTaskId,
    queryFn: async () => {
      if (!parentTaskId) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('parent_task_id', parentTaskId)
        .is('archived_at', null)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const createSubtask = useMutation({
    mutationFn: async (title: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !parentTaskId) throw new Error('Missing context');
      const { data: parent } = await supabase.from('tasks').select('company_id, project_id').eq('id', parentTaskId).single();
      const { error } = await supabase.from('tasks').insert({
        title,
        parent_task_id: parentTaskId,
        assigned_to: user.id,
        assigned_by: user.id,
        company_id: parent?.company_id,
        project_id: parent?.project_id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { subtasks, isLoading, createSubtask };
}
