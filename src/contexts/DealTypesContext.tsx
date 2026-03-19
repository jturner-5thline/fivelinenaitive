import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Json } from '@/integrations/supabase/types';

export interface DealTypeOption {
  id: string;
  label: string;
}

interface DealTypesContextType {
  dealTypes: DealTypeOption[];
  isLoading: boolean;
  addDealType: (dealType: Omit<DealTypeOption, 'id'>) => void;
  updateDealType: (id: string, dealType: Omit<DealTypeOption, 'id'>) => void;
  deleteDealType: (id: string) => void;
  reorderDealTypes: (dealTypes: DealTypeOption[]) => void;
  saveDealTypes: (dealTypes: DealTypeOption[]) => Promise<void>;
}

const DealTypesContext = createContext<DealTypesContextType | undefined>(undefined);

const defaultDealTypes: DealTypeOption[] = [
  { id: 'growth-capital', label: 'Growth Capital' },
  { id: 'capex-financing', label: 'CapEx Financing' },
  { id: 'abl', label: 'ABL' },
  { id: 'acquisition-financing', label: 'Acquisition Financing' },
  { id: 'refinancing', label: 'Refinancing' },
  { id: 'micro-debt', label: 'Micro Debt' },
];

const parseDealTypesFromJson = (json: Json | null): DealTypeOption[] | null => {
  if (!json || !Array.isArray(json)) return null;
  const valid = json.filter((item): item is { id: string; label: string } => {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).id === 'string' &&
      typeof (item as Record<string, unknown>).label === 'string'
    );
  });
  return valid.length > 0 ? valid : null;
};

export function DealTypesProvider({ children }: { children: ReactNode }) {
  const { company } = useCompany();
  const [dealTypes, setDealTypes] = useState<DealTypeOption[]>(defaultDealTypes);
  const [isLoading, setIsLoading] = useState(true);
  const companyId = company?.id;

  // Load from database
  useEffect(() => {
    const fetchDealTypes = async () => {
      if (!companyId) {
        // Fallback to localStorage for users without a company
        const saved = localStorage.getItem('dealTypes');
        setDealTypes(saved ? JSON.parse(saved) : defaultDealTypes);
        setIsLoading(false);
        return;
      }

      try {
        const { data: settings } = await supabase
          .from('company_settings')
          .select('deal_types')
          .eq('company_id', companyId)
          .maybeSingle();

        const dbTypes = parseDealTypesFromJson(settings?.deal_types ?? null);
        if (dbTypes) {
          setDealTypes(dbTypes);
        } else {
          // Fallback to localStorage if no DB data yet
          const saved = localStorage.getItem('dealTypes');
          setDealTypes(saved ? JSON.parse(saved) : defaultDealTypes);
        }
      } catch (error) {
        console.error('Error fetching deal types:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDealTypes();
  }, [companyId]);

  const persistDealTypes = useCallback(async (newDealTypes: DealTypeOption[]) => {
    setDealTypes(newDealTypes);
    
    if (companyId) {
      try {
        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .eq('company_id', companyId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('company_settings')
            .update({ deal_types: newDealTypes as unknown as Json })
            .eq('company_id', companyId);
        } else {
          await supabase
            .from('company_settings')
            .insert({ company_id: companyId, deal_types: newDealTypes as unknown as Json });
        }
      } catch (error) {
        console.error('Error saving deal types:', error);
      }
    }
    // Also save to localStorage as fallback
    localStorage.setItem('dealTypes', JSON.stringify(newDealTypes));
  }, [companyId]);

  const addDealType = (dealType: Omit<DealTypeOption, 'id'>) => {
    const id = dealType.label.toLowerCase().replace(/\s+/g, '-');
    const newDealType = { id, ...dealType };
    const updated = [...dealTypes, newDealType];
    persistDealTypes(updated);
  };

  const updateDealType = (id: string, dealType: Omit<DealTypeOption, 'id'>) => {
    const updated = dealTypes.map(dt => dt.id === id ? { ...dt, ...dealType } : dt);
    persistDealTypes(updated);
  };

  const deleteDealType = (id: string) => {
    const updated = dealTypes.filter(dt => dt.id !== id);
    persistDealTypes(updated);
  };

  const reorderDealTypes = (newDealTypes: DealTypeOption[]) => {
    persistDealTypes(newDealTypes);
  };

  const saveDealTypes = async (newDealTypes: DealTypeOption[]) => {
    await persistDealTypes(newDealTypes);
  };

  return (
    <DealTypesContext.Provider value={{
      dealTypes,
      isLoading,
      addDealType,
      updateDealType,
      deleteDealType,
      reorderDealTypes,
      saveDealTypes,
    }}>
      {children}
    </DealTypesContext.Provider>
  );
}

export function useDealTypes() {
  const context = useContext(DealTypesContext);
  if (!context) {
    throw new Error('useDealTypes must be used within a DealTypesProvider');
  }
  return context;
}
