import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * "Deals on Board" — mirrors the Consolidated Debt Pipeline Board logic
 * (usePipelineDealsInPeriod) but returns the deals bucketed by the
 * calendar month of `created_at`, scoped to the Active Pipeline and
 * excluding closed-won / closed-lost / on-hold / archived deals plus
 * globally-excluded test deals.
 *
 * Range: full calendar year [year, year+1) in UTC.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';

export interface DealOnBoardEntry {
  id: string;
  company: string;
  value: number;
  manager: string | null;
  stage: string | null;
  created_at: string;
  month_index: number; // 0..11 in UTC
}

export interface DealsOnBoardByMonthResult {
  deals: DealOnBoardEntry[];
  byMonth: DealOnBoardEntry[][]; // length 12
  countsByMonth: number[];       // length 12
  /** Bucketed by absolute YYYY-MM key, so consumers spanning multiple years work. */
  byMonthKey: Record<string, DealOnBoardEntry[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useDealsOnBoardByMonth(yearOrYears: number | number[]): DealsOnBoardByMonthResult {
  const { user } = useAuth();

  const years = Array.isArray(yearOrYears) ? [...new Set(yearOrYears)].sort() : [yearOrYears];
  const startYear = years[0];
  const endYear = years[years.length - 1];
  const start = `${startYear}-01-01`;
  const end = `${endYear}-12-31`;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['deals-on-board-by-month', ACTIVE_PIPELINE_ID, startYear, endYear],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deals')
        .select('id, company, value, manager, stage, pipeline_id, created_at, status')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .gte('created_at', start)
        .lte('created_at', end + 'T23:59:59.999Z')
        .order('created_at', { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const excludedStatuses = new Set(['closed-won', 'closed-lost', 'on-hold', 'archived']);
  const excludedStages = new Set(['closed-won', 'closed-lost']);

  const rawDeals: DealOnBoardEntry[] = (data ?? [])
    .filter((d: any) => {
      const status = (d.status || '').toLowerCase();
      const stage = (d.stage || '').toLowerCase();
      return (
        !excludedStatuses.has(status) &&
        !excludedStages.has(stage) &&
        !isExcludedDealName(d.company)
      );
    })
    .map((d: any) => {
      const created = new Date(d.created_at);
      return {
        id: d.id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager ?? null,
        stage: d.stage ?? null,
        created_at: d.created_at,
        month_index: created.getUTCMonth(),
      };
    });
  // Collapse duplicate deals sharing the same company name (case-insensitive),
  // keeping the earliest created_at so e.g. "Trashie" is only counted once.
  const byName = new Map<string, DealOnBoardEntry>();
  for (const d of rawDeals) {
    const key = (d.company ?? '').toLowerCase().trim();
    if (!key) { byName.set(d.id, d); continue; }
    const existing = byName.get(key);
    if (!existing || new Date(d.created_at).getTime() < new Date(existing.created_at).getTime()) {
      byName.set(key, d);
    }
  }
  const deals: DealOnBoardEntry[] = Array.from(byName.values());

  const byMonth: DealOnBoardEntry[][] = Array.from({ length: 12 }, () => []);
  const byMonthKey: Record<string, DealOnBoardEntry[]> = {};
  for (const d of deals) {
    if (d.month_index >= 0 && d.month_index < 12) byMonth[d.month_index].push(d);
    const dt = new Date(d.created_at);
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