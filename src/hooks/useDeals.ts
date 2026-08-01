import { useState, useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { Deal, DealStage, DealStatus, EngagementType } from '@/types/deal';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAiDealFilterStore } from '@/stores/aiDealFilterStore';
import { applyDealFilterRules } from '@/lib/dealFilterEngine';

export type SortField =
  | 'name'
  | 'company'
  | 'value'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'stage'
  | 'flexEngagement'
  | 'manager'
  | 'engagementType'
  | 'totalFee'
  | 'totalHours'
  | 'revenuePerHour'
  | 'lateMilestones';
export type SortDirection = 'asc' | 'desc';

export interface DealFilters {
  search: string;
  stage: DealStage[];
  status: DealStatus[];
  engagementType: EngagementType[];
  dealType: string[];
  manager: string[];
  lender: string[];
  dealOwner: string[];
  referredBy: string[];
  sourcedVia: string[];
  staleOnly: boolean;
  flaggedOnly: boolean;
  hasNotificationsOnly: boolean;
  /**
   * Tasks filter:
   *  - 'all'          → no filter
   *  - 'has'          → only deals with any open tasks
   *  - 'none'         → only deals with zero open tasks
   *  - 'overdue_only' → only deals whose open tasks are ALL past due
   *                     (i.e. no current non-overdue tasks AND at least
   *                     one past-due task).
   */
  tasksFilter: 'all' | 'has' | 'none' | 'overdue_only';
  /** 3-state segmented control: 'all' (no filter), 'has' (only deals with active notifications), 'none' (only deals with no notifications). */
  notificationsFilter: 'all' | 'has' | 'none';
  /** Per-column header filters (added for in-table filter popovers). */
  companyContains?: string;
  valueMin?: number | null;
  valueMax?: number | null;
  totalFeeMin?: number | null;
  totalFeeMax?: number | null;
  totalHoursMin?: number | null;
  totalHoursMax?: number | null;
  revenuePerHourMin?: number | null;
  revenuePerHourMax?: number | null;
  /** Show only deals updated within the last N days (column header filter). */
  updatedWithinDays?: number | null;
  /** Show only deals with at least one late milestone. */
  hasLateMilestonesOnly?: boolean;
}

export const DEFAULT_DEAL_FILTERS: DealFilters = {
  search: '',
  stage: [],
  status: [],
  engagementType: [],
  dealType: [],
  manager: [],
  lender: [],
  dealOwner: [],
  referredBy: [],
  sourcedVia: [],
  staleOnly: false,
  flaggedOnly: false,
  hasNotificationsOnly: false,
  tasksFilter: 'all',
  notificationsFilter: 'all',
  companyContains: '',
  valueMin: null,
  valueMax: null,
  totalFeeMin: null,
  totalFeeMax: null,
  totalHoursMin: null,
  totalHoursMax: null,
  revenuePerHourMin: null,
  revenuePerHourMax: null,
  updatedWithinDays: null,
  hasLateMilestonesOnly: false,
};

export interface UseDealsOptions {
  initialFilters?: DealFilters;
  initialSortField?: SortField;
  initialSortDirection?: SortDirection;
}

