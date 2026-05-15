import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';
import { PipelineMemoCard } from '@/components/pipeline/memo/PipelineMemoCard';
import { usePipelineDigests } from '@/hooks/usePipelineDigests';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { useDailyDismissals } from '@/hooks/useDailyDismissals';
import { X } from 'lucide-react';

interface PipelineMemoViewProps {
  deals: Deal[];
  /** Empty-state message when no deals match the filter. */
  emptyMessage?: string;
  onOpenDeal?: (dealId: string) => void;
  /**
   * Per-day dismissal scope key. Different briefing surfaces (e.g. the
   * regular Daily Briefing vs Niki's Daily Briefing) must pass distinct
   * scopes so a dismissal in one surface does not hide the same deal in
   * the other. Defaults to 'rundown-deal' for backwards compatibility.
   */
  dismissalScope?: string;
}

/**
 * Stack of PipelineMemoCard components rendered in natural document flow.
 *
 * NOTE: We previously virtualised this list with @tanstack/react-virtual
 * for performance, but absolute-positioned virtual rows could briefly
 * overlap their neighbours when card content changed (lender expand,
 * lazy digests, follow-up form). Natural flow guarantees zero overlap
 * under every state — expanded lenders, long task lists, multiple groups,
 * empty sections — at the cost of mounting every card up front.
 */
export function PipelineMemoView({ deals, emptyMessage = 'No deals to summarize.', onOpenDeal, dismissalScope = 'rundown-deal' }: PipelineMemoViewProps) {
  const dealIds = useMemo(() => deals.map(d => d.id).filter(Boolean), [deals]);
  const idsKey = useMemo(() => dealIds.slice().sort().join(','), [dealIds]);

  // Fetch overdue tasks + outstanding items (with due dates) for all deals in
  // the briefing in two batched queries. Used purely for sort priority.
  const sortDataQ = useQuery({
    queryKey: ['briefing-sort-signals', idsKey],
    enabled: dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [tasksRes, itemsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('deal_id, due_date')
          .in('deal_id', dealIds)
          .is('archived_at', null)
          .neq('status', 'complete')
          .not('due_date', 'is', null)
          .lt('due_date', todayStr),
        supabase
          .from('outstanding_items')
          .select('deal_id, due_date, status')
          .in('deal_id', dealIds)
          .not('due_date', 'is', null),
      ]);

      const overdueTaskDaysByDeal = new Map<string, number>();
      for (const t of tasksRes.data || []) {
        if (!t.deal_id || !t.due_date) continue;
        const days = Math.floor(
          (Date.now() - new Date(t.due_date).getTime()) / 86400000,
        );
        const prev = overdueTaskDaysByDeal.get(t.deal_id) ?? 0;
        if (days > prev) overdueTaskDaysByDeal.set(t.deal_id, days);
      }

      const overdueItemsByDeal = new Map<string, boolean>();
      const openItemsByDeal = new Map<string, boolean>();
      const now = Date.now();
      for (const it of itemsRes.data || []) {
        if (!it.deal_id) continue;
        let isOpen = true;
        try {
          const parsed = JSON.parse(it.status || '{}');
          isOpen = !(parsed.approved || parsed.received);
        } catch {
          isOpen = !['approved', 'delivered', 'received'].includes(it.status || '');
        }
        if (isOpen) openItemsByDeal.set(it.deal_id, true);
        if (isOpen && it.due_date && new Date(it.due_date).getTime() < now) {
          overdueItemsByDeal.set(it.deal_id, true);
        }
      }

      return { overdueTaskDaysByDeal, overdueItemsByDeal, openItemsByDeal };
    },
  });

  // Priority sort: overdue tasks → upcoming milestones w/ open items →
  // overdue outstanding items → stalest by last activity.
  const sorted = useMemo(() => {
    const overdueTaskDays = sortDataQ.data?.overdueTaskDaysByDeal ?? new Map();
    const overdueItems = sortDataQ.data?.overdueItemsByDeal ?? new Map();
    const openItems = sortDataQ.data?.openItemsByDeal ?? new Map();
    const now = Date.now();
    const SEVEN_DAYS = 7 * 86400000;

    const score = (d: Deal): { tier: number; subA: number; subB: number } => {
      // Tier 1 — overdue tasks (most overdue first)
      const taskDays = overdueTaskDays.get(d.id) ?? 0;
      if (taskDays > 0) return { tier: 1, subA: -taskDays, subB: 0 };

      // Tier 2 — milestone within next 7 days AND has open outstanding items
      if (openItems.get(d.id)) {
        const upcoming = (d.milestones || [])
          .filter(m => !m.completed && m.dueDate)
          .map(m => new Date(m.dueDate as string).getTime() - now)
          .filter(diff => diff >= 0 && diff <= SEVEN_DAYS)
          .sort((a, b) => a - b)[0];
        if (upcoming !== undefined) return { tier: 2, subA: upcoming, subB: 0 };
      }

      // Tier 3 — overdue outstanding items
      if (overdueItems.get(d.id)) return { tier: 3, subA: 0, subB: 0 };

      // Tier 4 — stalest by last activity (oldest updatedAt first)
      const last = new Date(d.updatedAt || d.createdAt || 0).getTime();
      return { tier: 4, subA: last, subB: 0 };
    };

    return [...deals].sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa.tier !== sb.tier) return sa.tier - sb.tier;
      return sa.subA - sb.subA;
    });
  }, [deals, sortDataQ.data]);

  const { digestMap, rawByDeal, isLoading: digestsLoading } = usePipelineDigests(sorted, sorted.length > 0);
  const { data: tasksByDeal } = usePipelineDealTasks(dealIds, dealIds.length > 0);
  const { dismiss, isDismissed } = useDailyDismissals(dismissalScope);

  const visible = useMemo(() => sorted.filter((d) => !isDismissed(d.id)), [sorted, isDismissed]);

  if (visible.length === 0) {
    return (
      <div className="rounded-xl py-12 px-4 text-center">
        <p className="text-muted-foreground text-sm italic">
          {sorted.length === 0 ? emptyMessage : 'All deals dismissed for today. They’ll return after the 5 AM ET reset.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="-mx-1 px-3 py-2 overflow-y-auto max-h-[78vh]"
      style={{ overscrollBehavior: 'contain' }}
    >
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        {visible.map((deal, index) => (
          <div key={deal.id} className="relative group/dismiss">
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover/dismiss:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                aria-label="Dismiss for today"
                title="Dismiss for today (returns at 5 AM ET)"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(deal.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <PipelineMemoCard
              deal={deal}
              digest={digestMap.get(deal.id)}
              rawDigest={rawByDeal.get(deal.id)}
              tasks={tasksByDeal?.get(deal.id) || []}
              isDigestLoading={digestsLoading}
              showLiveDot={index === 0}
              onOpenDeal={onOpenDeal}
            />
          </div>
        ))}
      </div>
    </div>
  );
}