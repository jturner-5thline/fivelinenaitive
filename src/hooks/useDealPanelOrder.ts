import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

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

interface DealPanelLayout {
  order: DealPanelId[];
  visibility: Record<DealPanelId, boolean>;
}

const ORDER_STORAGE_KEY = 'deal-detail-panel-order';
const VISIBILITY_STORAGE_KEY = 'deal-detail-panel-visibility';

export function useDealPanelOrder() {
  const { user } = useAuth();
  const [panelOrder, setPanelOrder] = useState<DealPanelId[]>(DEFAULT_PANEL_ORDER);
  const [panelVisibility, setPanelVisibility] = useState<Record<DealPanelId, boolean>>(DEFAULT_PANEL_VISIBILITY);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch user's company ID
  useEffect(() => {
    const fetchCompanyId = async () => {
      if (!user) {
        setCompanyId(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data) {
          setCompanyId(data.company_id);
        }
      } catch (err) {
        console.error('Failed to fetch company ID:', err);
      }
    };

    fetchCompanyId();
  }, [user]);

  // Load layout from database or localStorage
  useEffect(() => {
    const loadLayout = async () => {
      setIsLoading(true);
      
      // If user has a company, try to load from database
      if (user && companyId) {
        try {
          const { data, error } = await supabase
            .from('company_settings')
            .select('deal_panel_layout')
            .eq('company_id', companyId)
            .maybeSingle();

          if (!error && data?.deal_panel_layout) {
            const layout = data.deal_panel_layout as unknown as DealPanelLayout;
            if (layout.order && Array.isArray(layout.order) && layout.order.length === DEFAULT_PANEL_ORDER.length) {
              const hasAll = DEFAULT_PANEL_ORDER.every(id => layout.order.includes(id));
              if (hasAll) {
                setPanelOrder(layout.order);
              }
            }
            if (layout.visibility) {
              setPanelVisibility({
                ...DEFAULT_PANEL_VISIBILITY,
                ...layout.visibility,
                'deal-information': true,
                'outstanding-items': true,
              });
            }
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('Failed to load panel layout from database:', err);
        }
      }

      // Fallback to localStorage
      try {
        const savedOrder = localStorage.getItem(ORDER_STORAGE_KEY);
        if (savedOrder) {
          const parsed = JSON.parse(savedOrder);
          if (Array.isArray(parsed) && parsed.length === DEFAULT_PANEL_ORDER.length) {
            const hasAll = DEFAULT_PANEL_ORDER.every(id => parsed.includes(id));
            if (hasAll) setPanelOrder(parsed);
          }
        }

        const savedVisibility = localStorage.getItem(VISIBILITY_STORAGE_KEY);
        if (savedVisibility) {
          const parsed = JSON.parse(savedVisibility);
          setPanelVisibility({
            ...DEFAULT_PANEL_VISIBILITY,
            ...parsed,
            'deal-information': true,
            'outstanding-items': true,
          });
        }
      } catch {
        // Ignore parse errors
      }

      setIsLoading(false);
    };

    loadLayout();
  }, [user, companyId]);

  // Save layout to database and localStorage
  const saveLayout = useCallback(async (order: DealPanelId[], visibility: Record<DealPanelId, boolean>) => {
    // Always save to localStorage as backup
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(visibility));

    // Save to database if user has a company
    if (user && companyId) {
      try {
        const layout: DealPanelLayout = { order, visibility };
        
        // First check if settings exist
        const { data: existing } = await supabase
          .from('company_settings')
          .select('id')
          .eq('company_id', companyId)
          .maybeSingle();

        if (existing) {
          // Update existing record
          const { error } = await supabase
            .from('company_settings')
            .update({
              deal_panel_layout: layout as unknown as Json,
              updated_at: new Date().toISOString(),
            })
            .eq('company_id', companyId);

          if (error) {
            console.error('Failed to update panel layout:', error);
          }
        } else {
          // Insert new record
          const { error } = await supabase
            .from('company_settings')
            .insert([{
              company_id: companyId,
              deal_panel_layout: layout as unknown as Json,
            }]);

          if (error) {
            console.error('Failed to insert panel layout:', error);
          }
        }
      } catch (err) {
        console.error('Failed to save panel layout:', err);
      }
    }
  }, [user, companyId]);

  // Debounced save
  const debouncedSave = useCallback((order: DealPanelId[], visibility: Record<DealPanelId, boolean>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveLayout(order, visibility);
    }, 500);
  }, [saveLayout]);

  const reorderPanels = useCallback((fromIndex: number, toIndex: number) => {
    setPanelOrder(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      debouncedSave(newOrder, panelVisibility);
      return newOrder;
    });
  }, [debouncedSave, panelVisibility]);

  const togglePanelVisibility = useCallback((panelId: DealPanelId) => {
    // Don't allow toggling always-visible panels
    if (ALWAYS_VISIBLE_PANELS.includes(panelId)) return;
    
    setPanelVisibility(prev => {
      const newVisibility = {
        ...prev,
        [panelId]: !prev[panelId],
      };
      debouncedSave(panelOrder, newVisibility);
      return newVisibility;
    });
  }, [debouncedSave, panelOrder]);

  const setPanelVisible = useCallback((panelId: DealPanelId, visible: boolean) => {
    // Don't allow hiding always-visible panels
    if (ALWAYS_VISIBLE_PANELS.includes(panelId) && !visible) return;
    
    setPanelVisibility(prev => {
      const newVisibility = {
        ...prev,
        [panelId]: visible,
      };
      debouncedSave(panelOrder, newVisibility);
      return newVisibility;
    });
  }, [debouncedSave, panelOrder]);

  const isPanelVisible = useCallback((panelId: DealPanelId): boolean => {
    // Always-visible panels are always shown
    if (ALWAYS_VISIBLE_PANELS.includes(panelId)) return true;
    return panelVisibility[panelId] ?? true;
  }, [panelVisibility]);

  const resetToDefault = useCallback(() => {
    setPanelOrder(DEFAULT_PANEL_ORDER);
    setPanelVisibility(DEFAULT_PANEL_VISIBILITY);
    saveLayout(DEFAULT_PANEL_ORDER, DEFAULT_PANEL_VISIBILITY);
  }, [saveLayout]);

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev);
  }, []);

  // Get visible panels in order
  const visiblePanels = panelOrder.filter(id => isPanelVisible(id));

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    panelOrder,
    panelVisibility,
    visiblePanels,
    isEditMode,
    isLoading,
    setIsEditMode,
    toggleEditMode,
    reorderPanels,
    togglePanelVisibility,
    setPanelVisible,
    isPanelVisible,
    resetToDefault,
  };
}
