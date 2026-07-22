import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * "Proposals Issued" — mirrors the Consolidated Debt Pipeline Board logic
 * (useStageEntryMetric for PROPOSAL_ISSUED_STAGE on the Active Pipeline,
 * deduped to the first stage_enter event per deal, excluding test deals),
 * bucketed by the calendar month (UTC) of `changed_at`.
 *
 * Range: full calendar year [year, year+1) in UTC.
 */
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const IN_DEVELOPMENT_PIPELINE_ID = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
const DEBT_STAGE_PIPELINES = [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID];
const PROPOSAL_ISSUED_STAGE_LABELS = ['proposal-issued', 'Proposal Issued'];

export interface ProposalIssuedEntry {
  id: string;
  deal_id: string;
  company: string;
  value: number;
  manager: string | null;
  current_stage: string | null;
  entered_at: string;
  month_index: number; // 0..11 in UTC
}

export interface ProposalsIssuedByMonthResult {
  deals: ProposalIssuedEntry[];
  byMonth: ProposalIssuedEntry[][]; // length 12
  countsByMonth: number[];          // length 12
  byMonthKey: Record<string, ProposalIssuedEntry[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useProposalsIssuedByMonth(yearOrYears: number | number[]): ProposalsIssuedByMonthResult {
  const { user } = useAuth();

  const years = Array.isArray(yearOrYears) ? [...new Set(yearOrYears)].sort() : [yearOrYears];
  const startYear = years[0];
  const endYear = years[years.length - 1];
  const start = `${startYear}-01-01`;
  const end = `${endYear}-12-31`;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['proposals-issued-by-month', DEBT_STAGE_PIPELINES.join(','), startYear, endYear],
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
        .in('to_stage', PROPOSAL_ISSUED_STAGE_LABELS)
        .gte('changed_at', start)
        .lte('changed_at', end + 'T23:59:59.999Z')
        .order('changed_at', { ascending: true });
      if (err) throw err;
      return rows ?? [];
    },
    enabled: !!user,
  });

  const deals: ProposalIssuedEntry[] = (() => {
    if (!data) return [];
    // Dedup: keep FIRST entry into the stage per deal.
    const seen = new Map<string, ProposalIssuedEntry>();
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

  const byMonth: ProposalIssuedEntry[][] = Array.from({ length: 12 }, () => []);
  const byMonthKey: Record<string, ProposalIssuedEntry[]> = {};
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