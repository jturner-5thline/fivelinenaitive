import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { toast } from '@/hooks/use-toast';

export interface OutstandingItemComment {
  id: string;
  item_id: string;
  user_id: string;
  user_display_name: string | null;
  content: string;
  created_at: string;
}

export function useOutstandingItemComments(itemId: string | null) {
  const [comments, setComments] = useState<OutstandingItemComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { profile } = useProfile();

  useEffect(() => {
    if (!itemId) {
      setComments([]);
      return;
    }

    const fetchComments = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('outstanding_item_comments')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching comments:', error);
      } else {
        setComments(data || []);
      }
      setIsLoading(false);
    };

    fetchComments();
  }, [itemId]);

  const addComment = async (content: string) => {
    if (!itemId || !user || !content.trim()) return;

    const newComment = {
      item_id: itemId,
      user_id: user.id,
      user_display_name: profile?.display_name || user.email || 'Unknown',
      content: content.trim(),
    };

    const { data, error } = await supabase
      .from('outstanding_item_comments')
      .insert(newComment)
      .select()
      .single();

    if (error) {
      console.error('Error adding comment:', error);
      toast({
        title: 'Failed to add comment',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setComments(prev => [...prev, data]);
  };

  const deleteComment = async (commentId: string) => {
    const { error } = await supabase
      .from('outstanding_item_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('Error deleting comment:', error);
      toast({
        title: 'Failed to delete comment',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return { comments, isLoading, addComment, deleteComment };
}
