import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  maxW?: number;
  maxH?: number;
}

type GridBreakpoint = 'lg' | 'md' | 'sm';

const SHARED_GRID_BREAKPOINTS: Record<GridBreakpoint, number> = { lg: 1200, md: 768, sm: 0 };
const SHARED_GRID_COLUMNS: Record<GridBreakpoint, number> = { lg: 12, md: 12, sm: 12 };

type PersistedGridPayload = {
  version: 1;
  dashboardId: string;
  breakpoints: Record<GridBreakpoint, number>;
  columns: Record<GridBreakpoint, number>;
  layouts: Record<GridBreakpoint, GridLayoutItem[]>;
};

function normalizeLayoutItems(items: GridLayoutItem[]): GridLayoutItem[] {
  return items.map(item => {
    const next: GridLayoutItem = {
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    };
    if (item.minW !== undefined) next.minW = item.minW;
    if (item.minH !== undefined) next.minH = item.minH;
    if (item.maxW !== undefined) next.maxW = item.maxW;
    if (item.maxH !== undefined) next.maxH = item.maxH;
    return next;
  });
}

function makeBreakpointPayload(dashboardId: string, layout: GridLayoutItem[]): PersistedGridPayload {
  const normalized = normalizeLayoutItems(layout);
  return {
    version: 1,
    dashboardId,
    breakpoints: SHARED_GRID_BREAKPOINTS,
    columns: SHARED_GRID_COLUMNS,
    layouts: {
      lg: normalized,
      md: normalized.map(item => ({ ...item })),
      sm: normalized.map(item => ({ ...item })),
    },
  };
}

