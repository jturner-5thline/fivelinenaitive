/**
 * useCalendarEvents — react-query hook fetching the signed-in user's
 * primary Google Calendar via the existing `calendar-events` edge
 * function. Cached by (range.start, range.end, tz) and auto-refetched
 * when any of those change.
 *
 * Designed as the data source for the canonical `NaitiveCalendar`
 * component. Future fixes (#1 cross-attendee overlay, #4 soft-holds)
 * will reuse this hook with extra params.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CalEvent } from '@/components/calendar/NaitiveCalendar';

export interface CalendarRange {
  start: Date;
  end: Date;
}

export interface UseCalendarEventsArgs {
  range: CalendarRange;
  tz?: string;
  /** Optional override calendar id — defaults to 'primary'. */
  calendarId?: string;
  enabled?: boolean;
}

export function useCalendarEvents({ range, tz, calendarId = 'primary', enabled = true }: UseCalendarEventsArgs) {
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  return useQuery<CalEvent[], Error>({
    queryKey: ['naitive-calendar-events', calendarId, start, end, tz ?? null],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: () => fetchCalendarEvents({ start, end, tz, calendarId }),
  });
}

async function fetchCalendarEvents(args: { start: string; end: string; tz?: string; calendarId: string }): Promise<CalEvent[]> {
  const { data, error } = await supabase.functions.invoke('calendar-events', {
    body: {
      action: 'list',
      time_min: args.start,
      time_max: args.end,
      max_results: 500,
      timezone: args.tz,
      calendar_id: args.calendarId,
    },
  });
  if (error) throw new Error(error.message || 'Could not load calendar events.');
  return (data?.events ?? []).map((e: any) => ({
    id: e.id,
    title: e.title || e.summary || e.subject || null,
    start: e.start,
    end: e.end,
    all_day: !!e.all_day,
    location: e.location ?? null,
    description: e.description ?? null,
    htmlLink: e.htmlLink ?? e.html_link ?? null,
    hangoutLink: e.hangoutLink ?? e.hangout_link ?? e.conferenceUrl ?? null,
    attendees: e.attendees ?? null,
    color: e.color ?? e.colorId ?? null,
  }));
}

/**
 * Prefetch the adjacent (±1) range of the same width as the current view
 * so navigating prev/next renders instantly from cache. Fires after the
 * primary range resolves; respects the same cache key + staleTime.
 */
export function usePrefetchAdjacentCalendarRanges({ range, tz, calendarId = 'primary', enabled = true }: UseCalendarEventsArgs) {
  const qc = useQueryClient();
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  useEffect(() => {
    if (!enabled) return;
    const width = endMs - startMs;
    if (width <= 0) return;
    const prev = { start: new Date(startMs - width), end: new Date(startMs - 1) };
    const next = { start: new Date(endMs + 1), end: new Date(endMs + width) };
    const handle = setTimeout(() => {
      for (const r of [prev, next]) {
        const s = r.start.toISOString();
        const e = r.end.toISOString();
        qc.prefetchQuery({
          queryKey: ['naitive-calendar-events', calendarId, s, e, tz ?? null],
          staleTime: 60_000,
          queryFn: () => fetchCalendarEvents({ start: s, end: e, tz, calendarId }),
        });
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [qc, startMs, endMs, tz, calendarId, enabled]);
}
