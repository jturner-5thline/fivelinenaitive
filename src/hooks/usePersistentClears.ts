import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Per-user persistent "cleared/resolved" tracker. Unlike useDailyDismissals
 * (which resets at the 5 AM ET rundown rollover), entries stored here
 * persist across days and route changes until explicitly restored.
 *
 * Used by the End of Day backlog to mark unresolved items as resolved so
 * they stop appearing in the rolling 90-day window.
 */
const CLEAR_EVENT = 'persistent-clear:changed';

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent(CLEAR_EVENT, { detail: { key } }));
  } catch {
    /* ignore */
  }
}

export function usePersistentClears(scope: string) {
  const { user } = useAuth();
  const userId = user?.id || 'anon';
  const storageKey = `persistentClear:${scope}:${userId}`;

  const [cleared, setCleared] = useState<Set<string>>(() => readSet(storageKey));

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (!detail?.key || detail.key === storageKey) {
        setCleared(readSet(storageKey));
      }
    };
    window.addEventListener(CLEAR_EVENT, onChange);
    return () => window.removeEventListener(CLEAR_EVENT, onChange);
  }, [storageKey]);

  const clear = useCallback((id: string) => {
    setCleared((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      writeSet(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const restore = useCallback((id: string) => {
    setCleared((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      writeSet(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const isCleared = useCallback((id: string) => cleared.has(id), [cleared]);

  return { cleared, clear, restore, isCleared };
}