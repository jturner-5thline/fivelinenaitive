import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * "Deals on Board" — same definition as Debt Advisory Metrics'
 * "Deals on the Board": distinct deals that ENTERED "NDA / Needs List Sent"
 * (stage_enter history rows recorded on the Active Pipeline), excluding
 * John Moffitt-owned/authored entries and globally-excluded test deals,
 * deduped by company name. Bucketed by the month the deal entered NDA.
 * `created_at` on each entry holds that NDA entry timestamp.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const NDA_STAGE_VALUES = ['ndaneeds-list-sent', 'NDA/Needs List Sent', 'NDA / Needs List Sent'];
const EXCLUDED_OWNERS = new Set(['john moffitt']);
const EXCLUDED_CHANGED_BY = new Set(['2e65a4b1-bd94-46ef-87c6-9afe697b3180']);

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
    queryKey: ['deals-on-board-by-month', 'nda-entry', ACTIVE_PIPELINE_ID, startYear, endYear],
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, changed_by, pipeline_id, deals!inner(id, company, value, manager, stage, deal_owner)')
        .eq('event_type', 'stage_enter')
        .in('to_stage', NDA_STAGE_VALUES)
        .gte('changed_at', start)
        .lte('changed_at', end + 'T23:59:59.999Z')
        .order('changed_at', { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const rawDeals: DealOnBoardEntry[] = (data ?? [])
    .filter((h: any) => {
      const d = h.deals;
      if (!d) return false;
      if (h.pipeline_id && h.pipeline_id !== ACTIVE_PIPELINE_ID) return false;
      if (EXCLUDED_CHANGED_BY.has(h.changed_by)) return false;
      if (EXCLUDED_OWNERS.has(String(d.deal_owner ?? '').toLowerCase().trim())) return false;
      return !isExcludedDealName(d.company);
    })
    .map((h: any) => {
      const d = h.deals;
      return {
        id: d.id,
        company: d.company ?? '—',
        value: Number(d.value) || 0,
        manager: d.manager ?? null,
        stage: d.stage ?? null,
        created_at: h.changed_at,
        month_index: new Date(h.changed_at).getUTCMonth(),
      };
    });
  // Collapse duplicates by company name, keeping the earliest NDA entry.
  const byName = new Map<string, DealOnBoardEntry>();
  for (const d of rawDeals) {
    const key = (d.company ?? '').toLowerCase().trim() || d.id;
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