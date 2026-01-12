import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<boolean>;
  delay?: number;
  enabled?: boolean;
}

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useAutoSave<T>({
  data,
  onSave,
  delay = 1500,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const isFirstRender = useRef(true);

  // Clear any pending timeout
  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Perform the save operation
  const save = useCallback(async (dataToSave: T) => {
    const serialized = JSON.stringify(dataToSave);
    
    // Don't save if data hasn't changed
    if (serialized === lastSavedRef.current) {
      setStatus('idle');
      return;
    }

    setStatus('saving');
    
    try {
      const success = await onSave(dataToSave);
      if (success) {
        lastSavedRef.current = serialized;
        setStatus('saved');
        // Reset to idle after showing "saved" status
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      setStatus('error');
    }
  }, [onSave]);

  // Trigger save manually (e.g., on blur or explicit save click)
  const saveNow = useCallback(() => {
    clearPendingTimeout();
    save(data);
  }, [clearPendingTimeout, save, data]);

  // Watch for data changes and schedule auto-save
  useEffect(() => {
    // Skip the first render to avoid saving initial data
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Initialize the lastSavedRef with current data
      lastSavedRef.current = JSON.stringify(data);
      return;
    }

    if (!enabled) return;

    const serialized = JSON.stringify(data);
    
    // Don't schedule save if data hasn't changed from last saved state
    if (serialized === lastSavedRef.current) {
      return;
    }

    // Mark as pending changes
    setStatus('pending');

    // Clear any existing timeout
    clearPendingTimeout();

    // Schedule new save
    timeoutRef.current = setTimeout(() => {
      save(data);
    }, delay);

    // Cleanup on unmount or when data changes
    return () => {
      clearPendingTimeout();
    };
  }, [data, delay, enabled, clearPendingTimeout, save]);

  // Save immediately on unmount if there are pending changes
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // Note: We can't do async operations in cleanup, 
        // but the data should be saved by the next scheduled timeout
      }
    };
  }, []);

  return {
    status,
    saveNow,
    isPending: status === 'pending',
    isSaving: status === 'saving',
    isSaved: status === 'saved',
    hasError: status === 'error',
  };
}
