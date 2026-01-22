import { useState, useEffect, useCallback } from 'react';

export type LenderSectionId = 
  | 'lending-criteria' 
  | 'about' 
  | 'upfront-checklist' 
  | 'post-term-sheet-checklist'
  | 'contact-info' 
  | 'additional-preferences'
  | 'active-deals'
  | 'attachments'
  | 'deals-sent'
  | 'pass-reasons';

export interface LenderSection {
  id: LenderSectionId;
  label: string;
}

const DEFAULT_SECTION_ORDER: LenderSectionId[] = [
  'lending-criteria',
  'about',
  'upfront-checklist',
  'post-term-sheet-checklist',
  'contact-info',
  'additional-preferences',
  'active-deals',
  'attachments',
  'deals-sent',
  'pass-reasons',
];

const STORAGE_KEY = 'lender-detail-section-order';

export function useLenderSectionOrder() {
  const [sectionOrder, setSectionOrder] = useState<LenderSectionId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that all sections are present
        if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTION_ORDER.length) {
          const hasAll = DEFAULT_SECTION_ORDER.every(id => parsed.includes(id));
          if (hasAll) return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SECTION_ORDER;
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  const reorderSections = useCallback((fromIndex: number, toIndex: number) => {
    setSectionOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return newOrder;
    });
  }, []);

  const setSectionOrderDirect = useCallback((newOrder: LenderSectionId[]) => {
    setSectionOrder(newOrder);
  }, []);

  const resetToDefault = useCallback(() => {
    setSectionOrder(DEFAULT_SECTION_ORDER);
  }, []);

  return {
    sectionOrder,
    reorderSections,
    setSectionOrderDirect,
    resetToDefault,
    defaultOrder: DEFAULT_SECTION_ORDER,
  };
}
