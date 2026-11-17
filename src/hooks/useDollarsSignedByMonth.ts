import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ACTIVE_PIPELINE_ID,
  DEBT_STAGE_PIPELINES,
  DOLLARS_SIGNED_STAGE_LABELS,
  computeFirstEntries,
  fetchFirstEntryRows,
  yearWindow,
  type FirstStageEntry,
} from '@/lib/dashboardTiles/stageQueries';

/**
 * "Dollars Signed" — first stage_enter per deal into Final Credit Items or any
 * downstream stage on the Active Pipeline, excluding test deals, collapsed by
 * company name, bucketed by UTC month, in $MM. Shared with the MCP tool.
 */
export type DollarsSignedEntry = FirstStageEntry;

export interface DollarsSignedByMonthResult {
  deals: DollarsSignedEntry[];
  byMonth: DollarsSignedEntry[][];
  dollarsByMonthMM: number[];
  countsByMonth: number[];
  byMonthKey: Record<string, DollarsSignedEntry[]>;
  dollarsByMonthKeyMM: Record<string, number>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useDollarsSignedByMonth(yearOrYears: number | number[]): DollarsSignedByMonthResult {
  const { user } = useAuth();
  const years = Array.isArray(yearOrYears) ? yearOrYears : [yearOrYears];
  const { start, end } = yearWindow(years);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dollars-signed-by-month', DEBT_STAGE_PIPELINES.join(','), start.slice(0, 4), end.slice(0, 4)],
    queryFn: () => fetchFirstEntryRows(supabase, { pipelineIds: [ACTIVE_PIPELINE_ID], labels: DOLLARS_SIGNED_STAGE_LABELS, start, end }),
    enabled: !!user,
  });

  const computed = computeFirstEntries(data ?? [], true);
  const sumMM = (arr: DollarsSignedEntry[]) => arr.reduce((s, d) => s + d.value, 0) / 1_000_000;
  const dollarsByMonthKeyMM: Record<string, number> = {};
  for (const [k, arr] of Object.entries(computed.byMonthKey)) dollarsByMonthKeyMM[k] = sumMM(arr);
  return {
    ...computed,
    dollarsByMonthMM: computed.byMonth.map(sumMM),
    dollarsByMonthKeyMM,
    isLoading,
    isFetching,
    error: (error as Error) ?? null,
  };
}
