import { useCallback, useEffect, useState } from 'react';

export type PipelineSortMode = 'newest' | 'value_desc' | 'value_asc' | 'name_asc';

export const PIPELINE_SORT_STORAGE_KEY = 'deals-pipeline-stage-sort';
export const PIPELINE_SORT_EVENT = 'deals-pipeline-stage-sort-change';

export const PIPELINE_SORT_LABELS: Record<PipelineSortMode, string> = {
  newest: 'Newest first',
  value_desc: 'Deal size: high to low',
  value_asc: 'Deal size: low to high',
  name_asc: 'Name: A to Z',
};

function readStored(): PipelineSortMode {
  if (typeof window === 'undefined') return 'newest';
  const saved = window.localStorage.getItem(PIPELINE_SORT_STORAGE_KEY);
  return (saved as PipelineSortMode) || 'newest';
}

/** Pipeline stage-column sort mode, shared across components via a window event. */
export function usePipelineSortMode() {
  const [sortMode, setSortModeState] = useState<PipelineSortMode>(readStored);

  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<PipelineSortMode>).detail;
      if (next) setSortModeState(next);
    };
    window.addEventListener(PIPELINE_SORT_EVENT, handler);
    return () => window.removeEventListener(PIPELINE_SORT_EVENT, handler);
  }, []);

  const setSortMode = useCallback((next: PipelineSortMode) => {
    setSortModeState(next);
    try {
      window.localStorage.setItem(PIPELINE_SORT_STORAGE_KEY, next);
    } catch {
      /* ignore quota / privacy-mode failures */
    }
    window.dispatchEvent(new CustomEvent(PIPELINE_SORT_EVENT, { detail: next }));
  }, []);

  return { sortMode, setSortMode };
}
