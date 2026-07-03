import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the user's most recent End-of-Day dismissals (across the
 * `eod-agenda` and `eod-dismissed` scopes managed by `useDbPersistentClears`),
 * capped at 10, newest first. Provides an `undoLast` action that restores the
 * most recent one and invalidates the matching scope cache so tiles reappear.
 */
const TRACKED_SCOPES = ['eod-agenda', 'eod-dismissed'] as const;
const MAX_UNDO = 10;

export type RecentDismissal = {
  rowId: string;
  scope: string;
  itemId: string;
  clearedAt: string;
};

export function useRecentEodDismissals() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const queryKey = ['recent-eod-dismissals', userId];

  const { data: recent = [] } = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<RecentDismissal[]> => {
      const ors = TRACKED_SCOPES.map((s) => `item_id.like.${s}:%`).join(',');
      const { data, error } = await supabase
        .from('end_of_day_clears')
        .select('id, item_id, cleared_at')
        .or(ors)
        .not('item_id', 'like', '%::cutoff::%')
        .order('cleared_at', { ascending: false })
        .limit(MAX_UNDO);
      if (error) {
        console.error('Failed to load recent EOD dismissals:', error);
        return [];
      }
      return (data || []).map((r: any) => {
        const raw: string = r.item_id;
        const colonIdx = raw.indexOf(':');
        const scope = colonIdx >= 0 ? raw.slice(0, colonIdx) : raw;
        const itemId = colonIdx >= 0 ? raw.slice(colonIdx + 1) : '';
        return { rowId: r.id, scope, itemId, clearedAt: r.cleared_at };
      });
    },
  });

  const undo = useCallback(
    async (rowId: string) => {
      if (!userId) return;
      const target = recent.find((r) => r.rowId === rowId);
      qc.setQueryData<RecentDismissal[]>(queryKey, (prev = []) =>
        prev.filter((r) => r.rowId !== rowId),
      );
      const { error } = await supabase
        .from('end_of_day_clears')
        .delete()
        .eq('id', rowId)
        .eq('user_id', userId);
      if (error) {
        console.error('Failed to undo EOD dismissal:', error);
        qc.invalidateQueries({ queryKey });
        return;
      }
      if (target) {
        qc.invalidateQueries({ queryKey: ['db-persistent-clears', target.scope, userId] });
      }
    },
    [userId, recent, qc, queryKey],
  );

  const undoLast = useCallback(async () => {
    const last = recent[0];
    if (!last) return null;
    await undo(last.rowId);
    return last;
  }, [recent, undo]);

  return useMemo(
    () => ({ recent, undo, undoLast, count: recent.length }),
    [recent, undo, undoLast],
  );
}