import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Per-user "recently opened deals" tracker, persisted in localStorage so the
 * Deals sidebar dropdown can surface the last 5 deals this specific user has
 * actually opened (most recent first).
 *
 * The list is keyed by the authenticated user's id and is updated only when
 * `recordDealOpened` is invoked (typically from the DealDetail page when a
 * valid deal loads). This is intentionally based on the user's open activity,
 * not on global recency or recently created deals.
 */

const STORAGE_PREFIX = 'naitive:recent-deals:';
const MAX_RECENT = 10; // store a few extra to survive deletions / filtering

const storageKey = (userId: string | null | undefined) =>
  userId ? `${STORAGE_PREFIX}${userId}` : null;

const readList = (userId: string | null | undefined): string[] => {
  const key = storageKey(userId);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const writeList = (userId: string | null | undefined, ids: string[]) => {
  const key = storageKey(userId);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
    window.dispatchEvent(
      new CustomEvent('naitive:recent-deals-changed', { detail: { userId } }),
    );
  } catch {
    // ignore (quota / disabled storage)
  }
};

/** Push a deal id to the front of the user's recent-deals list. */
export function recordDealOpenedForUser(
  userId: string | null | undefined,
  dealId: string | null | undefined,
) {
  if (!userId || !dealId) return;
  const current = readList(userId);
  const next = [dealId, ...current.filter((id) => id !== dealId)].slice(
    0,
    MAX_RECENT,
  );
  // Skip the write (and event) when nothing changed.
  if (
    next.length === current.length &&
    next.every((v, i) => v === current[i])
  ) {
    return;
  }
  writeList(userId, next);
}

/** Hook variant that resolves the current user automatically. */
export function useRecordDealOpened() {
  const { user } = useAuth();
  return useCallback(
    (dealId: string | null | undefined) =>
      recordDealOpenedForUser(user?.id, dealId),
    [user?.id],
  );
}

/** Subscribe to the current user's recent-deals list (most recent first). */
export function useRecentDealIds(): string[] {
  const { user } = useAuth();
  const userId = user?.id;
  const [ids, setIds] = useState<string[]>(() => readList(userId));

  useEffect(() => {
    setIds(readList(userId));
    if (typeof window === 'undefined') return;

    const handleStorage = (e: StorageEvent) => {
      if (!userId) return;
      if (e.key && e.key !== storageKey(userId)) return;
      setIds(readList(userId));
    };
    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) return;
      setIds(readList(userId));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('naitive:recent-deals-changed', handleLocal);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('naitive:recent-deals-changed', handleLocal);
    };
  }, [userId]);

  return ids;
}