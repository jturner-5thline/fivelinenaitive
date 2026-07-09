import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * Count of distinct deals that entered a given stage within a trailing window.
 * Reads from `deal_stage_history` (event_type = 'stage_enter'), scoped to the
 * Active Deals pipeline and excluding globally-excluded test deals.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

export interface StageEntryCountResult {
  count: number;
  deals: StageEntryDeal[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export interface StageEntryDeal {
  deal_id: string;
  company: string;
  value: number;
  manager: string | null;
  changed_at: string;
}

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
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, deals!inner(company, value, manager)')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .eq('event_type', 'stage_enter')
        .eq('to_stage_id', stageId)
        .gte('changed_at', startIso)
        .lte('changed_at', endIso)
        .order('changed_at', { ascending: false });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const events: StageEntryDeal[] = [];
  for (const r of (data ?? []) as any[]) {
    const company = r.deals?.company ?? '';
    if (isExcludedDealName(company)) continue;
    if (!r.deal_id) continue;
    events.push({
      deal_id: r.deal_id,
      company,
      value: Number(r.deals?.value) || 0,
      manager: r.deals?.manager ?? null,
      changed_at: r.changed_at,
    });
  }

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
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, deals!inner(company, value, manager)')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .eq('event_type', 'stage_enter')
        .eq('to_stage_id', stageId)
        .gte('changed_at', startIso)
        .lte('changed_at', endIso)
        .order('changed_at', { ascending: false });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const seen = new Set<string>();
  const deals: StageEntryDeal[] = [];
  for (const r of (data ?? []) as any[]) {
    const company = r.deals?.company ?? '';
    if (isExcludedDealName(company)) continue;
    if (!r.deal_id || seen.has(r.deal_id)) continue;
    seen.add(r.deal_id);
    deals.push({
      deal_id: r.deal_id,
      company,
      value: Number(r.deals?.value) || 0,
      manager: r.deals?.manager ?? null,
      changed_at: r.changed_at,
    });
  }

  return {
    count: seen.size,
    deals,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}