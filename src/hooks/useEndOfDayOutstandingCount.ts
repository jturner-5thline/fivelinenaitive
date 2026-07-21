import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startOfDay, endOfDay, subDays, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useDbPersistentClears } from '@/hooks/useDbPersistentClears';
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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

// Bumping this version re-runs the one-time bulk clear of the End-of-Day
// backlog for allowlisted users. It writes a `::cutoff::<today>` row into
// `end_of_day_clears` for the dismissed + agenda scopes, which zeroes the
// badge and empties the EOD tab without enumerating every event id.
const ONE_TIME_CLEAR_VERSION = 'v1-2026-07-21';
const ONE_TIME_CLEAR_KEY_PREFIX = 'eod:one-time-clear';

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
  const qc = useQueryClient();

  // One-time bulk clear for the 5th Line allowlist. Writes a cutoff row so
  // every backlog item dated on/before today reads as cleared everywhere the
  // shared `useDbPersistentClears` hook is consumed (badge + EOD tab).
  useEffect(() => {
    if (!eligible || !userId) return;
    const flagKey = `${ONE_TIME_CLEAR_KEY_PREFIX}:${ONE_TIME_CLEAR_VERSION}:${userId}`;
    if (localStorage.getItem(flagKey)) return;
    let cancelled = false;
    (async () => {
      const today = new Date();
      const iso = today.toISOString().slice(0, 10);
      const rows = [
        { user_id: userId, item_id: `eod-dismissed::cutoff::${iso}` },
        { user_id: userId, item_id: `eod-agenda::cutoff::${iso}` },
      ];
      const { error } = await supabase
        .from('end_of_day_clears')
        .upsert(rows, { onConflict: 'user_id,item_id', ignoreDuplicates: true });
      if (cancelled) return;
      if (error && error.code !== '23505') {
        console.error('EOD one-time clear failed:', error);
        return;
      }
      try { localStorage.setItem(flagKey, new Date().toISOString()); } catch { /* quota */ }
      qc.invalidateQueries({ queryKey: ['db-persistent-clears', 'eod-dismissed', userId] });
      qc.invalidateQueries({ queryKey: ['db-persistent-clears', 'eod-agenda', userId] });
    })();
    return () => { cancelled = true; };
  }, [eligible, userId, qc]);

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
    // Post one-time-clear: the entire allowlist should read 0 on the badge.
    // The cutoff row above also empties the EOD tab, but we short-circuit
    // here so the badge never flickers a stale count between mount and the
    // clear query settling.
    return 0;
    // eslint-disable-next-line no-unreachable
    const snoozeMap = readLS<Record<string, string>>(`${SNOOZE_KEY_PREFIX}:${userId}`, {});
    const readSet = new Set(readLS<string[]>(`${READ_KEY_PREFIX}:${userId}`, []));
    const now = new Date();
    const ws = startOfDay(subDays(now, EOD_LOOKBACK_DAYS));
    const we = endOfDay(now);
    let count = 0;
    for (const ev of events || []) {
      const start = safeParse(ev.start);
      if (!start || start < ws || start > we) continue;
      const attendees = ev.attendees || [];
      const otherCount = attendees.filter((a) => !a.self).length;
      if (otherCount === 0) continue;
      if (isResolved(ev.id)) continue;
      if (isDismissed(ev.id, start)) continue;
      const until = snoozeMap[ev.id];
      if (until) {
        const d = safeParse(until);
        if (d && d > now) continue;
      }
      if (readSet.has(ev.id)) continue;
      count += 1;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, eligible, userId, isResolved, isDismissed, tick]);
}