function extractLayoutFromPayload(payload: unknown): GridLayoutItem[] | null {
  if (Array.isArray(payload)) return normalizeLayoutItems(payload as GridLayoutItem[]);
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as any;
  const candidates = [obj.layouts?.lg, obj.breakpoints?.lg, obj.lg, obj.layout];
  const layout = candidates.find(Array.isArray) as GridLayoutItem[] | undefined;
  return layout && layout.length > 0 ? normalizeLayoutItems(layout) : null;
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
  options?: {
    allowAllMembers?: boolean;
    layoutDefaults?: GridLayoutItem[];
    persistBreakpoints?: boolean;
    strictPersistedLayout?: boolean;
    debugLabel?: string;
  },
) {
  const { company, isAdmin, isOwner } = useCompany();
  const canEdit = options?.allowAllMembers ? !!company?.id : (isAdmin || isOwner);
  const layoutDefaults = options?.layoutDefaults;
  const persistBreakpoints = options?.persistBreakpoints ?? false;
  const strictPersistedLayout = options?.strictPersistedLayout ?? false;
  const debugLabel = options?.debugLabel;
  const defaultsMap = useMemo(() => {
    return (layoutDefaults ?? []).reduce<Record<string, GridLayoutItem>>((acc, item) => {
      acc[item.i] = item;
      return acc;
    }, {});
  }, [layoutDefaults]);
  const buildDefaults = useCallback((ids: string[]): GridLayoutItem[] => {
    if (layoutDefaults && layoutDefaults.length) {
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
  }, [defaultsMap, layoutDefaults]);
  const [layout, setLayout] = useState<GridLayoutItem[]>(() => buildDefaults(defaultWidgetIds));
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widgetIdsKey = defaultWidgetIds.join(',');

  // Canonical saved layout from DB — the source of truth. Widget-ID
  // reconciliation (append new / strip stale) is applied on top of this
  // inside a single effect so the render pipeline can't accidentally overwrite
  // saved positions with defaults during hydration.
  const savedLayoutRef = useRef<GridLayoutItem[] | null>(null);
  const hasSavedRowRef = useRef<boolean>(false);
  const fetchTokenRef = useRef<number>(0);

  // Load saved layout by company. Cancellation via fetchTokenRef prevents
  // stale responses from a previous company/dashboard from clobbering the
  // current one when the identifiers change quickly on mount.
  useEffect(() => {
    if (!company?.id) return;
    const token = ++fetchTokenRef.current;
    setIsLoaded(false);

    (async () => {
      const { data } = await (supabase
        .from('dashboard_grid_layouts') as any)
        .select('company_id,dashboard_id,layout,updated_at')
        .eq('company_id', company.id)
        .eq('dashboard_id', dashboardId)
        .maybeSingle();
      if (token !== fetchTokenRef.current) return; // stale

      const loadedLayout = extractLayoutFromPayload(data?.layout);
      if (loadedLayout && loadedLayout.length > 0) {
        const validIds = new Set(defaultWidgetIds);
        const filtered = loadedLayout.filter(l => validIds.has(l.i));
        savedLayoutRef.current = filtered;
        hasSavedRowRef.current = true;
        setLayout(filtered);
      } else {
        savedLayoutRef.current = null;
        hasSavedRowRef.current = false;
        setLayout(buildDefaults(defaultWidgetIds));
      }
      if (debugLabel) {
        const source = loadedLayout && loadedLayout.length > 0 ? 'SHARED BACKEND' : 'CODED DEFAULT';
        console.info(`${debugLabel} layout source: ${source}`, {
          company_id: company.id,
          dashboard_id: dashboardId,
          loadedPayload: data?.layout ?? null,
        });
      }
      setIsLoaded(true);
    })();
  }, [company?.id, dashboardId, debugLabel, widgetIdsKey, buildDefaults]);

  // Reconcile a saved layout against the current widget ID set and apply it.
  const applyReconciled = useCallback((saved: GridLayoutItem[] | null) => {
    if (!saved || saved.length === 0) {
      setLayout(buildDefaults(defaultWidgetIds));
      return;
    }
    const validIds = new Set(defaultWidgetIds);
    const filtered = saved.filter(l => validIds.has(l.i));
    if (strictPersistedLayout) {
      setLayout(filtered);
      return;
    }
    const savedIds = new Set(filtered.map(l => l.i));
    const newWidgets = defaultWidgetIds.filter(id => !savedIds.has(id));
    const maxY = filtered.reduce((max, l) => Math.max(max, l.y + l.h), 0);
    const appended: GridLayoutItem[] = newWidgets.map((id, idx) => {
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
    setLayout([...filtered, ...appended]);
  }, [defaultWidgetIds, defaultsMap, buildDefaults, strictPersistedLayout]);

  // Realtime subscription — reflect layout changes from other users in the
  // same workspace immediately, without requiring a refresh.
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`dashboard-grid-layout-${dashboardId}-${company.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dashboard_grid_layouts',
          filter: `company_id=eq.${company.id}`,
        },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row || row.dashboard_id !== dashboardId) return;
          if (payload.eventType === 'DELETE') {
            savedLayoutRef.current = null;
            hasSavedRowRef.current = false;
            setLayout(buildDefaults(defaultWidgetIds));
            return;
          }
          const next = extractLayoutFromPayload((payload.new as any)?.layout);
          if (next && next.length > 0) {
            savedLayoutRef.current = next;
            hasSavedRowRef.current = true;
            // Reconcile with current widget IDs before applying
            applyReconciled(next);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // buildDefaults + widgetIdsKey intentionally captured via closure; the
    // subscription itself doesn't need to be re-established for widget-id
    // changes because reconciliation happens inside the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, dashboardId]);

  // After the saved layout has loaded — and whenever the widget-id set
  // changes — reconcile and apply. This is the ONLY code path that
  // hydrates the grid state from the source of truth. Defaults are only
  // used when the workspace truly has no saved row.
  useEffect(() => {
    if (!isLoaded) return;
    if (hasSavedRowRef.current && savedLayoutRef.current) {
      applyReconciled(savedLayoutRef.current);
    } else {
      setLayout(buildDefaults(defaultWidgetIds));
    }
  }, [isLoaded, widgetIdsKey, applyReconciled, buildDefaults, defaultWidgetIds]);

  // Persist layout to DB
  const persistLayout = useCallback(async (newLayout: GridLayoutItem[]) => {
    if (!canEdit || !company?.id) return;
    const normalized = normalizeLayoutItems(newLayout);
    const savedPayload = persistBreakpoints
      ? makeBreakpointPayload(dashboardId, normalized)
      : normalized;
    if (debugLabel) {
      console.info(`${debugLabel} layout saved payload`, {
        company_id: company.id,
        dashboard_id: dashboardId,
        savedPayload,
      });
    }
    const { error } = await (supabase as any).rpc('save_dashboard_grid_layout', {
      _company_id: company.id,
      _dashboard_id: dashboardId,
      _layout: savedPayload,
    });
    if (error) {
      console.error('[useGridLayout] save failed', error);
      toast.error('Failed to save layout. Your changes may not persist.');
    } else {
      // Keep the in-memory canonical mirror in sync so realtime echo /
      // widget-id reconciliation doesn't revert the user's edit.
      savedLayoutRef.current = normalized;
      hasSavedRowRef.current = true;
    }
  }, [company?.id, dashboardId, canEdit, persistBreakpoints, debugLabel]);

  // Save layout — supports immediate mode (skip debounce) for drag/resize stop
  const saveLayout = useCallback((newLayout: GridLayoutItem[], immediate?: boolean) => {
    setLayout(newLayout);

    // Never persist before the saved layout has loaded — otherwise the
    // initial default state can be flushed to DB and overwrite the
    // real saved layout for the whole workspace.
    if (!canEdit || !isLoaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    if (immediate) {
      persistLayout(newLayout);
    } else {
      saveTimerRef.current = setTimeout(() => {
        persistLayout(newLayout);
      }, 300);
    }
  }, [canEdit, isLoaded, persistLayout]);

  // Flush pending debounced save on unmount or page unload
  const pendingLayoutRef = useRef<GridLayoutItem[] | null>(null);
  const originalSaveLayout = saveLayout;
  const wrappedSaveLayout = useCallback((newLayout: GridLayoutItem[], immediate?: boolean) => {
    // Guard: never queue a save until the persisted layout has hydrated.
    // This prevents the initial default state — or the transient
    // reconciled state produced while widget IDs are still loading — from
    // ever being written to the database.
    if (!isLoaded) {
      setLayout(newLayout);
      return;
    }
    pendingLayoutRef.current = newLayout;
    originalSaveLayout(newLayout, immediate);
    if (immediate) pendingLayoutRef.current = null;
  }, [originalSaveLayout, isLoaded]);

  useEffect(() => {
    const flushOnUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (pendingLayoutRef.current && canEdit && company?.id) {
          // Synchronous best-effort flush via the authenticated RPC —
          // only when a debounced save is actually pending.
          persistLayout(pendingLayoutRef.current);
          pendingLayoutRef.current = null;
        }
      }
    };
    window.addEventListener('beforeunload', flushOnUnload);
    return () => {
      window.removeEventListener('beforeunload', flushOnUnload);
      // Flush any pending debounced save on unmount — only if a debounce
      // timer was actually pending. Do NOT re-persist stale refs.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (pendingLayoutRef.current) {
          persistLayout(pendingLayoutRef.current);
          pendingLayoutRef.current = null;
        }
      }
    };
  }, [canEdit, company?.id, dashboardId, persistLayout]);

  const resetLayout = useCallback(async () => {
    const def = buildDefaults(defaultWidgetIds);
    setLayout(def);
    savedLayoutRef.current = null;
    hasSavedRowRef.current = false;
    if (!company?.id || !canEdit) return;
    const { error } = await (supabase as any).rpc('reset_dashboard_grid_layout', {
      _company_id: company.id,
      _dashboard_id: dashboardId,
    });
    if (error) {
      console.error('[useGridLayout] reset failed', error);
      toast.error('Failed to reset layout.');
    }
  }, [company?.id, dashboardId, defaultWidgetIds, canEdit, buildDefaults]);

  return { layout, saveLayout: wrappedSaveLayout, resetLayout, isLoaded, canEdit };
}
