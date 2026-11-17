import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEBT_STAGE_PIPELINES,
  PROPOSAL_ISSUED_STAGE_LABELS,
  computeFirstEntries,
  fetchFirstEntryRows,
  yearWindow,
  type FirstStageEntry,
} from '@/lib/dashboardTiles/stageQueries';

/**
 * "Proposals Issued" — first stage_enter into Proposal Issued per deal on the
 * Active + In Development pipelines, excluding test deals, collapsed by company
 * name, bucketed by UTC month. Query + transform shared with the MCP tool.
 */
export type ProposalIssuedEntry = FirstStageEntry;

export interface ProposalsIssuedByMonthResult {
  deals: ProposalIssuedEntry[];
  byMonth: ProposalIssuedEntry[][];
  countsByMonth: number[];
  byMonthKey: Record<string, ProposalIssuedEntry[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useProposalsIssuedByMonth(yearOrYears: number | number[]): ProposalsIssuedByMonthResult {
  const { user } = useAuth();
  const years = Array.isArray(yearOrYears) ? yearOrYears : [yearOrYears];
  const { start, end } = yearWindow(years);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['proposals-issued-by-month', DEBT_STAGE_PIPELINES.join(','), start.slice(0, 4), end.slice(0, 4)],
    queryFn: () => fetchFirstEntryRows(supabase, { pipelineIds: DEBT_STAGE_PIPELINES, labels: PROPOSAL_ISSUED_STAGE_LABELS, start, end }),
    enabled: !!user,
  });

  const computed = computeFirstEntries(data ?? [], true);
  return { ...computed, isLoading, isFetching, error: (error as Error) ?? null };
}
