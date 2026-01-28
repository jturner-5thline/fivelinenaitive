import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useDealMemoNotification(dealId: string | undefined) {
  const { user } = useAuth();
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkForUpdates = useCallback(async () => {
    if (!dealId || !user) {
      setIsChecking(false);
      return;
    }

    try {
      // Fetch the memo and user's last view time in parallel
      const [memoResult, viewResult] = await Promise.all([
        supabase
          .from('deal_memos')
          .select('updated_at, updated_by')
          .eq('deal_id', dealId)
          .maybeSingle(),
        supabase
          .from('deal_memo_views')
          .select('viewed_at')
          .eq('deal_id', dealId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      if (memoResult.error) throw memoResult.error;
      if (viewResult.error) throw viewResult.error;

      const memo = memoResult.data;
      const lastView = viewResult.data;

      // Has unread updates if:
      // 1. Memo exists AND was updated by someone else
      // 2. User has never viewed OR last view was before memo update
      if (memo && memo.updated_by && memo.updated_by !== user.id) {
        if (!lastView) {
          // User has never viewed this memo
          setHasUnreadUpdates(true);
        } else {
          // Check if memo was updated after user's last view
          const memoUpdatedAt = new Date(memo.updated_at);
          const viewedAt = new Date(lastView.viewed_at);
          setHasUnreadUpdates(memoUpdatedAt > viewedAt);
        }
      } else {
        setHasUnreadUpdates(false);
      }
    } catch (error) {
      console.error('Error checking memo updates:', error);
      setHasUnreadUpdates(false);
    } finally {
      setIsChecking(false);
    }
  }, [dealId, user]);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  const markAsViewed = useCallback(async () => {
    if (!dealId || !user) return;

    try {
      // Upsert the view record
      const { error } = await supabase
        .from('deal_memo_views')
        .upsert(
          {
            deal_id: dealId,
            user_id: user.id,
            viewed_at: new Date().toISOString(),
          },
          {
            onConflict: 'deal_id,user_id',
          }
        );

      if (error) throw error;
      setHasUnreadUpdates(false);
    } catch (error) {
      console.error('Error marking memo as viewed:', error);
    }
  }, [dealId, user]);

  return {
    hasUnreadUpdates,
    isChecking,
    markAsViewed,
    refetch: checkForUpdates,
  };
}
