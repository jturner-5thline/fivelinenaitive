import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DealMilestone } from '@/types/deal';

/**
 * Batched hook returning milestones grouped by deal id for the rundown
 * memo cards.
 *
 * The in-memory `DealsContext` does not hydrate `deal.milestones`
 * (`mapDbDealToDeal` in useDealsDatabase.ts skips the join for perf),
 * so the Pipeline Memo cards previously rendered "No milestones for
 * this deal" even when the deal detail page clearly had them. This hook
 * fetches `deal_milestones` for the visible rundown set in one round
 * trip and lets the cards fall back to it.
 */
export function usePipelineDealMilestones(dealIds: string[], enabled: boolean = true) {
  const queryClient = useQueryClient();
  const idsKey = useMemo(() => dealIds.slice().sort().join(','), [dealIds]);

  // Cross-surface refresh: any milestone mutation broadcast via the
  // copilot-action-completed event (e.g. inline complete in
  // TasksMilestonesBand, AddMilestoneInlineForm) should invalidate the
  // batched cache so the rundown stays in sync.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.actionType) return;
      if (
        detail.actionType === 'add_milestone' ||
        detail.actionType === 'toggle_milestone'
      ) {
        queryClient.invalidateQueries({ queryKey: ['pipeline-deal-milestones'] });
      }
    };
    window.addEventListener('copilot-action-completed', handler);
    return () => window.removeEventListener('copilot-action-completed', handler);
  }, [queryClient]);

  return useQuery({
    queryKey: ['pipeline-deal-milestones', idsKey],
    enabled: enabled && dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < dealIds.length; i += 200) chunks.push(dealIds.slice(i, i + 200));

      const results = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from('deal_milestones')
            .select('id, deal_id, title, due_date, completed, completed_at, position, status')
            .in('deal_id', ids)
            .order('position', { ascending: true }),
        ),
      );

      const byDeal = new Map<string, DealMilestone[]>();
      for (const res of results) {
        for (const row of (res.data || []) as any[]) {
          if (!row.deal_id) continue;
          const arr = byDeal.get(row.deal_id) || [];
          arr.push({
            id: row.id,
            title: row.title,
            // Normalize timestamp → YYYY-MM-DD for the band's
            // date-fns helpers and "due today" math.
            dueDate: row.due_date
              ? String(row.due_date).slice(0, 10)
              : undefined,
            completed: !!row.completed,
            completedAt: row.completed_at || undefined,
            position: row.position ?? undefined,
            status: row.status ?? null,
          });
          byDeal.set(row.deal_id, arr);
        }
      }
      return byDeal;
    },
  });
}