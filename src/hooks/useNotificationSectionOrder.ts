import { useState, useEffect, useCallback } from 'react';

export type NotificationSectionId = 
  | 'alerts'
  | 'flex'
  | 'tasks'
  | 'suggestions'
  | 'activity';

export interface NotificationSection {
  id: NotificationSectionId;
  label: string;
}

const DEFAULT_SECTION_ORDER: NotificationSectionId[] = [
  'alerts',
  'flex',
  'tasks',
  'suggestions',
  'activity',
];

const STORAGE_KEY = 'notification-section-order';

export function useNotificationSectionOrder() {
  const [sectionOrder, setSectionOrder] = useState<NotificationSectionId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
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

  const setSectionOrderDirect = useCallback((newOrder: NotificationSectionId[]) => {
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
