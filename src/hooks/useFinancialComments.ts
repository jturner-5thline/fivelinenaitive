import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface FinancialComment {
  id: string;
  deal_id: string;
  statement_type: 'income_statement' | 'balance_sheet';
  anchor_type: 'row' | 'cell' | 'metric' | 'widget';
  anchor_key: string;
  target_label: string;
  line_item_key: string;
  line_item_label: string;
  period_key: string | null;
  period_label: string | null;
  comment_text: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
}

export interface AddCommentParams {
  statement_type: 'income_statement' | 'balance_sheet';
  anchor_type: 'row' | 'cell' | 'metric' | 'widget';
  anchor_key: string;
  target_label: string;
  line_item_key: string;
  line_item_label: string;
  period_key?: string | null;
  period_label?: string | null;
  comment_text: string;
}

// Use any-typed client to bypass missing type generation for new table
const db = supabase as any;

export function useFinancialComments(dealId: string) {
  const { user } = useAuth();
  const [comments, setComments] = useState<FinancialComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');

  // Fetch user display name once
  useEffect(() => {
    if (!user) return;
    db.from('profiles')
      .select('display_name, first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          const composed = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
          setUserName(data.display_name || composed || user.email || 'Unknown');
        } else {
          setUserName(user.email || 'Unknown');
        }
      });
  }, [user]);

  const fetchComments = useCallback(async () => {
    if (!dealId) return;
    try {
      const { data, error } = await db
        .from('financial_comments')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComments((data as FinancialComment[]) || []);
    } catch (err) {
      console.error('Failed to fetch financial comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = useCallback(async (params: AddCommentParams) => {
    if (!user || !dealId) return null;

    const record = {
      deal_id: dealId,
      statement_type: params.statement_type,
      anchor_type: params.anchor_type,
      anchor_key: params.anchor_key,
      target_label: params.target_label,
      line_item_key: params.line_item_key,
      line_item_label: params.line_item_label,
      period_key: params.period_key || null,
      period_label: params.period_label || null,
      comment_text: params.comment_text,
      created_by_user_id: user.id,
      created_by_name: userName || user.email || 'Unknown',
    };

    try {
      const { data, error } = await db
        .from('financial_comments')
        .insert(record)
        .select()
        .single();

      if (error) throw error;

      const newComment = data as FinancialComment;
      setComments(prev => [newComment, ...prev]);
      toast.success('Comment added');
      return newComment;
    } catch (err) {
      console.error('Failed to add financial comment:', err);
      toast.error('Failed to add comment');
      return null;
    }
  }, [user, userName, dealId]);

  const deleteComment = useCallback(async (commentId: string) => {
    try {
      const { error } = await db
        .from('financial_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setComments(prev => prev.filter(c => c.id !== commentId));
      toast.success('Comment deleted');
    } catch (err) {
      console.error('Failed to delete financial comment:', err);
      toast.error('Failed to delete comment');
    }
  }, []);

  const getCommentsForAnchor = useCallback((anchorKey: string) => {
    return comments.filter(c => c.anchor_key === anchorKey);
  }, [comments]);

  const getCommentsForStatement = useCallback((statementType: 'income_statement' | 'balance_sheet') => {
    return comments.filter(c => c.statement_type === statementType);
  }, [comments]);

  const getCommentCountForRow = useCallback((lineItemKey: string) => {
    return comments.filter(c => c.line_item_key === lineItemKey).length;
  }, [comments]);

  return {
    comments,
    isLoading,
    addComment,
    deleteComment,
    fetchComments,
    getCommentsForAnchor,
    getCommentsForStatement,
    getCommentCountForRow,
  };
}
