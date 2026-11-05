import { useState, useEffect, useCallback } from 'react';

export type LenderSectionId = 
  | 'lending-criteria' 
  | 'about' 
  | 'upfront-checklist' 
  | 'post-term-sheet-checklist'
  | 'contact-info' 
  | 'additional-preferences'
  | 'lender-notes'
  | 'active-deals'
  | 'attachments'
  | 'deals-sent'
  | 'on-deck-deals'
  | 'excluded-deals'
  | 'pass-reasons'
  | 'change-log';

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
  'lender-notes',
  'active-deals',
  'attachments',
  'deals-sent',
  'on-deck-deals',
  'excluded-deals',
  'pass-reasons',
  'change-log',
];

const STORAGE_KEY = 'lender-detail-section-order';

export function useLenderSectionOrder() {
  const [sectionOrder, setSectionOrder] = useState<LenderSectionId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that all sections are present
        if (Array.isArray(parsed)) {
          // Keep the user's saved order; slot in any newly added sections
          // right after the section that precedes them by default.
          const known = parsed.filter((id): id is LenderSectionId => DEFAULT_SECTION_ORDER.includes(id));
          DEFAULT_SECTION_ORDER.forEach((id, i) => {
            if (known.includes(id)) return;
            const prev = DEFAULT_SECTION_ORDER[i - 1];
            const at = prev ? known.indexOf(prev) + 1 : 0;
            known.splice(at, 0, id);
          });
          if (known.length === DEFAULT_SECTION_ORDER.length) return known;
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
