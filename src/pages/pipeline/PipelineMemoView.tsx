import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';
import { PipelineMemoCard } from '@/components/pipeline/memo/PipelineMemoCard';
import { usePipelineDigests } from '@/hooks/usePipelineDigests';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { usePipelineDealMilestones } from '@/hooks/usePipelineDealMilestones';
import { useDailyDismissals } from '@/hooks/useDailyDismissals';
import { Check, Inbox, ChevronLeft, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { cn } from '@/lib/utils';
import { EditableDealStatusTag } from '@/components/deal/EditableDealStatusTag';
import { EditableDealStageTag } from '@/components/deal/EditableDealStageTag';
import { useDealFreshness } from '@/hooks/useDealFreshness';
import { useAdminRole } from '@/hooks/useAdminRole';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { hasReachedFinalCreditStage } from '@/lib/salesBdActivePipelineConversion';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Compact admin filter chip (multi-select popover) ───────────
// Hoisted above PipelineMemoView so React Fast Refresh / module
// evaluation order can never miss the binding.
function FilterChip({
  label,
  options,
  selected,
  onChange,
  formatLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  formatLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const fmt = formatLabel ?? ((v: string) => v);
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const active = selected.length > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[10px] font-medium transition-colors',
            active
              ? 'border-white/30 bg-white/[0.08] text-white'
              : 'border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05] hover:text-white',
          )}
        >
          <span>{label}</span>
          {active && (
            <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-white/15 text-white text-[9px]">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[220px] p-1 max-h-[280px] overflow-y-auto bg-popover border-white/10"
      >
        {options.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
            No options
          </div>
        ) : (
          options.map((opt) => {
            const isSel = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] transition-colors',
                  isSel ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/[0.06]',
                )}
              >
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 items-center justify-center rounded-sm border shrink-0',
                    isSel ? 'bg-primary border-primary text-primary-foreground' : 'border-white/30',
                  )}
                >
                  {isSel && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{fmt(opt)}</span>
              </button>
            );
          })
        )}
        {selected.length > 0 && (
          <div className="mt-1 pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-center text-[10px] uppercase tracking-wider text-white/60 hover:text-white py-1.5 rounded hover:bg-white/[0.06]"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Single-select filter chip (Tasks) ──────────────────────────
// Matches the visual treatment of FilterChip but enforces a single
// active value with a clear/All option, so callers can model 1-of-N
// state (e.g. Tasks = All | Late | None) without exposing nonsense
// combinations like "Late AND None" that a multi-select would allow.
function SingleSelectFilterChip<T extends string>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  allLabel = 'All',
}: {
  label: string;
  ariaLabel?: string;
  options: { value: T; label: string; count?: number; description?: string }[];
  value: T | null;
  onChange: (next: T | null) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== null;
  const activeOption = active ? options.find((o) => o.value === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel || `Filter by ${label.toLowerCase()}`}
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[10px] font-medium transition-colors',
            active
              ? 'border-white/30 bg-white/[0.08] text-white'
              : 'border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05] hover:text-white',
          )}
        >
          <span>{label}</span>
          {activeOption && (
            <span className="inline-flex items-center justify-center h-[14px] px-1.5 rounded-full bg-white/15 text-white text-[9px]">
              {activeOption.label}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[200px] p-1 max-h-[280px] overflow-y-auto bg-popover border-white/10"
      >
        <button
          key="__all__"
          type="button"
          onClick={() => { onChange(null); setOpen(false); }}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] transition-colors',
            value === null ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/[0.06]',
          )}
        >
          <span
            className={cn(
              'flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0',
              value === null ? 'bg-primary border-primary text-primary-foreground' : 'border-white/30',
            )}
          >
            {value === null && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
          </span>
          <span className="flex-1 truncate">{allLabel}</span>
        </button>
        {options.map((opt) => {
          const isSel = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              title={opt.description}
              aria-label={opt.description || opt.label}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] transition-colors',
                isSel ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/[0.06]',
              )}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0',
                  isSel ? 'bg-primary border-primary text-primary-foreground' : 'border-white/30',
                )}
              >
                {isSel && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className="flex-1 truncate">{opt.label}</span>
              {typeof opt.count === 'number' && (
                <span className="text-[10px] text-white/50">{opt.count}</span>
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

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
  const { data: milestonesByDeal } = usePipelineDealMilestones(dealIds, dealIds.length > 0);
  const { dismiss, isDismissed } = useDailyDismissals(dismissalScope);

  // Soft attention glow: ≥2 business days since the last status / stage change.
  const { data: freshness } = useDealFreshness(dealIds);

  // ── Admin-only filter bar (manager / type / status) ──
  const { isAdmin } = useAdminRole();
  const { user } = useAuth();
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const [managerFilter, setManagerFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // 5th Line replaces the Status dropdown with an Active toggle that
  // narrows to deals at "Final Credit Items" or later in the canonical
  // pipeline order. Mirrors the /deals board chip.
  // Default to "Active" filter (Final Credit Items onward) so the Daily
  // Rundown Deals tab opens focused on live deals.
  const [activeStagesOnly, setActiveStagesOnly] = useState(true);
  // Tasks filter — single-select: 'late' (≥1 overdue open task) or 'none'
  // (zero non-archived tasks). Sits alongside the existing admin filters
  // and combines additively (AND).
  const [taskFilter, setTaskFilter] = useState<'late' | 'none' | null>(null);

  // Per-deal task aggregates: { openCount: non-archived OPEN (incomplete)
  // task count, hasLate: ≥1 open task with due_date < today }. One
  // round-trip, used both for the Tasks filter and the chip option counts.
  // "Open" mirrors the app-wide definition used by Outstanding tab /
  // overdue badges: status NOT in {complete, completed, done}.
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const taskAggQ = useQuery({
    queryKey: ['rundown-task-aggregates', idsKey, todayStr],
    enabled: dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('tasks')
        .select('deal_id, due_date, status')
        .in('deal_id', dealIds)
        .is('archived_at', null);
      const openCountByDeal = new Map<string, number>();
      const lateByDeal = new Map<string, boolean>();
      for (const r of (rows || []) as any[]) {
        if (!r.deal_id) continue;
        const s = String(r.status ?? '').toLowerCase();
        const isOpen = s !== 'complete' && s !== 'completed' && s !== 'done';
        if (isOpen) {
          openCountByDeal.set(r.deal_id, (openCountByDeal.get(r.deal_id) ?? 0) + 1);
        }
        if (isOpen && r.due_date && r.due_date < todayStr) {
          lateByDeal.set(r.deal_id, true);
        }
      }
      return { openCountByDeal, lateByDeal };
    },
  });
  const openCountByDeal = taskAggQ.data?.openCountByDeal ?? new Map<string, number>();
  const lateByDeal = taskAggQ.data?.lateByDeal ?? new Map<string, boolean>();

  const filterOptions = useMemo(() => {
    const managers = new Set<string>();
    const types = new Set<string>();
    const statuses = new Set<string>();
    for (const d of deals as any[]) {
      if (d?.manager && String(d.manager).trim()) managers.add(String(d.manager).trim());
      if (d?.engagementType && String(d.engagementType).trim()) types.add(String(d.engagementType).trim());
      if (d?.status && String(d.status).trim()) statuses.add(String(d.status).trim());
    }
    const s = (a: string, b: string) => a.localeCompare(b);
    return {
      managers: Array.from(managers).sort(s),
      types: Array.from(types).sort(s),
      statuses: Array.from(statuses).sort(s),
    };
  }, [deals]);

  const hasAnyFilter =
    isAdmin &&
    (managerFilter.length + typeFilter.length + statusFilter.length > 0 ||
      taskFilter !== null ||
      (is5thLine && activeStagesOnly));
  const clearAllFilters = () => {
    setManagerFilter([]);
    setTypeFilter([]);
    setStatusFilter([]);
    setTaskFilter(null);
    setActiveStagesOnly(false);
  };

  const filteredSorted = useMemo(() => {
    if (!isAdmin || !hasAnyFilter) return sorted;
    return sorted.filter((d: any) => {
      if (managerFilter.length && !managerFilter.includes(String(d.manager ?? '').trim())) return false;
      if (typeFilter.length && !typeFilter.includes(String(d.engagementType ?? '').trim())) return false;
      if (statusFilter.length && !statusFilter.includes(String(d.status ?? '').trim())) return false;
      if (is5thLine && activeStagesOnly && !hasReachedFinalCreditStage(d.stage)) return false;
      if (taskFilter === 'late' && !lateByDeal.get(d.id)) return false;
      // "No tasks" = no OPEN tasks (completed-only deals + zero-task deals).
      if (taskFilter === 'none' && (openCountByDeal.get(d.id) ?? 0) > 0) return false;
      return true;
    });
  }, [sorted, isAdmin, hasAnyFilter, managerFilter, typeFilter, statusFilter, taskFilter, lateByDeal, openCountByDeal, is5thLine, activeStagesOnly]);

  // Counts for chip option labels — computed against the post-other-filter
  // set so users see how many extra deals each Tasks option would surface
  // in their current filter context.
  const tasksOptionCounts = useMemo(() => {
    const base = sorted.filter((d: any) => {
      if (managerFilter.length && !managerFilter.includes(String(d.manager ?? '').trim())) return false;
      if (typeFilter.length && !typeFilter.includes(String(d.engagementType ?? '').trim())) return false;
      if (statusFilter.length && !statusFilter.includes(String(d.status ?? '').trim())) return false;
      return true;
    });
    let late = 0;
    let none = 0;
    for (const d of base) {
      if (lateByDeal.get(d.id)) late++;
      if ((openCountByDeal.get(d.id) ?? 0) === 0) none++;
    }
    return { late, none };
  }, [sorted, managerFilter, typeFilter, statusFilter, lateByDeal, openCountByDeal]);

  const visible = useMemo(() => filteredSorted.filter((d) => !isDismissed(d.id)), [filteredSorted, isDismissed]);

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
          {filteredSorted.length === 0
            ? (hasAnyFilter ? 'No deals match the selected filters.' : emptyMessage)
            : 'All deals dismissed for today. They’ll return after the 5 AM ET reset.'}
        </p>
        {hasAnyFilter && filteredSorted.length === 0 && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="mt-3 text-xs text-white/80 hover:text-white underline"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  const masterPane = (
    <div className="popup-shell-surface flex flex-col h-full w-full min-h-0 min-w-0 max-w-full rounded-xl overflow-hidden">
      {isAdmin && (
        <div className="shrink-0 px-3 pt-2 pb-1.5 border-b border-white/5 flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="Manager"
            options={filterOptions.managers}
            selected={managerFilter}
            onChange={setManagerFilter}
          />
          <FilterChip
            label="Type"
            options={filterOptions.types}
            selected={typeFilter}
            onChange={setTypeFilter}
            formatLabel={titleCase}
          />
          {is5thLine ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={activeStagesOnly}
                    onPressedChange={setActiveStagesOnly}
                    variant="outline"
                    size="sm"
                    aria-label="Show only active-stage deals (Final Credit Items onward)"
                    className={`h-7 px-2.5 text-xs font-medium backdrop-blur-md border transition-all duration-200 ${activeStagesOnly ? 'bg-gradient-to-br from-emerald-500/25 to-green-600/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_hsl(150,70%,45%,0.2)] hover:from-emerald-500/30 hover:to-green-600/25' : 'bg-gradient-to-br from-emerald-500/10 to-green-600/5 border-emerald-500/20 text-emerald-400/70 hover:from-emerald-500/15 hover:to-green-600/10 hover:border-emerald-500/35 hover:text-emerald-300'}`}
                  >
                    Active
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Only deals at "Final Credit Items" or later</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <FilterChip
              label="Status"
              options={filterOptions.statuses}
              selected={statusFilter}
              onChange={setStatusFilter}
              formatLabel={titleCase}
            />
          )}
          <SingleSelectFilterChip<'late' | 'none'>
            label="Tasks"
            ariaLabel="Filter by tasks"
            value={taskFilter}
            onChange={setTaskFilter}
            options={[
              {
                value: 'late',
                label: 'Late tasks',
                count: tasksOptionCounts.late,
                description: 'Deals with at least one open overdue task',
              },
              {
                value: 'none',
                label: 'No tasks',
                count: tasksOptionCounts.none,
                description: 'Deals with no open tasks (all completed or none assigned)',
              },
            ]}
          />
          {hasAnyFilter && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto text-[10px] uppercase tracking-wider text-white/60 hover:text-white px-1.5 py-1 rounded hover:bg-white/10 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
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
          {/* Use a plain overflow-y-auto container instead of Radix
              ScrollArea here: Radix's Viewport wraps children in a
              `display: table` div which breaks h-full propagation, so the
              memo Card could never stretch to fill the pane. With a plain
              flex container the Card honours `flex-1 h-full` and its
              rounded frame extends all the way to the pane bottom. */}
          <div
            className="flex-1 min-h-0 px-3 py-3 overflow-y-auto flex flex-col"
            style={{ overscrollBehavior: 'contain' }}
          >
            <div className="flex-1 min-h-0 flex flex-col [&>*]:flex-1 [&>*]:min-h-0 [&>*]:h-full">
              <PipelineMemoCard
                deal={selectedDeal}
                digest={digestMap.get(selectedDeal.id)}
                rawDigest={rawByDeal.get(selectedDeal.id)}
                tasks={tasksByDeal?.get(selectedDeal.id) || []}
                milestones={milestonesByDeal?.get(selectedDeal.id)}
                isDigestLoading={digestsLoading}
                showLiveDot
                onOpenDeal={onOpenDeal}
              />
            </div>
          </div>
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
          <div className="w-[368px] shrink-0 min-w-0 max-w-[368px] min-h-0 h-full flex overflow-hidden">{masterPane}</div>
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
  const rawStage = (deal.stage as string | undefined) || '';
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
        {/* Inline-editable stage chip — clicking opens the pipeline stage
            picker without navigating away from the rundown. */}
        {rawStage && (
          <EditableDealStageTag
            dealId={deal.id}
            stage={rawStage}
            pipelineId={deal.pipelineId}
            hideChevron
          />
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
