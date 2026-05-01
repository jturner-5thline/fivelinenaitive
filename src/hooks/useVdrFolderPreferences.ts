import { useCallback, useMemo } from 'react';
import { useUiPreference } from './useUiPreference';

const MAX_RECENTS = 5;

interface ColumnPrefs {
  /** Ordered list of folder names. Names not present fall back to natural order. */
  order: string[];
  /** Most recently used drop/move target folder names (most-recent first). */
  recents: string[];
}

const DEFAULTS: ColumnPrefs = { order: [], recents: [] };

/**
 * Per-user, per-deal folder ordering + last-used drop targets.
 * Internal and Data Room are persisted under separate keys so the two
 * columns can be reorganised independently across sessions.
 */
export function useVdrFolderPreferences(
  dealId: string | undefined,
  column: 'internal' | 'dataroom',
) {
  const key = `vdr_folder_prefs:${column}:${dealId ?? 'unknown'}`;
  const [prefs, persist] = useUiPreference<ColumnPrefs>(key, DEFAULTS);

  const safe: ColumnPrefs = useMemo(
    () => ({
      order: Array.isArray(prefs?.order) ? prefs.order : [],
      recents: Array.isArray(prefs?.recents) ? prefs.recents : [],
    }),
    [prefs],
  );

  /** Apply saved order to a list of names. Unknown/new names appear after. */
  const applyOrder = useCallback(
    (names: string[]): string[] => {
      if (!safe.order.length) return names;
      const set = new Set(names);
      const ordered = safe.order.filter(n => set.has(n));
      const remaining = names.filter(n => !ordered.includes(n));
      return [...ordered, ...remaining];
    },
    [safe.order],
  );

  /** Move `name` so it lands immediately before `beforeName` (or to end if null). */
  const reorder = useCallback(
    (allNames: string[], name: string, beforeName: string | null) => {
      const current = applyOrder(allNames).filter(n => n !== name);
      let next: string[];
      if (beforeName == null) {
        next = [...current, name];
      } else {
        const idx = current.indexOf(beforeName);
        if (idx < 0) next = [...current, name];
        else next = [...current.slice(0, idx), name, ...current.slice(idx)];
      }
      persist({ ...safe, order: next });
    },
    [applyOrder, persist, safe],
  );

  /** Record that the user just dropped/moved files into `folderName`. */
  const recordRecent = useCallback(
    (folderName: string | null) => {
      if (!folderName) return;
      const next = [folderName, ...safe.recents.filter(n => n !== folderName)].slice(0, MAX_RECENTS);
      persist({ ...safe, recents: next });
    },
    [persist, safe],
  );

  return {
    order: safe.order,
    recents: safe.recents,
    applyOrder,
    reorder,
    recordRecent,
  };
}
