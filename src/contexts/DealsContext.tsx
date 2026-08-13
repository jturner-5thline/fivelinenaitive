import { createContext, useContext, useEffect, ReactNode, useMemo } from 'react';
import { useDealsDatabase } from '@/hooks/useDealsDatabase';
import { Deal, DealLender, DealStatus, DealStage, EngagementType } from '@/types/deal';
import { IntroducedFundingSourcesDialog } from '@/components/deals/IntroducedFundingSourcesDialog';

export type SortField = 'name' | 'value' | 'createdAt' | 'updatedAt' | 'status' | 'stage';
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
  updateDealStatus: (dealId: string, newStatus: DealStatus | null) => Promise<void>;
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

  // Listen for copilot write actions that affect deals
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const refreshTypes = [
        'update_deal_stage', 'update_lender_status', 'toggle_milestone',
        'add_milestone', 'create_outstanding_item', 'complete_outstanding_item',
        'delete_outstanding_item', 'add_deal_note', 'update_deal_flag',
        'update_deal_fields', 'move_deal_pipeline', 'link_contact_to_deal',
      ];
      if (detail?.actionType && refreshTypes.includes(detail.actionType)) {
        fetchDeals();
      }
    };
    window.addEventListener('copilot-action-completed', handler);
    return () => window.removeEventListener('copilot-action-completed', handler);
  }, [fetchDeals]);

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
      <IntroducedFundingSourcesDialog
        addLenderToDeal={addLenderToDeal}
        refreshDeals={fetchDeals}
      />
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
