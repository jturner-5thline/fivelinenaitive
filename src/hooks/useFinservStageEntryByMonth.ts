import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * FinServ pipeline stage-entry metric — counts each deal the first time it
 * enters the given stage on the FinServ pipeline, bucketed by the calendar
 * month (UTC) of `changed_at`. Mirrors useProposalsIssuedByMonth but for a
 * configurable stage + the FinServ pipeline id.
 */
export const FINSERV_PIPELINE_ID = '6907be5e-b17c-4a95-a7c2-fd977c94e179';

export interface FinservStageEntry {
  id: string;
  deal_id: string;
  company: string;
  value: number;
  manager: string | null;
  current_stage: string | null;
  entered_at: string;
  month_index: number;
}

export interface FinservStageEntryResult {
  deals: FinservStageEntry[];
  byMonth: FinservStageEntry[][];
  countsByMonth: number[];
  byMonthKey: Record<string, FinservStageEntry[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useFinservStageEntryByMonth(
  stageLabels: string[],
  yearOrYears: number | number[],
  cacheKey: string,
): FinservStageEntryResult {
  const { user } = useAuth();

  const years = Array.isArray(yearOrYears) ? [...new Set(yearOrYears)].sort() : [yearOrYears];
  const startYear = years[0];
  const endYear = years[years.length - 1];
  const start = `${startYear}-01-01`;
  const end = `${endYear}-12-31`;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['finserv-stage-entry', cacheKey, FINSERV_PIPELINE_ID, startYear, endYear, ...stageLabels],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deal_stage_history')
        .select(`
          deal_id,
          changed_at,
          to_stage,
          deals!inner (
            company,
            value,
            manager,
            stage,
            pipeline_id
          )
        `)
        .eq('event_type', 'stage_enter')
        .eq('pipeline_id', FINSERV_PIPELINE_ID)
        .in('to_stage', stageLabels)
        .gte('changed_at', start)
        .lte('changed_at', end + 'T23:59:59.999Z')
        .order('changed_at', { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const deals: FinservStageEntry[] = (() => {
    if (!data) return [];
    const seen = new Map<string, FinservStageEntry>();
    for (const row of data as any[]) {
      if (seen.has(row.deal_id)) continue;
      const deal = row.deals;
      if (!deal) continue;
      if (isExcludedDealName(deal.company)) continue;
      const enteredAt = row.changed_at as string;
      const d = new Date(enteredAt);
      seen.set(row.deal_id, {
        id: row.deal_id,
        deal_id: row.deal_id,
        company: deal.company ?? '—',
        value: Number(deal.value) || 0,
        manager: deal.manager ?? null,
        current_stage: deal.stage ?? null,
        entered_at: enteredAt,
        month_index: d.getUTCMonth(),
      });
    }
    return Array.from(seen.values());
  })();

  const byMonth: FinservStageEntry[][] = Array.from({ length: 12 }, () => []);
  const byMonthKey: Record<string, FinservStageEntry[]> = {};
  for (const d of deals) {
    if (d.month_index >= 0 && d.month_index < 12) byMonth[d.month_index].push(d);
    const dt = new Date(d.entered_at);
    const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    (byMonthKey[k] = byMonthKey[k] || []).push(d);
  }
  const countsByMonth = byMonth.map((arr) => arr.length);

  return {
    deals,
    byMonth,
    countsByMonth,
    byMonthKey,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}

export function useFinservDealsOnBoardByMonth(years: number | number[]) {
  // "Qualification" stage in the FinServ pipeline.
  return useFinservStageEntryByMonth(
    ['fs-qualification', 'Qualification'],
    years,
    'deals-on-board',
  );
}

export function useFinservProposalsIssuedByMonth(years: number | number[]) {
  // "Proposal Sent" stage in the FinServ pipeline.
  return useFinservStageEntryByMonth(
    ['fs-proposal-sent', 'Proposal Sent'],
    years,
    'proposals-issued',
  );
}