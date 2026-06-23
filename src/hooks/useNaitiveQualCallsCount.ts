/**
 * useNaitiveQualCallsCount — counts calendar events titled "<NAME> <> naitive"
 * across all 5th Line teammates (same email domain) within a time window.
 *
 * Backed by the `naitive-qual-calls-count` edge function which fans out to
 * Nylas for each connected teammate. Used by the Weekly Execution Pulse to
 * power the "Qual Calls" KPI card.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useNaitiveQualCallsCount(from: Date, to: Date) {
  const timeMin = from.toISOString();
  const timeMax = to.toISOString();
  return useQuery<number, Error>({
    queryKey: ['naitive-qual-calls-count', timeMin, timeMax],
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('naitive-qual-calls-count', {
        body: { time_min: timeMin, time_max: timeMax },
      });
      if (error) throw new Error(error.message || 'Failed to load qual calls');
      return Number(data?.count ?? 0);
    },
  });
}