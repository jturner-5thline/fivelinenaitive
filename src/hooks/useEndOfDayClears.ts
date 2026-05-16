import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Canonical, DB-backed persistent clears for End of Day backlog items.
 *
 * Unlike `useDailyDismissals` (per-day, localStorage), entries stored here
 * persist across days, devices, refreshes, and route changes — they only
 * disappear when the user explicitly restores them.
 */
export function useEndOfDayClears() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const queryKey = ['end-of-day-clears', userId];

  const { data: clearedIds = [] } = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('end_of_day_clears')
        .select('item_id');
      if (error) {
        console.error('Failed to load EOD clears:', error);
        return [];
      }
      return (data || []).map((r: any) => r.item_id as string);
    },
  });

  const clearedSet = useMemo(() => new Set(clearedIds), [clearedIds]);

  const isCleared = useCallback((id: string) => clearedSet.has(id), [clearedSet]);

  const clear = useCallback(
    async (id: string) => {
      if (!userId) return;
      qc.setQueryData<string[]>(queryKey, (prev = []) =>
        prev.includes(id) ? prev : [...prev, id],
      );
      const { error } = await supabase
        .from('end_of_day_clears')
        .insert({ user_id: userId, item_id: id });
      if (error && error.code !== '23505') {
        console.error('Failed to persist EOD clear:', error);
        toast.error('Could not save. Please retry.');
        qc.invalidateQueries({ queryKey });
      }
    },
    [userId, qc],
  );

  const restore = useCallback(
    async (id: string) => {
      if (!userId) return;
      qc.setQueryData<string[]>(queryKey, (prev = []) => prev.filter((x) => x !== id));
      const { error } = await supabase
        .from('end_of_day_clears')
        .delete()
        .eq('user_id', userId)
        .eq('item_id', id);
      if (error) {
        console.error('Failed to restore EOD clear:', error);
        qc.invalidateQueries({ queryKey });
      }
    },
    [userId, qc],
  );

  return { isCleared, clear, restore, cleared: clearedSet };
}