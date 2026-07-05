import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUiPreference } from './useUiPreference';
import { generateDefaultLayout, type GridLayoutItem } from './useGridLayout';

/**
 * Per-user grid layout persistence.
 *
 * Unlike `useGridLayout` (which persists layouts per company via the shared
 * `dashboard_grid_layouts` table), this hook stores the layout in the
 * per-user `user_ui_preferences` table so one user's arrangement never
 * affects another's.
 *
 * Behaviour required for the Weekly Rundown dashboard:
 *   • Restore the saved layout synchronously from the localStorage mirror
 *     that `useUiPreference` maintains, so first paint already reflects it
 *     and the grid does not jump/reshuffle after hydration.
 *   • Never rebuild from defaults when a saved layout exists — merge newly
 *     added widget IDs into the saved layout below existing items.
 *   • If a widget is removed from the registry, strip only that entry from
 *     the saved layout; keep every remaining position untouched.
 *   • The `storageKey` is treated as stable — bump it only for a true
 *     breaking layout-model change.
 */
export function useUserGridLayout(
  storageKey: string,
  widgetIds: string[],
  options?: { layoutDefaults?: GridLayoutItem[] },
) {
  const layoutDefaults = options?.layoutDefaults;

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

  // Seed the persisted preference with the canonical default layout so a
  // brand-new user's first paint uses the current visible arrangement.
  const initialDefault = useMemo(() => buildDefaults(widgetIds), [buildDefaults, widgetIds]);

  const [savedLayout, persistLayout] = useUiPreference<GridLayoutItem[]>(
    `grid_layout:${storageKey}`,
    initialDefault,
  );

  // Reconcile the persisted layout against the current widget set:
  //   • strip widgets no longer registered
  //   • append newly added widgets below existing items
  const reconciled = useMemo<GridLayoutItem[]>(() => {
    const source = Array.isArray(savedLayout) && savedLayout.length > 0
      ? savedLayout
      : initialDefault;
    const validIds = new Set(widgetIds);
    const filtered = source.filter(l => l && validIds.has(l.i));
    const savedIds = new Set(filtered.map(l => l.i));
    const missing = widgetIds.filter(id => !savedIds.has(id));
    if (missing.length === 0) return filtered;
    const maxY = filtered.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    const appended: GridLayoutItem[] = missing.map((id, idx) => {
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
    return [...filtered, ...appended];
  }, [savedLayout, widgetIds, defaultsMap, initialDefault]);

  // If reconciliation actually changed the stored shape (widget added/removed),
  // write the reconciled layout back once so subsequent loads don't re-run
  // the merge. Guarded to avoid write loops.
  const lastWrittenRef = useRef<string>('');
  useEffect(() => {
    const savedIds = new Set((savedLayout ?? []).map(l => l?.i));
    const reconciledIds = new Set(reconciled.map(l => l.i));
    const sameShape =
      savedIds.size === reconciledIds.size &&
      [...savedIds].every(id => reconciledIds.has(id));
    if (sameShape) return;
    const key = JSON.stringify(reconciled.map(l => l.i).sort());
    if (lastWrittenRef.current === key) return;
    lastWrittenRef.current = key;
    persistLayout(reconciled);
  }, [savedLayout, reconciled, persistLayout]);

  const [layout, setLayout] = useState<GridLayoutItem[]>(reconciled);
  // Keep local state in sync when the reconciled layout changes (fresh load
  // from DB, cross-tab update, widget registry change).
  const reconciledSignature = useMemo(
    () => JSON.stringify(reconciled),
    [reconciled],
  );
  useEffect(() => {
    setLayout(reconciled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconciledSignature]);

  const saveLayout = useCallback((next: GridLayoutItem[], _immediate?: boolean) => {
    setLayout(next);
    persistLayout(next);
  }, [persistLayout]);

  const resetLayout = useCallback(async () => {
    const def = buildDefaults(widgetIds);
    setLayout(def);
    persistLayout(def);
  }, [buildDefaults, widgetIds, persistLayout]);

  return {
    layout,
    saveLayout,
    resetLayout,
    isLoaded: true,
    canEdit: true,
  };
}