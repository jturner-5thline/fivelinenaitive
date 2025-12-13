import { useState, useMemo } from 'react';
import { Deal, DealStage, DealStatus, EngagementType } from '@/types/deal';
import { mockDeals } from '@/data/mockDeals';

export type SortField = 'name' | 'value' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface DealFilters {
  search: string;
  stage: DealStage[];
  status: DealStatus[];
  engagementType: EngagementType[];
  manager: string[];
  lender: string[];
}

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>(mockDeals);
  const [filters, setFilters] = useState<DealFilters>({
    search: '',
    stage: [],
    status: [],
    engagementType: [],
    manager: [],
    lender: [],
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

    // Apply sorting
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
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [deals, filters, sortField, sortDirection]);

  const updateDealStatus = (dealId: string, newStatus: DealStatus) => {
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId
          ? { ...deal, status: newStatus, updatedAt: new Date().toISOString().split('T')[0] }
          : deal
      )
    );
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
    const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);
    const activeDeals = deals.filter((d) => d.status === 'active').length;
    const completedDeals = deals.filter((d) => d.status === 'completed').length;
    const completionRate = deals.length > 0 ? (completedDeals / deals.length) * 100 : 0;

    return { totalValue, activeDeals, completedDeals, completionRate, totalDeals: deals.length };
  }, [deals]);

  return {
    deals: filteredAndSortedDeals,
    filters,
    sortField,
    sortDirection,
    stats,
    updateDealStatus,
    updateFilters,
    toggleSort,
  };
}
