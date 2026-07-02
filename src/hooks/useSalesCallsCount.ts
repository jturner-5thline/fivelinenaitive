/**
 * useSalesCallsCount — fetches 5th Line "Financing Review" calendar events
 * across all connected teammate calendars for the given window, deduped to
 * one entry per unique meeting. Returns events with start ISO strings so
 * callers can bucket them (e.g. per month) for dashboard charts.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEBT_FINANCING_RE = /5\s*th\s*line[\s\S]{0,80}\bfinancing\s+review\b/i;
const FINSERV_FINANCIAL_RE = /^\s*5\s*th\s+line\s*(?:<>|[-–—|:/])\s*.+?\s+financial\s+review\s*$/i;

export function isSalesCallEventForVariant(
  eventOrTitle: Pick<SalesCallEvent, 'title'> | string,
  variant: 'debt' | 'finserv',
) {
  const title = typeof eventOrTitle === 'string' ? eventOrTitle : eventOrTitle.title || '';
  if (variant === 'finserv') {
    return FINSERV_FINANCIAL_RE.test(title) && !DEBT_FINANCING_RE.test(title);
  }
  return DEBT_FINANCING_RE.test(title);
}

export function filterSalesCallEventsForVariant(events: SalesCallEvent[], variant: 'debt' | 'finserv') {
  return events.filter((event) => isSalesCallEventForVariant(event, variant));
}

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
      const events = filterSalesCallEventsForVariant(
        Array.isArray(data?.events) ? (data.events as SalesCallEvent[]) : [],
        variant,
      );
      return {
        count: variant === 'finserv' ? events.length : Number(data?.count ?? events.length),
        events,
      };
    },
  });
}