import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns a map of note_id -> count of unresolved comments,
 * for all notes belonging to a deal.
 */
export function useNoteCommentCounts(dealId: string | undefined, noteIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['note-comment-counts', dealId, noteIds.slice().sort().join(',')],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!noteIds.length) return {};
      const { data, error } = await supabase
        .from('deal_space_note_comments')
        .select('note_id')
        .in('note_id', noteIds)
        .eq('resolved', false);
      if (error) return {};
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.note_id] = (counts[r.note_id] || 0) + 1; });
      return counts;
    },
    enabled: !!user && noteIds.length > 0,
    staleTime: 15000,
  });
}