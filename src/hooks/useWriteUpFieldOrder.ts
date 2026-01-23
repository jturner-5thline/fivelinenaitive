import { useState, useEffect, useCallback } from 'react';

export type WriteUpFieldId = 
  | 'companyName'
  | 'companyUrl'
  | 'linkedinUrl'
  | 'location'
  | 'industries'
  | 'yearFounded'
  | 'headcount'
  | 'dealTypes'
  | 'billingModels'
  | 'profitability'
  | 'grossMargins'
  | 'capitalAsk'
  | 'financialDataAsOf'
  | 'accountingSystem'
  | 'status'
  | 'useOfFunds'
  | 'existingDebtDetails'
  | 'description';

export interface WriteUpField {
  id: WriteUpFieldId;
  label: string;
  required?: boolean;
}

export const WRITEUP_FIELD_CONFIG: Record<WriteUpFieldId, { label: string; required?: boolean }> = {
  companyName: { label: 'Company Name', required: true },
  companyUrl: { label: 'Company URL' },
  linkedinUrl: { label: 'LinkedIn URL' },
  location: { label: 'Location', required: true },
  industries: { label: 'Industry', required: true },
  yearFounded: { label: 'Year Founded' },
  headcount: { label: 'Headcount' },
  dealTypes: { label: 'Deal Type', required: true },
  billingModels: { label: 'Billing Model', required: true },
  profitability: { label: 'Profitability', required: true },
  grossMargins: { label: 'Gross Margins', required: true },
  capitalAsk: { label: 'Capital Ask', required: true },
  financialDataAsOf: { label: 'Financial Data As Of' },
  accountingSystem: { label: 'Accounting System' },
  status: { label: 'Status' },
  useOfFunds: { label: 'Use of Funds' },
  existingDebtDetails: { label: 'Existing Debt Details' },
  description: { label: 'Description' },
};

const DEFAULT_FIELD_ORDER: WriteUpFieldId[] = [
  'companyName',
  'companyUrl',
  'linkedinUrl',
  'location',
  'industries',
  'yearFounded',
  'headcount',
  'dealTypes',
  'billingModels',
  'profitability',
  'grossMargins',
  'capitalAsk',
  'financialDataAsOf',
  'accountingSystem',
  'status',
  'useOfFunds',
  'existingDebtDetails',
  'description',
];

const STORAGE_KEY = 'deal-writeup-field-order';

export function useWriteUpFieldOrder() {
  const [fieldOrder, setFieldOrder] = useState<WriteUpFieldId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that all fields are present
        if (Array.isArray(parsed) && parsed.length === DEFAULT_FIELD_ORDER.length) {
          const hasAll = DEFAULT_FIELD_ORDER.every(id => parsed.includes(id));
          if (hasAll) return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_FIELD_ORDER;
  });

  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fieldOrder));
  }, [fieldOrder]);

  const reorderFields = useCallback((newOrder: WriteUpFieldId[]) => {
    setFieldOrder(newOrder);
  }, []);

  const resetToDefault = useCallback(() => {
    setFieldOrder(DEFAULT_FIELD_ORDER);
  }, []);

  return {
    fieldOrder,
    isReorderDialogOpen,
    setIsReorderDialogOpen,
    reorderFields,
    resetToDefault,
    DEFAULT_FIELD_ORDER,
  };
}
