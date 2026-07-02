/**
 * useSalesCallsCount — fetches 5th Line "Financing Review" calendar events
 * across all connected teammate calendars for the given window, deduped to
 * one entry per unique meeting. Returns events with start ISO strings so
 * callers can bucket them (e.g. per month) for dashboard charts.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesCallEvent {
  id: string;
  dedupe_key: string;
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  user_email: string | null;
  user_name: string | null;
  html_link: string | null;
  attendees?: { email: string | null; name: string | null }[];
}

export interface SalesCallsResult {
  count: number;
  events: SalesCallEvent[];
}

export function useSalesCallsCount(
  from: Date,
  to: Date,
  enabled = true,
  variant: 'debt' | 'finserv' = 'debt',
) {
  const timeMin = from.toISOString();
  const timeMax = to.toISOString();
  return useQuery<SalesCallsResult, Error>({
    queryKey: ['sales-calls-count', variant, timeMin, timeMax],
    enabled,
    // Backed by sales_calls_cache (refreshed daily by sales-calls-refresh
    // cron). Stay fresh for 12h so page reloads serve instantly without
    // re-invoking the edge function on every mount.
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sales-calls-count', {
        body: { time_min: timeMin, time_max: timeMax, variant },
      });
      if (error) throw new Error(error.message || 'Failed to load sales calls');
      return {
        count: Number(data?.count ?? 0),
        events: Array.isArray(data?.events) ? (data.events as SalesCallEvent[]) : [],
      };
    },
  });
}