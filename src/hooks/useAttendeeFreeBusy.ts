/**
 * useAttendeeFreeBusy — fetches per-attendee free/busy via the
 * `calendar-freebusy` edge function (Nylas v3). Batches by 50 per Google's
 * limits, caches for 60s, and only runs when there is at least one
 * attendee email.
 *
 * Attendees whose free/busy is not shared (403 / not_shared / external
 * domains) come back as `visibility: 'limited'` with `busy: []` — callers
 * MUST NOT treat that as "free".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FreeBusyBlock { start: string; end: string }
export interface AttendeeFreeBusy {
  email: string;
  visibility: 'shared' | 'limited';
  busy: FreeBusyBlock[];
  reason?: string;
}

interface Args {
  range: { start: Date; end: Date };
  emails: string[];
  enabled?: boolean;
}

export function useAttendeeFreeBusy({ range, emails, enabled = true }: Args) {
  const normalized = Array.from(
    new Set(emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)),
  ).sort();
  const start = range.start.toISOString();
  const end = range.end.toISOString();

  return useQuery<AttendeeFreeBusy[], Error>({
    queryKey: ['attendee-freebusy', start, end, normalized.join(',')],
    enabled: enabled && normalized.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      // Batch by 50.
      const batches: string[][] = [];
      for (let i = 0; i < normalized.length; i += 50) batches.push(normalized.slice(i, i + 50));
      const all: AttendeeFreeBusy[] = [];
      for (const batch of batches) {
        const { data, error } = await supabase.functions.invoke('calendar-freebusy', {
          body: { time_min: start, time_max: end, emails: batch },
        });
        if (error) {
          // Graceful fallback: mark every email in the failing batch as limited.
          for (const e of batch) all.push({ email: e, visibility: 'limited', busy: [], reason: error.message });
          continue;
        }
        const results: AttendeeFreeBusy[] = (data?.results ?? []) as AttendeeFreeBusy[];
        for (const r of results) all.push(r);
      }
      return all;
    },
  });
}