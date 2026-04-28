import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns a map of assigned_to user_id -> open task count.
 * "Open" = not complete and not archived.
 */
export function useAssigneeOpenTaskCounts(enabled: boolean = true) {
  return useQuery({
    queryKey: ['assignee-open-task-counts'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('assigned_to')
        .neq('status', 'complete')
        .is('archived_at', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { assigned_to: string | null }) => {
        if (!row.assigned_to) return;
        counts[row.assigned_to] = (counts[row.assigned_to] || 0) + 1;
      });
      return counts;
    },
  });
}