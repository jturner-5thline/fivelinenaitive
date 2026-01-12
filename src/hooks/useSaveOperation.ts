import { useState, useCallback } from 'react';

/**
 * Hook to track async save operations with loading state
 * Returns a wrapper function that tracks loading state during async operations
 */
export function useSaveOperation() {
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const startSaving = useCallback((id: string) => {
    setSavingIds(prev => new Set(prev).add(id));
  }, []);

  const stopSaving = useCallback((id: string) => {
    setSavingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const isSaving = useCallback((id: string) => {
    return savingIds.has(id);
  }, [savingIds]);

  const isAnySaving = savingIds.size > 0;

  /**
   * Wrap an async operation with loading tracking
   * @param id - Unique identifier for the operation
   * @param operation - Async function to execute
   * @param minDuration - Minimum duration to show loading (prevents flash)
   */
  const withSaving = useCallback(async <T>(
    id: string,
    operation: () => Promise<T>,
    minDuration: number = 300
  ): Promise<T | undefined> => {
    startSaving(id);
    const startTime = Date.now();
    
    try {
      const result = await operation();
      
      // Ensure minimum duration to prevent loading flash
      const elapsed = Date.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }
      
      return result;
    } finally {
      stopSaving(id);
    }
  }, [startSaving, stopSaving]);

  /**
   * Fire-and-forget version that doesn't block but still shows loading
   */
  const withSavingAsync = useCallback((
    id: string,
    operation: () => Promise<void>,
    minDuration: number = 300
  ) => {
    startSaving(id);
    const startTime = Date.now();
    
    operation()
      .finally(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minDuration - elapsed);
        setTimeout(() => stopSaving(id), remaining);
      });
  }, [startSaving, stopSaving]);

  return {
    savingIds,
    isSaving,
    isAnySaving,
    startSaving,
    stopSaving,
    withSaving,
    withSavingAsync,
  };
}
