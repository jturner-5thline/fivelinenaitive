import { useState, useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { Deal, DealStage, DealStatus, EngagementType } from '@/types/deal';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';

export type SortField = 'name' | 'value' | 'createdAt' | 'updatedAt' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface DealFilters {
  search: string;
  stage: DealStage[];
  status: DealStatus[];
  engagementType: EngagementType[];
  manager: string[];
  lender: string[];
  referredBy: string[];
  staleOnly: boolean;
  flaggedOnly: boolean;
}

export function useDeals() {
  const { deals, updateDealStatus: updateStatus, isLoading } = useDealsContext();
  const { preferences } = usePreferences();
  const [filters, setFilters] = useState<DealFilters>({
    search: '',
    stage: [],
    status: [],
    engagementType: [],
    manager: [],
    lender: [],
    referredBy: [],
    staleOnly: false,
    flaggedOnly: false,
  });
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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

    if (filters.manager.length > 0) {
      result = result.filter((deal) => filters.manager.includes(deal.manager));
    }

    if (filters.lender.length > 0) {
      result = result.filter((deal) => filters.lender.includes(deal.lender));
    }

    if (filters.referredBy.length > 0) {
      result = result.filter((deal) => deal.referredBy && filters.referredBy.includes(deal.referredBy.id));
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
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [deals, filters, sortField, sortDirection]);

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
  };
}
