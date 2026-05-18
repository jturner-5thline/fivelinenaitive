import { useCallback, useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface TriStateSortState {
  field: string | null;
  direction: SortDirection;
}

/**
 * Shared 3-state sort toggle hook.
 *
 * Clicking the same column cycles asc → desc → cleared.
 * Clicking a different column restarts at asc.
 *
 * When `direction` is null, the consumer must skip its sort step and
 * fall back to the dataset's default order — this preserves any active
 * filters/search/grouping/saved views since those live independently of
 * the sort state.
 */
export function useTriStateSort(initial?: { field?: string | null; direction?: SortDirection }) {
  const [state, setState] = useState<TriStateSortState>({
    field: initial?.field ?? null,
    direction: initial?.direction ?? null,
  });

  const handleSort = useCallback((field: string) => {
    setState(prev => {
      if (prev.field !== field) {
        return { field, direction: 'asc' };
      }
      // Same column: cycle asc → desc → cleared
      if (prev.direction === 'asc') return { field, direction: 'desc' };
      if (prev.direction === 'desc') return { field: null, direction: null };
      return { field, direction: 'asc' };
    });
  }, []);

  const clearSort = useCallback(() => setState({ field: null, direction: null }), []);

  return {
    sortField: state.field,
    sortDir: state.direction,
    handleSort,
    clearSort,
    isSorted: state.field !== null && state.direction !== null,
  };
}
