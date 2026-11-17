import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  FINSERV_PIPELINE_ID,
  FINSERV_DEALS_ON_BOARD_LABELS,
  FINSERV_PROPOSALS_LABELS,
  computeFirstEntries,
  fetchFirstEntryRows,
  yearWindow,
  type FirstStageEntry,
} from '@/lib/dashboardTiles/stageQueries';

/**
 * FinServ pipeline stage-entry metric — each deal's first entry into the given
 * stage on the FinServ pipeline, bucketed by UTC month. Shared with the MCP tool.
 */
export { FINSERV_PIPELINE_ID };
export type FinservStageEntry = FirstStageEntry;

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
  const years = Array.isArray(yearOrYears) ? yearOrYears : [yearOrYears];
  const { start, end } = yearWindow(years);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['finserv-stage-entry', cacheKey, FINSERV_PIPELINE_ID, start.slice(0, 4), end.slice(0, 4), ...stageLabels],
    queryFn: () => fetchFirstEntryRows(supabase, { pipelineIds: [FINSERV_PIPELINE_ID], labels: stageLabels, start, end }),
    enabled: !!user,
  });

  const computed = computeFirstEntries(data ?? [], false);
  return { ...computed, isLoading, isFetching, error: (error as Error) ?? null };
}

export function useFinservDealsOnBoardByMonth(years: number | number[]) {
  // "Qualification" stage in the FinServ pipeline.
  return useFinservStageEntryByMonth(
    FINSERV_DEALS_ON_BOARD_LABELS,
    years,
    'deals-on-board',
  );
}

export function useFinservProposalsIssuedByMonth(years: number | number[]) {
  // "Proposal Sent" stage in the FinServ pipeline.
  return useFinservStageEntryByMonth(
    FINSERV_PROPOSALS_LABELS,
    years,
    'proposals-issued',
  );
}