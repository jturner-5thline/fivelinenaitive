import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';

export interface MemoComment {
  id: string;
  dealId: string;
  memoId: string | null;
  section: string;
  itemIndex: number | null;
  content: string;
  userId: string;
  userDisplayName: string | null;
  mentionedUserIds: string[];
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  replies?: MemoComment[];
}

export function useDealMemoComments(dealId: string) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [comments, setComments] = useState<MemoComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!dealId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_memo_comments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: MemoComment[] = (data || []).map(c => ({
        id: c.id,
        dealId: c.deal_id,
        memoId: c.memo_id,
        section: c.section,
        itemIndex: c.item_index,
        content: c.content,
        userId: c.user_id,
        userDisplayName: c.user_display_name,
        mentionedUserIds: c.mentioned_user_ids || [],
        resolved: c.resolved,
        resolvedBy: c.resolved_by,
        resolvedAt: c.resolved_at,
        parentCommentId: c.parent_comment_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));

      // Nest replies
      const topLevel = mapped.filter(c => !c.parentCommentId);
      const replyMap = new Map<string, MemoComment[]>();
      mapped.filter(c => c.parentCommentId).forEach(c => {
        const arr = replyMap.get(c.parentCommentId!) || [];
        arr.push(c);
        replyMap.set(c.parentCommentId!, arr);
      });
      topLevel.forEach(c => { c.replies = replyMap.get(c.id) || []; });

      setComments(topLevel);
    } catch (err) {
      console.error('Error fetching memo comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = useCallback(async (
    section: string,
    content: string,
    itemIndex?: number | null,
    mentionedUserIds?: string[],
    parentCommentId?: string | null,
    memoId?: string | null,
  ) => {
    if (!user || !content.trim()) return null;
    try {
      const { data, error } = await supabase
        .from('deal_memo_comments')
        .insert({
          deal_id: dealId,
          memo_id: memoId || null,
          section,
          item_index: itemIndex ?? null,
          content: content.trim(),
          user_id: user.id,
          user_display_name: profile?.display_name || user.email?.split('@')[0] || 'User',
          mentioned_user_ids: mentionedUserIds || [],
          parent_comment_id: parentCommentId || null,
        })
        .select()
        .single();

      if (error) throw error;
      await fetchComments();
      return data;
    } catch (err) {
      console.error('Error adding memo comment:', err);
      return null;
    }
  }, [dealId, user, profile, fetchComments]);

  const resolveComment = useCallback(async (commentId: string) => {
    if (!user) return;
    try {
      await supabase
        .from('deal_memo_comments')
        .update({
          resolved: true,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', commentId);
      await fetchComments();
    } catch (err) {
      console.error('Error resolving comment:', err);
    }
  }, [user, fetchComments]);

  const unresolveComment = useCallback(async (commentId: string) => {
    try {
      await supabase
        .from('deal_memo_comments')
        .update({
          resolved: false,
          resolved_by: null,
          resolved_at: null,
        })
        .eq('id', commentId);
      await fetchComments();
    } catch (err) {
      console.error('Error unresolving comment:', err);
    }
  }, [fetchComments]);

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      await supabase
        .from('deal_memo_comments')
        .delete()
        .eq('id', commentId);
      await fetchComments();
    } catch (err) {
      console.error('Error deleting comment:', err);
    }
  }, [fetchComments]);

  const getCommentsForSection = useCallback((section: string, itemIndex?: number | null) => {
    return comments.filter(c => {
      if (c.section !== section) return false;
      if (itemIndex !== undefined && itemIndex !== null) {
        return c.itemIndex === itemIndex;
      }
      return c.itemIndex === null;
    });
  }, [comments]);

  const getCommentCountForSection = useCallback((section: string, itemIndex?: number | null) => {
    return getCommentsForSection(section, itemIndex).filter(c => !c.resolved).length;
  }, [getCommentsForSection]);

  return {
    comments,
    isLoading,
    addComment,
    resolveComment,
    unresolveComment,
    deleteComment,
    getCommentsForSection,
    getCommentCountForSection,
    refetch: fetchComments,
  };
}
