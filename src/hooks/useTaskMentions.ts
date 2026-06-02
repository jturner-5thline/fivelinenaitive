import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface TaskMention {
  id: string;
  task_id: string;
  comment_id: string | null;
  mentioned_by: string;
  mentioned_user_id: string;
  source: 'comment' | 'description';
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

/** Extract @mention user IDs from text like "@[Display Name](userId)" */
export function extractMentions(text: string): string[] {
  // Only accept UUID payloads — matches the DB trigger
  // (regexp_matches '@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)').
  const regex = /@\[([^\]]+)\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;
  const ids: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[2]);
  }
  return [...new Set(ids)];
}

/** Render mention markup to display text with highlighted names */
export function renderMentionText(text: string): string {
  return text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '@$1');
}

/** Get unread mention count for the current user */
export function useUnreadMentionCount() {
  const { user } = useAuth();

  const { data: count = 0 } = useQuery({
    queryKey: ['task-mention-count', user?.id],
    enabled: !!user,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('task_mentions' as any)
        .select('id', { count: 'exact', head: true })
        .eq('mentioned_user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
      return count || 0;
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`task-mentions-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_mentions',
        filter: `mentioned_user_id=eq.${user.id}`,
      }, () => {
        // Trigger refetch via query client
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}

/** Get mentions for a specific user (their notifications) */
export function useMyTaskMentions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: mentions = [], isLoading } = useQuery({
    queryKey: ['task-mentions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('task_mentions' as any)
        .select('*')
        .eq('mentioned_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as TaskMention[];
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (mentionId: string) => {
      const { error } = await supabase
        .from('task_mentions' as any)
        .update({ is_read: true, read_at: new Date().toISOString() } as any)
        .eq('id', mentionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-mentions'] });
      queryClient.invalidateQueries({ queryKey: ['task-mention-count'] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from('task_mentions' as any)
        .update({ is_read: true, read_at: new Date().toISOString() } as any)
        .eq('mentioned_user_id', user.id)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-mentions'] });
      queryClient.invalidateQueries({ queryKey: ['task-mention-count'] });
    },
  });

  return { mentions, isLoading, markAsRead, markAllAsRead };
}

/** Create mention records when a comment or description includes @mentions */
export function useCreateMentions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      text,
      commentId,
      source,
    }: {
      taskId: string;
      text: string;
      commentId?: string;
      source: 'comment' | 'description';
    }) => {
      if (!user) return;
      const userIds = extractMentions(text);
      if (userIds.length === 0) return;

      // Don't mention yourself
      const otherUserIds = userIds.filter(id => id !== user.id);
      if (otherUserIds.length === 0) return;

      const rows = otherUserIds.map(uid => ({
        task_id: taskId,
        comment_id: commentId || null,
        mentioned_by: user.id,
        mentioned_user_id: uid,
        source,
      }));

      const { error } = await supabase
        .from('task_mentions' as any)
        .insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-mentions'] });
      queryClient.invalidateQueries({ queryKey: ['task-mention-count'] });
    },
  });
}
