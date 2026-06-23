/**
 * useNaitiveQualCallsCount — counts calendar events titled "<NAME> <> naitive"
 * across all 5th Line teammates (same email domain) within a time window.
 *
 * Backed by the `naitive-qual-calls-count` edge function which fans out to
 * Nylas for each connected teammate. Used by the Weekly Execution Pulse to
 * power the "Qual Calls" KPI card.
 */
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NaitiveQualCallEvent {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  user_email: string | null;
  user_name: string | null;
  html_link: string | null;
  attendees?: { email: string | null; name: string | null }[];
}

export interface NaitiveQualCallsResult {
  count: number;
  events: NaitiveQualCallEvent[];
}

export function useNaitiveQualCallsCount(from: Date, to: Date) {
  const timeMin = from.toISOString();
  const timeMax = to.toISOString();
  return useQuery<NaitiveQualCallsResult, Error>({
    queryKey: ['naitive-qual-calls-count', timeMin, timeMax],
    // Cache aggressively — calendar counts for past windows don't change
    // every minute, and the user flips between ranges often.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('naitive-qual-calls-count', {
        body: { time_min: timeMin, time_max: timeMax },
      });
      if (error) throw new Error(error.message || 'Failed to load qual calls');
      return {
        count: Number(data?.count ?? 0),
        events: Array.isArray(data?.events) ? (data.events as NaitiveQualCallEvent[]) : [],
      };
    },
  });
}

/**
 * Warm the cache for the standard timeframe presets (this/last week, last
 * 30/90 days, and the prior-period comparisons) so flipping between them
 * feels instant after the first paint.
 */
export function usePrefetchNaitiveQualCalls(ranges: { from: Date; to: Date }[]) {
  const qc = useQueryClient();
  useEffect(() => {
    ranges.forEach(({ from, to }) => {
      const timeMin = from.toISOString();
      const timeMax = to.toISOString();
      qc.prefetchQuery({
        queryKey: ['naitive-qual-calls-count', timeMin, timeMax],
        staleTime: 10 * 60_000,
        queryFn: async () => {
          const { data, error } = await supabase.functions.invoke('naitive-qual-calls-count', {
            body: { time_min: timeMin, time_max: timeMax },
          });
          if (error) throw new Error(error.message || 'Failed to load qual calls');
          return {
            count: Number(data?.count ?? 0),
            events: Array.isArray(data?.events) ? (data.events as NaitiveQualCallEvent[]) : [],
          };
        },
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranges.map((r) => `${r.from.toISOString()}|${r.to.toISOString()}`).join(',')]);
}