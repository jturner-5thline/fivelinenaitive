import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from 'react-grid-layout';

/**
 * Generate default grid layout from a list of widget IDs.
 * 3-column arrangement: w=4, h=2, 12-col grid.
 */
export function generateDefaultLayout(widgetIds: string[], cols = 3, w = 4, h = 2): Layout[] {
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
 * Hook to persist and restore grid layouts per user + dashboard.
 */
export function useGridLayout(dashboardId: string, defaultWidgetIds: string[]) {
  const { user } = useAuth();
  const [layout, setLayout] = useState<Layout[]>(() => generateDefaultLayout(defaultWidgetIds));
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved layout
  useEffect(() => {
    if (!user) return;

    (async () => {
      const { data } = await (supabase
        .from('dashboard_grid_layouts') as any)
        .select('layout')
        .eq('user_id', user.id)
        .eq('dashboard_id', dashboardId)
        .maybeSingle();

      if (data?.layout && Array.isArray(data.layout) && data.layout.length > 0) {
        // Merge saved layout with any new widgets not in saved layout
        const savedIds = new Set((data.layout as Layout[]).map(l => l.i));
        const newWidgets = defaultWidgetIds.filter(id => !savedIds.has(id));
        const maxY = (data.layout as Layout[]).reduce((max, l) => Math.max(max, l.y + l.h), 0);

        const newLayouts = newWidgets.map((id, idx) => ({
          i: id,
          x: (idx % 3) * 4,
          y: maxY + Math.floor(idx / 3) * 2,
          w: 4,
          h: 2,
          minW: 3,
          minH: 2,
        }));

        setLayout([...(data.layout as Layout[]), ...newLayouts]);
      } else {
        setLayout(generateDefaultLayout(defaultWidgetIds));
      }
      setIsLoaded(true);
    })();
  }, [user, dashboardId, defaultWidgetIds.join(',')]);

  // Debounced save
  const saveLayout = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!user) return;
      await (supabase
        .from('dashboard_grid_layouts') as any)
        .upsert({
          user_id: user.id,
          dashboard_id: dashboardId,
          layout: newLayout,
        }, { onConflict: 'user_id,dashboard_id' });
    }, 300);
  }, [user, dashboardId]);

  const resetLayout = useCallback(async () => {
    const def = generateDefaultLayout(defaultWidgetIds);
    setLayout(def);
    if (!user) return;
    await (supabase
      .from('dashboard_grid_layouts') as any)
      .delete()
      .eq('user_id', user.id)
      .eq('dashboard_id', dashboardId);
  }, [user, dashboardId, defaultWidgetIds]);

  return { layout, saveLayout, resetLayout, isLoaded };
}
