/**
 * useFreeBusyCache — React Query–backed cache of the signed-in user's
 * primary calendar free/busy intervals. Keyed by (email, window). 60s
 * staleTime so repeat panel opens within a minute skip the network
 * round-trip entirely. Also exposes a `prefetchFreeBusy` helper so AI
 * Assist can pre-warm the cache on thread open.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BusyInterval { start: Date; end: Date }

function windowKey(email: string | null, startISO: string, endISO: string) {
  return ['freebusy-self', email ?? 'anon', startISO, endISO] as const;
}

async function fetchFreeBusy(email: string | null, startISO: string, endISO: string): Promise<BusyInterval[]> {
  if (!email) return [];
  const { data, error } = await supabase.functions.invoke('calendar-freebusy', {
    body: { time_min: startISO, time_max: endISO, emails: [email] },
  });
  if (error) throw new Error(error.message);
  const results = (data?.results ?? []) as Array<{ busy: { start: string; end: string }[] }>;
  return results.flatMap((r) => (r.busy ?? []).map((b) => ({
    start: new Date(b.start), end: new Date(b.end),
  })));
}

/** Compute a 14 business-day window anchored to today midnight. */
export function defaultPrewarmWindow(): { startISO: string; endISO: string; start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 21); // ~14 business days
  end.setHours(23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString(), start, end };
}

/** Imperative prefetch — safe to call on panel/thread mount. */
export async function prefetchFreeBusy(qc: QueryClient, email: string | null) {
  if (!email) return;
  const { startISO, endISO } = defaultPrewarmWindow();
  await qc.prefetchQuery({
    queryKey: windowKey(email, startISO, endISO),
    queryFn: () => fetchFreeBusy(email, startISO, endISO),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useSelfEmail() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  return email;
}

export function useFreeBusyCache(startISO: string, endISO: string) {
  const email = useSelfEmail();
  const query = useQuery<BusyInterval[]>({
    queryKey: windowKey(email, startISO, endISO),
    queryFn: () => fetchFreeBusy(email, startISO, endISO),
    enabled: !!email,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (prev) => prev,
  });
  return {
    busy: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isCached: query.data !== undefined,
    error: query.error as Error | null,
    email,
  };
}