import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useDealsDatabase } from '@/hooks/useDealsDatabase';
import { Deal, DealLender, DealStatus, DealStage, EngagementType } from '@/types/deal';

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
}

interface DealsContextType {
  deals: Deal[];
  isLoading: boolean;
  error: Error | null;
  createDeal: (dealData: Partial<Deal>) => Promise<Deal | null>;
  updateDeal: (dealId: string, updates: Partial<Deal>) => Promise<void>;
  updateDealStatus: (dealId: string, newStatus: DealStatus) => Promise<void>;
  addLenderToDeal: (dealId: string, lenderData: Partial<DealLender>) => Promise<DealLender | null>;
  updateLender: (lenderId: string, updates: Partial<DealLender>) => Promise<void>;
  deleteLender: (lenderId: string) => Promise<void>;
  deleteLenderNoteHistory: (noteId: string, lenderId: string) => Promise<void>;
  deleteDeal: (dealId: string) => Promise<void>;
  getDealById: (dealId: string) => Deal | undefined;
  refreshDeals: () => Promise<void>;
}

const DealsContext = createContext<DealsContextType | undefined>(undefined);

export function DealsProvider({ children }: { children: ReactNode }) {
  const {
    deals,
    isLoading,
    error,
    fetchDeals,
    createDeal,
    updateDeal,
    updateDealStatus,
    addLenderToDeal,
    updateLender,
    deleteLender,
    deleteLenderNoteHistory,
    deleteDeal,
    getDealById,
  } = useDealsDatabase();

  const value = useMemo(() => ({
    deals,
    isLoading,
    error,
    createDeal,
    updateDeal,
    updateDealStatus,
    addLenderToDeal,
    updateLender,
    deleteLender,
    deleteLenderNoteHistory,
    deleteDeal,
    getDealById,
    refreshDeals: fetchDeals,
  }), [
    deals,
    isLoading,
    error,
    createDeal,
    updateDeal,
    updateDealStatus,
    addLenderToDeal,
    updateLender,
    deleteLender,
    deleteLenderNoteHistory,
    deleteDeal,
    getDealById,
    fetchDeals,
  ]);

  return (
    <DealsContext.Provider value={value}>
      {children}
    </DealsContext.Provider>
  );
}

export function useDealsContext() {
  const context = useContext(DealsContext);
  if (!context) {
    throw new Error('useDealsContext must be used within a DealsProvider');
  }
  return context;
}
