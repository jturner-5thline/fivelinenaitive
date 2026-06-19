import { useUiPreference } from './useUiPreference';
import type { DealViewConfig } from './useDealSavedViews';

/**
 * Per-user persistence of the last in-use deal view state (filters,
 * sort, view mode, grouping) so a page refresh restores the user
 * exactly where they left off — independent of explicit saved views.
 *
 * Keyed per pipeline so each pipeline keeps its own remembered state.
 */
export function useDealsLastViewState(pipelineId: string | null | undefined) {
  const key = `deals_last_view_state:${pipelineId ?? 'all'}`;
  return useUiPreference<DealViewConfig | null>(key, null);
}