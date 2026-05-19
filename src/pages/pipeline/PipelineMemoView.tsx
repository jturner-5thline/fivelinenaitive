import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';
import { PipelineMemoCard } from '@/components/pipeline/memo/PipelineMemoCard';
import { usePipelineDigests } from '@/hooks/usePipelineDigests';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { useDailyDismissals } from '@/hooks/useDailyDismissals';
import { Check, Inbox, ChevronLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { cn } from '@/lib/utils';
import { EditableDealStatusTag } from '@/components/deal/EditableDealStatusTag';
import { useDealFreshness } from '@/hooks/useDealFreshness';

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

  // Soft attention glow: ≥2 business days since the last status / stage change.
  const { data: freshness } = useDealFreshness(dealIds);

  const visible = useMemo(() => sorted.filter((d) => !isDismissed(d.id)), [sorted, isDismissed]);

  // Master/detail selection — mirrors the Agenda and End of Day tabs.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  // Keep selection valid; auto-select first visible deal on desktop.
  useEffect(() => {
    if (selectedId && !visible.some((d) => d.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, visible]);
  useEffect(() => {
    if (!isNarrow && !selectedId && visible.length > 0) {
      setSelectedId(visible[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow, visible.length]);

  const selectedDeal = visible.find((d) => d.id === selectedId) || null;

  if (visible.length === 0) {
    return (
      <div className="rounded-xl py-12 px-4 text-center">
        <p className="text-muted-foreground text-sm italic">
          {sorted.length === 0 ? emptyMessage : 'All deals dismissed for today. They’ll return after the 5 AM ET reset.'}
        </p>
      </div>
    );
  }

  const masterPane = (
    <div className="popup-shell-surface flex flex-col h-full min-h-0 min-w-0 rounded-xl overflow-hidden">
      <ScrollArea className="flex-1 min-h-0 px-3 py-2">
        <div className="space-y-1.5 pb-2 pr-0.5">
          {visible.map((deal) => (
            <DealTile
              key={deal.id}
              deal={deal}
              active={selectedId === deal.id}
              isStale={freshness?.isStale.get(deal.id) ?? false}
              onClick={() => setSelectedId(deal.id)}
              onDismiss={() => dismiss(deal.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  const detailPane = (
    <div className="popup-shell-surface flex flex-1 flex-col h-full min-h-0 min-w-0 rounded-xl overflow-hidden">
      {selectedDeal ? (
        <>
          {isNarrow && (
            <div className="px-3 pt-3">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-white/80 hover:text-white"
                onClick={() => setSelectedId(null)}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back to deals
              </Button>
            </div>
          )}
          <ScrollArea
            className="flex-1 min-h-0 px-3 py-3"
            style={{ overscrollBehavior: 'contain' }}
          >
            {/* Force the memo card to stretch to the full available pane
                height. The Card itself is content-sized (min-h only), so we
                wrap it in a min-h-full flex column and use a child selector
                to make the Card grow to fill the pane. Internal sections
                still flow naturally and the ScrollArea handles overflow
                when content exceeds the pane. */}
            <div className="min-h-full flex flex-col [&>*]:flex-1 [&>*]:h-full">
              <PipelineMemoCard
                deal={selectedDeal}
                digest={digestMap.get(selectedDeal.id)}
                rawDigest={rawByDeal.get(selectedDeal.id)}
                tasks={tasksByDeal?.get(selectedDeal.id) || []}
                isDigestLoading={digestsLoading}
                showLiveDot
                onOpenDeal={onOpenDeal}
              />
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
          <div className="h-14 w-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-white">Nothing selected</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">
            Select a deal from the left to view tasks, milestones, outstanding items, lender activity, and emails.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex gap-2 min-h-0 h-full flex-1">
      {isNarrow ? (
        <div className="flex-1 min-w-0 min-h-0 h-full">
          {selectedDeal ? detailPane : masterPane}
        </div>
      ) : (
        <>
          <div className="w-[368px] shrink-0 min-w-0 min-h-0 h-full flex">{masterPane}</div>
          <div className="flex-1 min-w-0 min-h-0 h-full flex">{detailPane}</div>
        </>
      )}
    </div>
  );
}

// ── Compact left-pane deal tile ───────────────────────────────
function formatAmount(value: number | undefined | null): string {
  if (!value || value <= 0) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DealTile({
  deal,
  active,
  isStale = false,
  onClick,
  onDismiss,
}: {
  deal: Deal;
  active: boolean;
  isStale?: boolean;
  onClick: () => void;
  onDismiss: () => void;
}) {
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const rawStage = (deal.stage as string | undefined) || '';
  const stageLabel =
    (rawStage ? getStageConfigForDeal(rawStage, deal.pipelineId)?.label : null) ||
    (rawStage ? titleCase(rawStage) : null);
  const engagement = deal.engagementType ? titleCase(deal.engagementType) : null;
  const statusText = (() => {
    const raw = (deal.notes || '').toString();
    if (!raw.trim()) return null;
    const stripped = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped || null;
  })();
  const amount = formatAmount(deal.value);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'group/tile relative w-full text-left rounded-lg border transition-colors px-3 py-2.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-white/25 bg-white/[0.06]'
          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]',
        // Soft attention cue when the deal hasn't had a status or stage
        // update in ≥2 business days. Faint amber ring + glow — never red.
        isStale && 'deal-tile-stale-glow',
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <h3 className="text-[13px] font-semibold leading-tight text-white truncate min-w-0 flex-1">
          {deal.company || deal.name}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          {/* Deal status — interactive tag so the user can change the
              deal's canonical status without leaving the Deals tab. */}
          <EditableDealStatusTag dealId={deal.id} status={deal.status} />
          <Badge variant="green" className="rounded-full shrink-0 text-[10px]">
            {amount}
          </Badge>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {engagement && (
          <Badge variant="gray" className="rounded-full text-[9px] px-1.5 py-0">
            {engagement}
          </Badge>
        )}
        {stageLabel && (
          <Badge variant="outline" className="rounded-full text-[9px] px-1.5 py-0 border-white/15 text-white/80">
            {stageLabel}
          </Badge>
        )}
      </div>
      {statusText && (
        <p className="mt-1.5 text-[11px] text-white/60 line-clamp-2">{statusText}</p>
      )}
      <span
        role="button"
        tabIndex={0}
        aria-label="Clear for today"
        title="Clear for today (returns at 5 AM ET)"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-5 w-5 rounded-full
          border border-border/60 bg-background/60 text-muted-foreground opacity-0
          group-hover/tile:opacity-100 focus-visible:opacity-100 transition-opacity
          hover:border-emerald-500/60 hover:bg-emerald-500/15 hover:text-emerald-400
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
      >
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </span>
    </div>
  );
}