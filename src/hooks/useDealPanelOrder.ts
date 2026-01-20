import { useState, useEffect, useCallback } from 'react';

export type DealPanelId = 
  | 'ai-research' 
  | 'ai-assistant' 
  | 'ai-activity-summary' 
  | 'ai-suggestions' 
  | 'deal-information' 
  | 'outstanding-items';

export interface DealPanel {
  id: DealPanelId;
  label: string;
}

const DEFAULT_PANEL_ORDER: DealPanelId[] = [
  'ai-research',
  'ai-assistant',
  'ai-activity-summary',
  'ai-suggestions',
  'deal-information',
  'outstanding-items',
];

const STORAGE_KEY = 'deal-detail-panel-order';

export function useDealPanelOrder() {
  const [panelOrder, setPanelOrder] = useState<DealPanelId[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate that all panels are present
        if (Array.isArray(parsed) && parsed.length === DEFAULT_PANEL_ORDER.length) {
          const hasAll = DEFAULT_PANEL_ORDER.every(id => parsed.includes(id));
          if (hasAll) return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_PANEL_ORDER;
  });

  const [isEditMode, setIsEditMode] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelOrder));
  }, [panelOrder]);

  const reorderPanels = useCallback((fromIndex: number, toIndex: number) => {
    setPanelOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return newOrder;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setPanelOrder(DEFAULT_PANEL_ORDER);
  }, []);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  return {
    panelOrder,
    isEditMode,
    setIsEditMode,
    toggleEditMode,
    reorderPanels,
    resetToDefault,
  };
}
