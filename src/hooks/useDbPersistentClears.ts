import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * DB-backed per-user persistent clears, scoped by string key. Drop-in
 * replacement for `usePersistentClears` for the End of Day surfaces, where
 * dismissals must survive refresh and cross devices (localStorage isn't
 * enough).
 *
 * Storage: `end_of_day_clears` table, with `item_id` encoded as
 *   `<scope>:<id>`                — individual cleared item
 *   `<scope>::cutoff::<YYYY-MM-DD>` — singleton cutoff; anything in this
 *                                     scope dated <= cutoff is treated as
 *                                     cleared without enumerating ids.
 *
 * RLS already restricts rows to the owning user, so cross-user isolation is
 * enforced server-side.
 */
const CUTOFF_PREFIX = '::cutoff::';

export function useDbPersistentClears(scope: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const queryKey = ['db-persistent-clears', scope, userId];

  const { data: rows = [] } = useQuery({
    queryKey,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('end_of_day_clears')
        .select('item_id')
        .like('item_id', `${scope}:%`);
      if (error) {
        console.error('Failed to load persistent clears:', error);
        return [];
      }
      return (data || []).map((r: any) => r.item_id as string);
    },
  });

  const { individualSet, cutoffDate } = useMemo(() => {
    const set = new Set<string>();
    let cutoff: Date | null = null;
    const prefix = `${scope}:`;
    const cutoffMarker = `${scope}${CUTOFF_PREFIX}`;
    for (const item of rows) {
      if (item.startsWith(cutoffMarker)) {
        const iso = item.slice(cutoffMarker.length);
        const d = new Date(`${iso}T23:59:59`);
        if (!isNaN(d.getTime()) && (!cutoff || d > cutoff)) cutoff = d;
      } else if (item.startsWith(prefix)) {
        set.add(item.slice(prefix.length));
      }
    }
    return { individualSet: set, cutoffDate: cutoff };
  }, [rows, scope]);

  const isCleared = useCallback(
    (id: string, itemDate?: Date | string | null): boolean => {
      if (individualSet.has(id)) return true;
      if (cutoffDate && itemDate) {
        const d = typeof itemDate === 'string' ? new Date(itemDate) : itemDate;
        if (d && !isNaN(d.getTime()) && d.getTime() <= cutoffDate.getTime()) return true;
      }
      return false;
    },
    [individualSet, cutoffDate],
  );

  const clear = useCallback(
    async (id: string) => {
      if (!userId) return;
      const key = `${scope}:${id}`;
      qc.setQueryData<string[]>(queryKey, (prev = []) =>
        prev.includes(key) ? prev : [...prev, key],
      );
      const { error } = await supabase
        .from('end_of_day_clears')
        .insert({ user_id: userId, item_id: key });
      if (error && error.code !== '23505') {
        console.error('Failed to persist clear:', error);
        toast.error('Could not save. Please retry.');
        qc.invalidateQueries({ queryKey });
      }
    },
    [userId, scope, qc, queryKey],
  );

  const restore = useCallback(
    async (id: string) => {
      if (!userId) return;
      const key = `${scope}:${id}`;
      qc.setQueryData<string[]>(queryKey, (prev = []) => prev.filter((x) => x !== key));
      const { error } = await supabase
        .from('end_of_day_clears')
        .delete()
        .eq('user_id', userId)
        .eq('item_id', key);
      if (error) {
        console.error('Failed to restore clear:', error);
        qc.invalidateQueries({ queryKey });
      }
    },
    [userId, scope, qc, queryKey],
  );

  return { isCleared, clear, restore, cutoffDate };
}