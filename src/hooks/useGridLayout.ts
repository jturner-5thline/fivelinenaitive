import { useState, useEffect, useCallback, useRef } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

/**
 * Generate default grid layout from a list of widget IDs.
 * 3-column arrangement: w=4, h=2, 12-col grid.
 */
export function generateDefaultLayout(widgetIds: string[], cols = 3, w = 4, h = 2): GridLayoutItem[] {
  return widgetIds.map((id, i) => ({
    i: id,
    x: (i % cols) * w,
    y: Math.floor(i / cols) * h,
    w,
    h,
    minW: 3,
    minH: 2,
  }));
}

/**
 * Hook to persist and restore grid layouts per company + dashboard.
 * All company members see the same layout; only admins can save changes.
 */
export function useGridLayout(dashboardId: string, defaultWidgetIds: string[]) {
  const { company, isAdmin, isOwner } = useCompany();
  const canEdit = isAdmin || isOwner;
  const [layout, setLayout] = useState<GridLayoutItem[]>(() => generateDefaultLayout(defaultWidgetIds));
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevWidgetIdsRef = useRef<string>(defaultWidgetIds.join(','));

  // Synchronously merge any new widget IDs into the current layout
  // so react-grid-layout renders them immediately (no async wait).
  const widgetIdsKey = defaultWidgetIds.join(',');
  if (widgetIdsKey !== prevWidgetIdsRef.current) {
    prevWidgetIdsRef.current = widgetIdsKey;
    const currentIds = new Set(layout.map(l => l.i));
    const newIds = defaultWidgetIds.filter(id => !currentIds.has(id));
    if (newIds.length > 0) {
      const maxY = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const newItems: GridLayoutItem[] = newIds.map((id, idx) => ({
        i: id,
        x: (idx % 3) * 4,
        y: maxY + Math.floor(idx / 3) * 2,
        w: 4,
        h: 2,
        minW: 3,
        minH: 2,
      }));
      setLayout(prev => [...prev, ...newItems]);
    }
    // Also remove layout items for widgets that no longer exist
    const validIds = new Set(defaultWidgetIds);
    const hasStale = layout.some(l => !validIds.has(l.i));
    if (hasStale) {
      setLayout(prev => prev.filter(l => validIds.has(l.i)));
    }
  }

  // Load saved layout by company
  useEffect(() => {
    if (!company?.id) return;

    (async () => {
      const { data } = await (supabase
        .from('dashboard_grid_layouts') as any)
        .select('layout')
        .eq('company_id', company.id)
        .eq('dashboard_id', dashboardId)
        .maybeSingle();

      if (data?.layout && Array.isArray(data.layout) && data.layout.length > 0) {
        const savedLayout = data.layout as GridLayoutItem[];
        const savedIds = new Set(savedLayout.map(l => l.i));
        const newWidgets = defaultWidgetIds.filter(id => !savedIds.has(id));
        const maxY = savedLayout.reduce((max, l) => Math.max(max, l.y + l.h), 0);

        const newLayouts: GridLayoutItem[] = newWidgets.map((id, idx) => ({
          i: id,
          x: (idx % 3) * 4,
          y: maxY + Math.floor(idx / 3) * 2,
          w: 4,
          h: 2,
          minW: 3,
          minH: 2,
        }));

        setLayout([...savedLayout, ...newLayouts]);
      } else {
        setLayout(generateDefaultLayout(defaultWidgetIds));
      }
      setIsLoaded(true);
    })();
  }, [company?.id, dashboardId, widgetIdsKey]);

  // Debounced save — only admins can persist
  const saveLayout = useCallback((newLayout: GridLayoutItem[]) => {
    setLayout(newLayout);

    if (!canEdit) return; // non-admins can drag locally but it won't persist

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!company?.id) return;
      await (supabase
        .from('dashboard_grid_layouts') as any)
        .upsert({
          company_id: company.id,
          dashboard_id: dashboardId,
          layout: newLayout,
        }, { onConflict: 'company_id,dashboard_id' });
    }, 300);
  }, [company?.id, dashboardId, canEdit]);

  const resetLayout = useCallback(async () => {
    const def = generateDefaultLayout(defaultWidgetIds);
    setLayout(def);
    if (!company?.id || !canEdit) return;
    await (supabase
      .from('dashboard_grid_layouts') as any)
      .delete()
      .eq('company_id', company.id)
      .eq('dashboard_id', dashboardId);
  }, [company?.id, dashboardId, defaultWidgetIds, canEdit]);

  return { layout, saveLayout, resetLayout, isLoaded, canEdit };
}
