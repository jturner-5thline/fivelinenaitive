import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DataRoomComment {
  id: string;
  deal_id: string;
  checklist_item_id: string;
  parent_comment_id: string | null;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Joined
  user_display_name?: string;
  user_avatar_url?: string;
}

export function useDataRoomComments(dealId: string | null) {
  const { user } = useAuth();
  const [comments, setComments] = useState<DataRoomComment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!user || !dealId) { setComments([]); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('data_room_comments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Fetch user names
      const userIds = [...new Set((data || []).map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, p])
      );

      setComments((data || []).map(c => ({
        ...c,
        user_display_name: profileMap.get(c.user_id)?.display_name || 'Unknown',
        user_avatar_url: profileMap.get(c.user_id)?.avatar_url || undefined,
      })));
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  }, [user, dealId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  // Realtime
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`data-room-comments-${dealId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'data_room_comments',
        filter: `deal_id=eq.${dealId}`,
      }, () => { fetchComments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchComments]);

  const addComment = async (checklistItemId: string, content: string, parentId?: string): Promise<boolean> => {
    if (!user || !dealId) return false;
    try {
      const { error } = await supabase
        .from('data_room_comments')
        .insert({
          deal_id: dealId,
          checklist_item_id: checklistItemId,
          user_id: user.id,
          content,
          parent_comment_id: parentId || null,
        });
      if (error) throw error;
      await fetchComments();
      return true;
    } catch (err) {
      console.error('Error adding comment:', err);
      toast.error('Failed to add comment');
      return false;
    }
  };

  const deleteComment = async (commentId: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('data_room_comments')
        .delete()
        .eq('id', commentId);
      if (error) throw error;
      await fetchComments();
      return true;
    } catch (err) {
      console.error('Error deleting comment:', err);
      toast.error('Failed to delete comment');
      return false;
    }
  };

  const getCommentsForItem = useCallback((checklistItemId: string) => {
    return comments.filter(c => c.checklist_item_id === checklistItemId);
  }, [comments]);

  return { comments, loading, addComment, deleteComment, getCommentsForItem };
}
