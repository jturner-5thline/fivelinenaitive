import { useState, useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { Deal, DealStage, DealStatus, EngagementType } from '@/types/deal';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAiDealFilterStore } from '@/stores/aiDealFilterStore';
import { applyDealFilterRules } from '@/lib/dealFilterEngine';

export type SortField = 'name' | 'value' | 'createdAt' | 'updatedAt' | 'status' | 'stage' | 'flexEngagement';
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
  /** 3-state segmented control: 'all' (no filter), 'has' (only deals with open tasks), 'none' (only deals with zero open tasks). */
  tasksFilter: 'all' | 'has' | 'none';
  /** 3-state segmented control: 'all' (no filter), 'has' (only deals with active notifications), 'none' (only deals with no notifications). */
  notificationsFilter: 'all' | 'has' | 'none';
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
      result = result.filter((deal) => filters.status.includes(deal.status));
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

    result.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
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
        case 'status':
          comparison = statusOrder[a.status] - statusOrder[b.status];
          break;
        case 'stage': {
          const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
          const aIdx = stageOrder.get(a.stage) ?? 999;
          const bIdx = stageOrder.get(b.stage) ?? 999;
          comparison = aIdx - bIdx;
          break;
        }
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [deals, filters, sortField, sortDirection, stages, aiRules, aiMatchMode]);

  const updateDealStatus = (dealId: string, newStatus: DealStatus) => {
    updateStatus(dealId, newStatus);
  };

  const updateFilters = (newFilters: Partial<DealFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
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
    const activeDeals = deals.filter((d) => d.status !== 'archived').length;
    const activeDealValue = deals
      .filter((d) => d.status !== 'archived')
      .reduce((sum, deal) => sum + deal.value, 0);
    const dealsInDiligence = deals.filter((d) => d.stage === 'in-due-diligence').length;
    const dollarsInDiligence = deals
      .filter((d) => d.stage === 'in-due-diligence')
      .reduce((sum, deal) => sum + deal.value, 0);

    return { activeDeals, activeDealValue, dealsInDiligence, dollarsInDiligence, totalDeals: deals.length };
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
    setFilters,
    setSortField,
    setSortDirection,
  };
}
