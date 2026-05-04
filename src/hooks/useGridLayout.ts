import { useState, useEffect, useCallback, useRef } from 'react';
import { useCompany } from '@/hooks/useCompany';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
export function useGridLayout(
  dashboardId: string,
  defaultWidgetIds: string[],
  options?: { allowAllMembers?: boolean; layoutDefaults?: GridLayoutItem[] },
) {
  const { company, isAdmin, isOwner } = useCompany();
  const canEdit = options?.allowAllMembers ? !!company?.id : (isAdmin || isOwner);
  const defaultsMap = (options?.layoutDefaults ?? []).reduce<Record<string, GridLayoutItem>>((acc, item) => {
    acc[item.i] = item;
    return acc;
  }, {});
  const buildDefaults = (ids: string[]): GridLayoutItem[] => {
    if (options?.layoutDefaults && options.layoutDefaults.length) {
      const generated = generateDefaultLayout(ids);
      let maxY = 0;
      const result = generated.map(g => {
        if (defaultsMap[g.i]) {
          const d = defaultsMap[g.i];
          maxY = Math.max(maxY, d.y + d.h);
          return { ...g, ...d };
        }
        return g;
      });
      // Reflow any non-defaulted items below the explicitly-positioned ones
      const explicitIds = new Set(Object.keys(defaultsMap));
      let cursor = maxY;
      let col = 0;
      return result.map(item => {
        if (explicitIds.has(item.i)) return item;
        const placed = { ...item, x: col, y: cursor };
        col += item.w;
        if (col >= 12) { col = 0; cursor += item.h; }
        return placed;
      });
    }
    return generateDefaultLayout(ids);
  };
  const [layout, setLayout] = useState<GridLayoutItem[]>(() => buildDefaults(defaultWidgetIds));
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevWidgetIdsRef = useRef<string>(defaultWidgetIds.join(','));

  // Synchronously merge any new widget IDs into the current layout
  const widgetIdsKey = defaultWidgetIds.join(',');
  if (widgetIdsKey !== prevWidgetIdsRef.current) {
    prevWidgetIdsRef.current = widgetIdsKey;
    const currentIds = new Set(layout.map(l => l.i));
    const newIds = defaultWidgetIds.filter(id => !currentIds.has(id));
    if (newIds.length > 0) {
      const maxY = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
      const newItems: GridLayoutItem[] = newIds.map((id, idx) => {
        const d = defaultsMap[id];
        if (d) {
          return { ...d, y: maxY + d.y };
        }
        return {
          i: id,
          x: (idx % 3) * 4,
          y: maxY + Math.floor(idx / 3) * 2,
          w: 4,
          h: 2,
          minW: 3,
          minH: 2,
        };
      });
      setLayout(prev => [...prev, ...newItems]);
    }
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

        const newLayouts: GridLayoutItem[] = newWidgets.map((id, idx) => {
          const d = defaultsMap[id];
          if (d) return { ...d, y: maxY + d.y };
          return {
            i: id,
            x: (idx % 3) * 4,
            y: maxY + Math.floor(idx / 3) * 2,
            w: 4,
            h: 2,
            minW: 3,
            minH: 2,
          };
        });

        setLayout([...savedLayout, ...newLayouts]);
      } else {
        setLayout(buildDefaults(defaultWidgetIds));
      }
      setIsLoaded(true);
    })();
  }, [company?.id, dashboardId, widgetIdsKey]);

  // Persist layout to DB
  const persistLayout = useCallback(async (newLayout: GridLayoutItem[]) => {
    if (!canEdit || !company?.id) return;
    const { error } = await (supabase as any).rpc('save_dashboard_grid_layout', {
      _company_id: company.id,
      _dashboard_id: dashboardId,
      _layout: newLayout,
    });
    if (error) {
      console.error('[useGridLayout] save failed', error);
      toast.error('Failed to save layout. Your changes may not persist.');
    }
  }, [company?.id, dashboardId, canEdit]);

  // Save layout — supports immediate mode (skip debounce) for drag/resize stop
  const saveLayout = useCallback((newLayout: GridLayoutItem[], immediate?: boolean) => {
    setLayout(newLayout);

    if (!canEdit) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    if (immediate) {
      persistLayout(newLayout);
    } else {
      saveTimerRef.current = setTimeout(() => {
        persistLayout(newLayout);
      }, 300);
    }
  }, [canEdit, persistLayout]);

  // Flush pending debounced save on unmount or page unload
  const pendingLayoutRef = useRef<GridLayoutItem[] | null>(null);
  const originalSaveLayout = saveLayout;
  const wrappedSaveLayout = useCallback((newLayout: GridLayoutItem[], immediate?: boolean) => {
    pendingLayoutRef.current = newLayout;
    originalSaveLayout(newLayout, immediate);
    if (immediate) pendingLayoutRef.current = null;
  }, [originalSaveLayout]);

  useEffect(() => {
    const flushOnUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (pendingLayoutRef.current && canEdit && company?.id) {
        // Synchronous best-effort flush via the authenticated RPC
        persistLayout(pendingLayoutRef.current);
      }
    };
    window.addEventListener('beforeunload', flushOnUnload);
    return () => {
      window.removeEventListener('beforeunload', flushOnUnload);
      // Also flush on unmount
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        if (pendingLayoutRef.current) {
          persistLayout(pendingLayoutRef.current);
        }
      }
    };
  }, [canEdit, company?.id, dashboardId, persistLayout]);

  const resetLayout = useCallback(async () => {
    const def = buildDefaults(defaultWidgetIds);
    setLayout(def);
    if (!company?.id || !canEdit) return;
    const { error } = await (supabase as any).rpc('reset_dashboard_grid_layout', {
      _company_id: company.id,
      _dashboard_id: dashboardId,
    });
    if (error) {
      console.error('[useGridLayout] reset failed', error);
      toast.error('Failed to reset layout.');
    }
  }, [company?.id, dashboardId, defaultWidgetIds, canEdit]);

  return { layout, saveLayout: wrappedSaveLayout, resetLayout, isLoaded, canEdit };
}