export function useDeals(options?: UseDealsOptions) {
  const { deals, updateDealStatus: updateStatus, isLoading } = useDealsContext();
  const { preferences } = usePreferences();
  const { stages } = useDealStages();
  const [filters, setFilters] = useState<DealFilters>(
    options?.initialFilters
      ? { ...DEFAULT_DEAL_FILTERS, ...options.initialFilters }
      : DEFAULT_DEAL_FILTERS
  );
  const [sortField, setSortField] = useState<SortField>(options?.initialSortField ?? 'updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>(options?.initialSortDirection ?? 'desc');
  const aiRules = useAiDealFilterStore((s) => s.rules);
  const aiMatchMode = useAiDealFilterStore((s) => s.matchMode);

  const filteredAndSortedDeals = useMemo(() => {
    let result = [...deals];

    // Apply filters
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        (deal) =>
          deal.name.toLowerCase().includes(searchLower) ||
          deal.company.toLowerCase().includes(searchLower) ||
          deal.contact.toLowerCase().includes(searchLower)
      );
    }

    if (filters.stage.length > 0) {
      result = result.filter((deal) => filters.stage.includes(deal.stage));
    }

    if (filters.status.length > 0) {
      result = result.filter((deal) => {
        if (deal.status == null) {
          // Allow either the explicit "No status" sentinel or a literal null
          // in the filter set to match unset-status deals.
          return (filters.status as unknown[]).includes('__no_status__' as never)
            || (filters.status as unknown[]).includes(null as never);
        }
        return filters.status.includes(deal.status);
      });
    }

    if (filters.engagementType.length > 0) {
      result = result.filter((deal) => filters.engagementType.includes(deal.engagementType));
    }

    if (filters.dealType.length > 0) {
      result = result.filter((deal) => 
        deal.dealTypes && deal.dealTypes.some(dt => filters.dealType.includes(dt))
      );
    }

    if (filters.manager.length > 0) {
      result = result.filter((deal) => filters.manager.includes(deal.manager));
    }

    if (filters.lender.length > 0) {
      result = result.filter((deal) => filters.lender.includes(deal.lender));
    }

    if (filters.dealOwner.length > 0) {
      result = result.filter((deal) => deal.dealOwner && filters.dealOwner.includes(deal.dealOwner));
    }

    if (filters.referredBy.length > 0) {
      result = result.filter((deal) => deal.referredBy && filters.referredBy.includes(deal.referredBy.id));
    }

    if (filters.sourcedVia.length > 0) {
      result = result.filter((deal) => deal.sourcedVia && filters.sourcedVia.includes(deal.sourcedVia));
    }

    if (filters.staleOnly) {
      const now = new Date();
      result = result.filter((deal) => {
        if (deal.status === 'archived') return false;
        const daysSinceUpdate = differenceInDays(now, new Date(deal.updatedAt));
        return daysSinceUpdate >= preferences.staleDealsDays;
      });
    }

    if (filters.flaggedOnly) {
      result = result.filter((deal) => deal.isFlagged === true);
    }

    // ── Per-column header filters ─────────────────────────────
    if (filters.companyContains && filters.companyContains.trim()) {
      const q = filters.companyContains.trim().toLowerCase();
      result = result.filter((d) => (d.company || '').toLowerCase().includes(q));
    }
    if (filters.valueMin != null) result = result.filter((d) => (d.value ?? 0) >= filters.valueMin!);
    if (filters.valueMax != null) result = result.filter((d) => (d.value ?? 0) <= filters.valueMax!);
    if (filters.totalFeeMin != null) result = result.filter((d) => (d.totalFee ?? 0) >= filters.totalFeeMin!);
    if (filters.totalFeeMax != null) result = result.filter((d) => (d.totalFee ?? 0) <= filters.totalFeeMax!);
    if (filters.totalHoursMin != null) {
      result = result.filter((d) => ((d.preSigningHours || 0) + (d.postSigningHours || 0)) >= filters.totalHoursMin!);
    }
    if (filters.totalHoursMax != null) {
      result = result.filter((d) => ((d.preSigningHours || 0) + (d.postSigningHours || 0)) <= filters.totalHoursMax!);
    }
    if (filters.revenuePerHourMin != null || filters.revenuePerHourMax != null) {
      result = result.filter((d) => {
        const hours = (d.preSigningHours || 0) + (d.postSigningHours || 0);
        if (hours <= 0 || !d.totalFee) return false;
        const rph = d.totalFee / hours;
        if (filters.revenuePerHourMin != null && rph < filters.revenuePerHourMin) return false;
        if (filters.revenuePerHourMax != null && rph > filters.revenuePerHourMax) return false;
        return true;
      });
    }
    if (filters.updatedWithinDays != null && filters.updatedWithinDays > 0) {
      const now = new Date();
      result = result.filter((d) => differenceInDays(now, new Date(d.updatedAt)) <= filters.updatedWithinDays!);
    }
    if (filters.hasLateMilestonesOnly) {
      const now = Date.now();
      result = result.filter((d) =>
        (d.milestones || []).some(
          (m) => !m.completed && m.dueDate && new Date(m.dueDate).getTime() < now,
        ),
      );
    }

    // ── AI-driven natural-language filters ──────────────────
    // Applied on top of the standard filters as an AND layer so the AI
    // assistant cooperates with whatever the user already set via the
    // existing UI controls.
    if (aiRules.length > 0) {
      result = applyDealFilterRules(result, aiRules, { stages }, aiMatchMode);
    }

    // Apply sorting
    // Status order for sorting
    const statusOrder: Record<DealStatus, number> = {
      'on-track': 0,
      'at-risk': 1,
      'off-track': 2,
      'on-hold': 3,
      'archived': 4,
    };
    // Deals with no status always sort last regardless of direction, so the
    // empty pill never floats to the top of the list when sorting by status.
    const STATUS_NULL_RANK = Number.MAX_SAFE_INTEGER;

    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'company':
          comparison = (a.company || '').localeCompare(b.company || '');
          break;
        case 'value':
          comparison = a.value - b.value;
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'status': {
          const aRank = a.status ? statusOrder[a.status] : STATUS_NULL_RANK;
          const bRank = b.status ? statusOrder[b.status] : STATUS_NULL_RANK;
          // Force nulls to the bottom for both directions.
          if (aRank === STATUS_NULL_RANK && bRank !== STATUS_NULL_RANK) return 1;
          if (bRank === STATUS_NULL_RANK && aRank !== STATUS_NULL_RANK) return -1;
          comparison = aRank - bRank;
          break;
        }
        case 'stage': {
          const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
          const aIdx = stageOrder.get(a.stage) ?? 999;
          const bIdx = stageOrder.get(b.stage) ?? 999;
          comparison = aIdx - bIdx;
          break;
        }
        case 'manager':
          comparison = (a.manager || '').localeCompare(b.manager || '');
          break;
        case 'engagementType':
          comparison = (a.engagementType || '').localeCompare(b.engagementType || '');
          break;
        case 'totalFee':
          comparison = (a.totalFee || 0) - (b.totalFee || 0);
          break;
        case 'totalHours':
          comparison =
            ((a.preSigningHours || 0) + (a.postSigningHours || 0)) -
            ((b.preSigningHours || 0) + (b.postSigningHours || 0));
          break;
        case 'revenuePerHour': {
          const rate = (d: typeof a) => {
            const h = (d.preSigningHours || 0) + (d.postSigningHours || 0);
            return h > 0 && d.totalFee ? d.totalFee / h : -1;
          };
          comparison = rate(a) - rate(b);
          break;
        }
        case 'lateMilestones': {
          const late = (d: typeof a) =>
            (d.milestones || []).filter(
              (m) => !m.completed && m.dueDate && new Date(m.dueDate).getTime() < Date.now(),
            ).length;
          comparison = late(a) - late(b);
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // ── Stabilize ordering ────────────────────────────────────────────────
    // Background refreshes (realtime, agent writes) constantly bump
    // `updated_at`, which made the list visibly re-shuffle every few
    // seconds. Freeze the resolved order per sort key: rows keep the slot
    // they were first given, and only newly appearing deals are inserted at
    // their freshly-computed position. Changing sort field/direction (or
    // re-applying the same sort) resets the snapshot.
    const key = `${sortField}:${sortDirection}`;
    const snapshot = orderSnapshotRef.current;
    if (snapshot.key !== key) {
      snapshot.key = key;
      snapshot.order = new Map();
    }
    const prevOrder = snapshot.order;
    const effective = new Map<string, number>();
    let lastIndex = -1;
    result.forEach((deal) => {
      const known = prevOrder.get(deal.id);
      if (known !== undefined) {
        lastIndex = known;
        effective.set(deal.id, known);
      } else {
        lastIndex = lastIndex + 0.5;
        effective.set(deal.id, lastIndex);
      }
    });
    result.sort((a, b) => (effective.get(a.id)! - effective.get(b.id)!));

    const nextOrder = new Map(prevOrder);
    result.forEach((deal, i) => nextOrder.set(deal.id, i));
    snapshot.order = nextOrder;

    return result;
  }, [deals, filters, sortField, sortDirection, stages, aiRules, aiMatchMode]);

  const updateDealStatus = (dealId: string, newStatus: DealStatus | null) => {
    updateStatus(dealId, newStatus);
  };

  const updateFilters = (newFilters: Partial<DealFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  // Wrap setFilters so legacy/saved views missing newer keys (e.g. dealOwner)
  // get backfilled with defaults instead of producing undefined arrays.
  const safeSetFilters: typeof setFilters = (next) => {
    if (typeof next === 'function') {
      setFilters((prev) => ({
        ...DEFAULT_DEAL_FILTERS,
        ...(next as (p: DealFilters) => DealFilters)(prev),
      }));
    } else {
      setFilters({ ...DEFAULT_DEAL_FILTERS, ...next });
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const stats = useMemo(() => {
    // Exclude siloed "Projects" pipeline deals from ALL top-line stats.
    const countable = deals.filter(
      (d) => (d.pipelineName || '').trim().toLowerCase() !== 'projects'
    );
    const activeDeals = countable.filter((d) => d.status !== 'archived').length;
    const activeDealValue = countable
      .filter((d) => d.status !== 'archived')
      .reduce((sum, deal) => sum + deal.value, 0);
    const dealsInDiligence = countable.filter((d) => d.stage === 'in-due-diligence').length;
    const dollarsInDiligence = countable
      .filter((d) => d.stage === 'in-due-diligence')
      .reduce((sum, deal) => sum + deal.value, 0);

    return { activeDeals, activeDealValue, dealsInDiligence, dollarsInDiligence, totalDeals: countable.length };
  }, [deals]);

  return {
    deals: filteredAndSortedDeals,
    filters,
    sortField,
    sortDirection,
    stats,
    isLoading,
    updateDealStatus,
    updateFilters,
    toggleSort,
    setFilters: safeSetFilters,
    setSortField,
    setSortDirection,
  };
}
