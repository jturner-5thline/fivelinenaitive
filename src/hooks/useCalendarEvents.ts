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
import { useQuery } from '@tanstack/react-query';
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
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'list',
          time_min: start,
          time_max: end,
          max_results: 500,
          timezone: tz,
          calendar_id: calendarId,
        },
      });
      if (error) throw new Error(error.message || 'Could not load calendar events.');
      const rows: CalEvent[] = (data?.events ?? []).map((e: any) => ({
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
      return rows;
    },
  });
}
