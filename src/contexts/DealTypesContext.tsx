import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface DealTypeOption {
  id: string;
  label: string;
}

interface DealTypesContextType {
  dealTypes: DealTypeOption[];
  addDealType: (dealType: Omit<DealTypeOption, 'id'>) => void;
  updateDealType: (id: string, dealType: Omit<DealTypeOption, 'id'>) => void;
  deleteDealType: (id: string) => void;
  reorderDealTypes: (dealTypes: DealTypeOption[]) => void;
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

export function DealTypesProvider({ children }: { children: ReactNode }) {
  const [dealTypes, setDealTypes] = useState<DealTypeOption[]>(() => {
    const saved = localStorage.getItem('dealTypes');
    return saved ? JSON.parse(saved) : defaultDealTypes;
  });

  const saveDealTypes = (newDealTypes: DealTypeOption[]) => {
    setDealTypes(newDealTypes);
    localStorage.setItem('dealTypes', JSON.stringify(newDealTypes));
  };

  const addDealType = (dealType: Omit<DealTypeOption, 'id'>) => {
    const id = dealType.label.toLowerCase().replace(/\s+/g, '-');
    const newDealType = { id, ...dealType };
    saveDealTypes([...dealTypes, newDealType]);
  };

  const updateDealType = (id: string, dealType: Omit<DealTypeOption, 'id'>) => {
    saveDealTypes(dealTypes.map(dt => dt.id === id ? { ...dt, ...dealType } : dt));
  };

  const deleteDealType = (id: string) => {
    saveDealTypes(dealTypes.filter(dt => dt.id !== id));
  };

  const reorderDealTypes = (newDealTypes: DealTypeOption[]) => {
    saveDealTypes(newDealTypes);
  };

  return (
    <DealTypesContext.Provider value={{
      dealTypes,
      addDealType,
      updateDealType,
      deleteDealType,
      reorderDealTypes,
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
