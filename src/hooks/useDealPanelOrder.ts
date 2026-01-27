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

// Panels that cannot be hidden
export const ALWAYS_VISIBLE_PANELS: DealPanelId[] = ['deal-information', 'outstanding-items'];

const DEFAULT_PANEL_ORDER: DealPanelId[] = [
  'ai-research',
  'ai-assistant',
  'ai-activity-summary',
  'ai-suggestions',
  'deal-information',
  'outstanding-items',
];

// Default visibility: all panels visible
const DEFAULT_PANEL_VISIBILITY: Record<DealPanelId, boolean> = {
  'ai-research': true,
  'ai-assistant': true,
  'ai-activity-summary': true,
  'ai-suggestions': true,
  'deal-information': true,
  'outstanding-items': true,
};

const ORDER_STORAGE_KEY = 'deal-detail-panel-order';
const VISIBILITY_STORAGE_KEY = 'deal-detail-panel-visibility';

export function useDealPanelOrder() {
  const [panelOrder, setPanelOrder] = useState<DealPanelId[]>(() => {
    try {
      const saved = localStorage.getItem(ORDER_STORAGE_KEY);
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

  const [panelVisibility, setPanelVisibility] = useState<Record<DealPanelId, boolean>>(() => {
    try {
      const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all panels have a value
        // Always enforce visibility for required panels
        return {
          ...DEFAULT_PANEL_VISIBILITY,
          ...parsed,
          'deal-information': true,
          'outstanding-items': true,
        };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_PANEL_VISIBILITY;
  });

  const [isEditMode, setIsEditMode] = useState(false);

  // Persist order to localStorage
  useEffect(() => {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(panelOrder));
  }, [panelOrder]);

  // Persist visibility to localStorage
  useEffect(() => {
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(panelVisibility));
  }, [panelVisibility]);

  const reorderPanels = useCallback((fromIndex: number, toIndex: number) => {
    setPanelOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return newOrder;
    });
  }, []);

  const togglePanelVisibility = useCallback((panelId: DealPanelId) => {
    // Don't allow toggling always-visible panels
    if (ALWAYS_VISIBLE_PANELS.includes(panelId)) return;
    
    setPanelVisibility(prev => ({
      ...prev,
      [panelId]: !prev[panelId],
    }));
  }, []);

  const setPanelVisible = useCallback((panelId: DealPanelId, visible: boolean) => {
    // Don't allow hiding always-visible panels
    if (ALWAYS_VISIBLE_PANELS.includes(panelId) && !visible) return;
    
    setPanelVisibility(prev => ({
      ...prev,
      [panelId]: visible,
    }));
  }, []);

  const isPanelVisible = useCallback((panelId: DealPanelId): boolean => {
    // Always-visible panels are always shown
    if (ALWAYS_VISIBLE_PANELS.includes(panelId)) return true;
    return panelVisibility[panelId] ?? true;
  }, [panelVisibility]);

  const resetToDefault = useCallback(() => {
    setPanelOrder(DEFAULT_PANEL_ORDER);
    setPanelVisibility(DEFAULT_PANEL_VISIBILITY);
  }, []);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  // Get visible panels in order
  const visiblePanels = panelOrder.filter(id => isPanelVisible(id));

  return {
    panelOrder,
    panelVisibility,
    visiblePanels,
    isEditMode,
    setIsEditMode,
    toggleEditMode,
    reorderPanels,
    togglePanelVisibility,
    setPanelVisible,
    isPanelVisible,
    resetToDefault,
  };
}
