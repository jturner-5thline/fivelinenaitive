import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * "Dollars Signed" — mirrors the Consolidated Debt Pipeline Board logic
 * (useStageEntryMetric for FINAL_CREDIT_ITEMS_STAGE on the Active Pipeline,
 * deduped to the first stage_enter event per deal, excluding test deals),
 * bucketed by the calendar month (UTC) of `changed_at`.
 *
 * Returns per-month dollar volume in MILLIONS so it reconciles 1:1 with the
 * Sales Dashboard-V2 plan arrays (already authored in $MM).
 *
 * Range: full calendar year [year, year+1) in UTC.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const FINAL_CREDIT_ITEMS_STAGE_LABELS = ['final-credit-items', 'Final Credit Items'];

export interface DollarsSignedEntry {
  id: string;
  deal_id: string;
  company: string;
  value: number; // raw dollars
  manager: string | null;
  current_stage: string | null;
  entered_at: string;
  month_index: number; // 0..11 UTC
}

export interface DollarsSignedByMonthResult {
  deals: DollarsSignedEntry[];
  byMonth: DollarsSignedEntry[][]; // length 12
  dollarsByMonthMM: number[];      // length 12, in $MM
  countsByMonth: number[];         // length 12
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useDollarsSignedByMonth(year: number): DollarsSignedByMonthResult {
  const { user } = useAuth();

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dollars-signed-by-month', ACTIVE_PIPELINE_ID, year],
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
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .in('to_stage', FINAL_CREDIT_ITEMS_STAGE_LABELS)
        .gte('changed_at', start)
        .lte('changed_at', end + 'T23:59:59.999Z')
        .order('changed_at', { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const deals: DollarsSignedEntry[] = (() => {
    if (!data) return [];
    const seen = new Map<string, DollarsSignedEntry>();
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

  const byMonth: DollarsSignedEntry[][] = Array.from({ length: 12 }, () => []);
  for (const d of deals) {
    if (d.month_index >= 0 && d.month_index < 12) byMonth[d.month_index].push(d);
  }
  const dollarsByMonthMM = byMonth.map((arr) =>
    arr.reduce((s, d) => s + d.value, 0) / 1_000_000,
  );
  const countsByMonth = byMonth.map((arr) => arr.length);

  return {
    deals,
    byMonth,
    dollarsByMonthMM,
    countsByMonth,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}
