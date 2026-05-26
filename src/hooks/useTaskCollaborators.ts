import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TaskCollaborator {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
  profile?: {
    display_name: string;
    avatar_url: string | null;
    email: string;
  } | null;
}

export function useTaskCollaborators(taskId: string | null) {
  const queryClient = useQueryClient();
  const key = ['task-collaborators', taskId];

  const { data: collaborators = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from('task_collaborators' as any)
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const items = (data || []) as unknown as TaskCollaborator[];

      // Fetch profiles for all collaborator user_ids
      if (items.length > 0) {
        const userIds = items.map(c => c.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url, email')
          .in('user_id', userIds);
        
        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        items.forEach(c => {
          const p = profileMap.get(c.user_id);
          c.profile = p ? { display_name: p.display_name || '', avatar_url: p.avatar_url, email: p.email || '' } : null;
        });
      }

      return items;
    },
  });

  const addCollaborator = useMutation({
    mutationFn: async (userId: string) => {
      if (!taskId) throw new Error('No task');
      const { error } = await supabase
        .from('task_collaborators' as any)
        .insert({ task_id: taskId, user_id: userId });
      if (error) {
        console.error('[task_collaborators] insert failed', { taskId, userId, error });
        throw error;
      }

      // Fire-and-forget in-app notification for the added collaborator.
      // RLS-safe via SECURITY DEFINER RPC that verifies the caller can access the task.
      try {
        // Fetch task title + deal for nicer notification copy
        const { data: t } = await supabase
          .from('tasks')
          .select('title, deal_id')
          .eq('id', taskId)
          .maybeSingle();
        const title = (t as any)?.title || 'a task';
        const dealId = (t as any)?.deal_id || null;
        const { data: { user } } = await supabase.auth.getUser();
        const { data: actor } = user
          ? await supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()
          : { data: null } as any;
        const actorName = (actor as any)?.display_name || 'Someone';
        await supabase.rpc('create_task_inapp_notification' as any, {
          _task_id: taskId,
          _recipient_user_id: userId,
          _trigger_key: 'task_collaborator_added',
          _title: 'You were added as a collaborator',
          _body: `${actorName} added you to "${title}"`,
          _context: { task_id: taskId, task_title: title, deal_id: dealId, added_by_user_id: user?.id ?? null },
        });
      } catch (e) {
        console.warn('[task_collaborators] in-app notification failed (non-fatal)', e);
      }
    },
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<TaskCollaborator[]>(key);
      const optimistic: TaskCollaborator = {
        id: `optimistic-${userId}`,
        task_id: taskId || '',
        user_id: userId,
        created_at: new Date().toISOString(),
        profile: null,
      };
      queryClient.setQueryData<TaskCollaborator[]>(key, [...(prev || []), optimistic]);
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      const msg = err?.message || 'Failed to add collaborator';
      toast.error(msg.includes('row-level') ? "You don't have permission to add collaborators on this task" : `Failed to add collaborator: ${msg}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });

  const removeCollaborator = useMutation({
    mutationFn: async (userId: string) => {
      if (!taskId) throw new Error('No task');
      const { error } = await supabase
        .from('task_collaborators' as any)
        .delete()
        .eq('task_id', taskId)
        .eq('user_id', userId);
      if (error) {
        console.error('[task_collaborators] delete failed', { taskId, userId, error });
        throw error;
      }
    },
    onMutate: async (userId: string) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<TaskCollaborator[]>(key);
      queryClient.setQueryData<TaskCollaborator[]>(key, (prev || []).filter(c => c.user_id !== userId));
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
      toast.error(err?.message || 'Failed to remove collaborator');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });

  return { collaborators, isLoading, addCollaborator, removeCollaborator };
}

/**
 * Lightweight hook to batch-fetch collaborator counts for a list of task IDs.
 * Returns a Map<taskId, collaborator[]> for rendering indicators in list views.
 */
export function useTaskCollaboratorsBatch(taskIds: string[]) {
  const { data: collaboratorsMap = new Map<string, { user_id: string; display_name: string; avatar_url: string | null }[]>() } = useQuery({
    queryKey: ['task-collaborators-batch', taskIds.sort().join(',')],
    enabled: taskIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_collaborators' as any)
        .select('task_id, user_id')
        .in('task_id', taskIds);
      if (error) throw error;

      const items = (data || []) as unknown as { task_id: string; user_id: string }[];
      if (items.length === 0) return new Map();

      const userIds = [...new Set(items.map(i => i.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const result = new Map<string, { user_id: string; display_name: string; avatar_url: string | null }[]>();
      items.forEach(item => {
        const profile = profileMap.get(item.user_id);
        const entry = {
          user_id: item.user_id,
          display_name: profile?.display_name || '',
          avatar_url: profile?.avatar_url || null,
        };
        if (!result.has(item.task_id)) result.set(item.task_id, []);
        result.get(item.task_id)!.push(entry);
      });

      return result;
    },
  });

  return collaboratorsMap;
}
