import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ACTIVE_PIPELINE_ID,
  computeDealsOnBoard,
  fetchDealsOnBoardRows,
  yearWindow,
  type DealOnBoardEntry,
} from '@/lib/dashboardTiles/stageQueries';

/**
 * "Deals on Board" — distinct deals that ENTERED "NDA / Needs List Sent"
 * (stage_enter rows on the Active Pipeline), excluding John Moffitt-owned/
 * authored entries and test deals, deduped by company name, bucketed by UTC
 * month. Query + transform are shared with the MCP dashboard tool.
 */
export type { DealOnBoardEntry };

export interface DealsOnBoardByMonthResult {
  deals: DealOnBoardEntry[];
  byMonth: DealOnBoardEntry[][];
  countsByMonth: number[];
  byMonthKey: Record<string, DealOnBoardEntry[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

export function useDealsOnBoardByMonth(yearOrYears: number | number[]): DealsOnBoardByMonthResult {
  const { user } = useAuth();
  const years = Array.isArray(yearOrYears) ? yearOrYears : [yearOrYears];
  const { start, end } = yearWindow(years);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['deals-on-board-by-month', 'nda-entry', ACTIVE_PIPELINE_ID, start.slice(0, 4), end.slice(0, 4)],
    queryFn: () => fetchDealsOnBoardRows(supabase, start, end),
    enabled: !!user,
  });

  const computed = computeDealsOnBoard(data ?? []);
  return { ...computed, isLoading, isFetching, error: (error as Error) ?? null };
}
