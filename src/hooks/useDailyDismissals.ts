import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Per-user, per-day dismissal tracker.
 *
 * The "day" rolls over at 5:00 AM ET, matching the daily Routine refresh.
 * Dismissals are scoped to the current user and stored in localStorage so
 * they automatically clear when the rundown date advances.
 */
function getRundownDateKey(): string {
  // Compute "now" in America/New_York and shift back 5h so the date key
  // increments at 05:00 ET.
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etNow = new Date(etString);
  etNow.setHours(etNow.getHours() - 5);
  const y = etNow.getFullYear();
  const m = String(etNow.getMonth() + 1).padStart(2, '0');
  const d = String(etNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useDailyDismissals(scope: string) {
  const { user } = useAuth();
  const userId = user?.id || 'anon';
  const dateKey = getRundownDateKey();
  const storageKey = `dailyDismiss:${scope}:${userId}:${dateKey}`;

  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  });

  // Sweep stale keys for this scope/user (previous days).
  useEffect(() => {
    try {
      const prefix = `dailyDismiss:${scope}:${userId}:`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== storageKey) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      /* ignore */
    }
  }, [scope, userId, storageKey]);

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  const isDismissed = useCallback((id: string) => dismissed.has(id), [dismissed]);

  return { dismissed, dismiss, isDismissed };
}