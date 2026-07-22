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
const IN_DEVELOPMENT_PIPELINE_ID = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
const DEBT_STAGE_PIPELINES = [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID];
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
  byMonthKey: Record<string, DollarsSignedEntry[]>;
  dollarsByMonthKeyMM: Record<string, number>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useDollarsSignedByMonth(yearOrYears: number | number[]): DollarsSignedByMonthResult {
  const { user } = useAuth();

  const years = Array.isArray(yearOrYears) ? [...new Set(yearOrYears)].sort() : [yearOrYears];
  const startYear = years[0];
  const endYear = years[years.length - 1];
  const start = `${startYear}-01-01`;
  const end = `${endYear}-12-31`;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dollars-signed-by-month', DEBT_STAGE_PIPELINES.join(','), startYear, endYear],
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
        .in('pipeline_id', DEBT_STAGE_PIPELINES)
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
    // Collapse duplicate deals with the same company name (case-insensitive),
    // keeping the earliest entry so we don't double-count e.g. "Trashie" twice.
    const byName = new Map<string, DollarsSignedEntry>();
    for (const entry of seen.values()) {
      const key = (entry.company ?? '').toLowerCase().trim();
      if (!key) { byName.set(entry.deal_id, entry); continue; }
      const existing = byName.get(key);
      if (!existing || new Date(entry.entered_at).getTime() < new Date(existing.entered_at).getTime()) {
        byName.set(key, entry);
      }
    }
    return Array.from(byName.values());
  })();

  const byMonth: DollarsSignedEntry[][] = Array.from({ length: 12 }, () => []);
  const byMonthKey: Record<string, DollarsSignedEntry[]> = {};
  for (const d of deals) {
    if (d.month_index >= 0 && d.month_index < 12) byMonth[d.month_index].push(d);
    const dt = new Date(d.entered_at);
    const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    (byMonthKey[k] = byMonthKey[k] || []).push(d);
  }
  const dollarsByMonthMM = byMonth.map((arr) =>
    arr.reduce((s, d) => s + d.value, 0) / 1_000_000,
  );
  const dollarsByMonthKeyMM: Record<string, number> = {};
  for (const [k, arr] of Object.entries(byMonthKey)) {
    dollarsByMonthKeyMM[k] = arr.reduce((s, d) => s + d.value, 0) / 1_000_000;
  }
  const countsByMonth = byMonth.map((arr) => arr.length);

  return {
    deals,
    byMonth,
    dollarsByMonthMM,
    countsByMonth,
    byMonthKey,
    dollarsByMonthKeyMM,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}
