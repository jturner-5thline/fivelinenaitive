import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ACTIVE_PIPELINE_ID,
  computeStageEntryDeals,
  fetchStageEntryWindowRows,
  type StageEntryDeal,
} from '@/lib/dashboardTiles/stageQueries';

/**
 * Count of distinct deals that entered a given stage within a trailing window.
 * Reads from `deal_stage_history` (event_type = 'stage_enter'), scoped to the
 * Active Deals pipeline and excluding globally-excluded test deals.
 */

export interface StageEntryCountResult {
  count: number;
  deals: StageEntryDeal[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export type { StageEntryDeal };

export interface StageEntryEventsResult {
  events: StageEntryDeal[]; // raw, one row per stage_enter event (not deduped)
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

/**
 * Raw stage_enter events over a window. Not deduped by deal — callers can
 * bucket by month/quarter and dedupe per bucket as needed.
 */
export function useStageEntryEvents(
  stageId: string,
  range: { start: Date | string; end: Date | string },
): StageEntryEventsResult {
  const { user } = useAuth();
  const startIso = (range.start instanceof Date ? range.start : new Date(range.start)).toISOString();
  const endIso = (range.end instanceof Date ? range.end : new Date(range.end)).toISOString();

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['stage-entry-events', ACTIVE_PIPELINE_ID, stageId, startIso, endIso],
    queryFn: () => fetchStageEntryWindowRows(supabase, stageId, startIso, endIso),
    enabled: !!user,
    // TTM windows shift as the user changes the selected timeframe. Keep
    // recent results warm and show them while the next window is fetched
    // so the dashboard doesn't flash a spinner on every date change.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const events = computeStageEntryDeals(data ?? [], false);

  return {
    events,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}

/**
 * Pass either an explicit { start, end } window (preferred — mirrors the
 * dashboard's selected timeframe) or a trailing-months number (fallback).
 */
export function useStageEntryCount(
  stageId: string,
  range: number | { start: Date | string; end: Date | string } = 12,
): StageEntryCountResult {
  const { user } = useAuth();

  let startIso: string;
  let endIso: string;
  if (typeof range === 'number') {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - range);
    startIso = since.toISOString();
    endIso = new Date().toISOString();
  } else {
    startIso = (range.start instanceof Date ? range.start : new Date(range.start)).toISOString();
    endIso = (range.end instanceof Date ? range.end : new Date(range.end)).toISOString();
  }

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['stage-entry-count', ACTIVE_PIPELINE_ID, stageId, startIso, endIso],
    queryFn: () => fetchStageEntryWindowRows(supabase, stageId, startIso, endIso),
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const deals = computeStageEntryDeals(data ?? [], true);

  return {
    count: deals.length,
    deals,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}