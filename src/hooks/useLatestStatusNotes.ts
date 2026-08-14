import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches the most recent status note text for each of the given deal ids.
 */
export function useLatestStatusNotes(dealIds: string[]) {
  const key = [...dealIds].sort().join(',');
  return useQuery({
    queryKey: ['latest-status-notes', key],
    enabled: dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const { data, error } = await supabase
        .from('deal_status_notes')
        .select('deal_id, note, created_at')
        .in('deal_id', dealIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      for (const row of data || []) {
        if (row.deal_id && !map[row.deal_id]) map[row.deal_id] = row.note || '';
      }
      return map;
    },
  });
}
