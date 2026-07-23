import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay, subDays, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useDbPersistentClears } from '@/hooks/useDbPersistentClears';
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar';

/**
 * Lightweight, always-mounted count of outstanding End-of-Day items for the
 * current user. Mirrors the filter logic in `EndOfDayTab` (audience-eligible
 * calendar events over the lookback window, minus resolved/dismissed/
 * snoozed/read). Reads from the same LS caches EndOfDayTab writes so the
 * badge stays in sync without extra Google calls.
 */
const EOD_LOOKBACK_DAYS = 90;
const EOD_FETCH_MAX_RESULTS = 2000;
const EVENTS_CACHE_KEY_PREFIX = 'eod:events-cache';
const SNOOZE_KEY_PREFIX = 'eod:snoozed';
const READ_KEY_PREFIX = 'eod:read';

const END_OF_DAY_ALLOWLIST = new Set([
  'jmoffitt@5thline.co',
  'swilliams@5thline.co',
  'jturner@5thline.co',
  'nheikali@5thline.co',
  'ppina@5thline.co',
  'ffustinoni@5thline.co',
]);

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeParse(iso?: string): Date | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function useEndOfDayOutstandingCount(): number {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const eligible = !!user?.email && END_OF_DAY_ALLOWLIST.has(user.email.toLowerCase());
  const { status, listEvents } = useGoogleCalendar();

  // Read cached events from localStorage; refreshed by EndOfDayTab when open.
  const eventsCacheKey = userId ? `${EVENTS_CACHE_KEY_PREFIX}:${userId}` : null;
  const [events, setEvents] = useState<CalendarEvent[]>(() =>
    eventsCacheKey ? readLS<CalendarEvent[]>(eventsCacheKey, []) : [],
  );

  // Background refresh (10 min) so the badge stays accurate even when the
  // EndOfDayTab isn't mounted.
  useQuery({
    queryKey: ['eod-outstanding-count-fetch', userId],
    enabled: eligible && !!status?.connected,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    queryFn: async () => {
      const timeMin = startOfDay(subDays(new Date(), EOD_LOOKBACK_DAYS)).toISOString();
      const timeMax = endOfDay(new Date()).toISOString();
      const res = await listEvents({ timeMin, timeMax, maxResults: EOD_FETCH_MAX_RESULTS });
      const next = res?.events || [];
      setEvents(next);
      if (eventsCacheKey) {
        try { localStorage.setItem(eventsCacheKey, JSON.stringify(next)); } catch { /* quota */ }
      }
      return next.length;
    },
  });

  const { isCleared: isResolved } = useDbPersistentClears('eod-agenda');
  const { isCleared: isDismissed } = useDbPersistentClears('eod-dismissed');

  // Re-read snooze + read sets from LS periodically so badge reflects the
  // latest state after actions inside EndOfDayTab.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    const onStorage = () => setTick((t) => t + 1);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return useMemo(() => {
    if (!eligible || !userId) return 0;
    void tick;
    const ws = startOfDay(subDays(new Date(), EOD_LOOKBACK_DAYS));
    const we = endOfDay(new Date());
    const snoozeMap = userId
      ? readLS<Record<string, string>>(`${SNOOZE_KEY_PREFIX}:${userId}`, {})
      : {};
    const readIds = new Set(
      userId ? readLS<string[]>(`${READ_KEY_PREFIX}:${userId}`, []) : [],
    );
    const now = Date.now();
    let count = 0;
    for (const ev of events) {
      const start = safeParse(ev.start);
      if (!start || start < ws || start > we) continue;
      const otherCount = (ev.attendees || []).filter((a: any) => !a.self).length;
      if (otherCount === 0) continue;
      if (isResolved(ev.id)) continue;
      if (isDismissed(ev.id, start)) continue;
      const snoozedIso = snoozeMap[ev.id];
      if (snoozedIso) {
        const until = safeParse(snoozedIso);
        if (until && until.getTime() > now) continue;
      }
      if (readIds.has(ev.id)) continue;
      count += 1;
    }
    return count;
  }, [events, eligible, userId, isResolved, isDismissed, tick]);
}