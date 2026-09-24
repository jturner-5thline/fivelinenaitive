import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches the most recent status note text for each of the given deal ids.
 * Chunked + parallel so large pipelines (1,600+ deals) don't build one huge
 * request URL, and keyed by a compact signature instead of every id.
 */
export function useLatestStatusNotes(dealIds: string[]) {
  const key = `${dealIds.length}:${dealIds[0] ?? ''}:${dealIds[dealIds.length - 1] ?? ''}`;
  return useQuery({
    queryKey: ['latest-status-notes', key],
    enabled: dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const chunks: string[][] = [];
      for (let i = 0; i < dealIds.length; i += 150) chunks.push(dealIds.slice(i, i + 150));
      const results = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from('deal_status_notes')
            .select('deal_id, note, created_at')
            .in('deal_id', ids)
            .order('created_at', { ascending: false }),
        ),
      );
      for (const { data, error } of results) {
        if (error) throw error;
        for (const row of data || []) {
          if (row.deal_id && !(row.deal_id in map)) map[row.deal_id] = row.note || '';
        }
      }
      return map;
    },
  });
}
