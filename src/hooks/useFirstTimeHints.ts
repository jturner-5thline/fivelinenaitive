import { useState, useEffect, useCallback, useMemo } from 'react';

const HINTS_STORAGE_KEY = 'dismissed-hints';

export type HintId = 
  | 'new-deal-button'
  | 'filters'
  | 'analytics-nav'
  | 'settings-menu'
  | 'deal-card'
  | 'widgets-section';

// Priority order for hints - only the first non-dismissed hint will be shown
const HINT_PRIORITY: HintId[] = [
  'new-deal-button',
  'deal-card',
  'filters',
  'widgets-section',
  'analytics-nav',
  'settings-menu',
];

interface UseFirstTimeHintsReturn {
  isHintVisible: (id: HintId) => boolean;
  dismissHint: (id: HintId) => void;
  dismissAllHints: () => void;
  resetHints: () => void;
  isFirstTimeUser: boolean;
}

export function useFirstTimeHints(): UseFirstTimeHintsReturn {
  const [dismissedHints, setDismissedHints] = useState<Set<HintId>>(new Set());
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);

  useEffect(() => {
    // Check if user has completed the tour (indicates they're a new user who needs hints)
    const tourCompleted = localStorage.getItem('tour-completed');
    const hintsFullyDismissed = localStorage.getItem('hints-fully-dismissed');
    
    // Show hints only if tour was completed and hints haven't been fully dismissed
    setIsFirstTimeUser(tourCompleted === 'true' && hintsFullyDismissed !== 'true');

    // Load dismissed hints from storage
    const stored = localStorage.getItem(HINTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as HintId[];
        setDismissedHints(new Set(parsed));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Find the first hint in priority order that hasn't been dismissed
  const activeHint = useMemo((): HintId | null => {
    if (!isFirstTimeUser) return null;
    return HINT_PRIORITY.find(id => !dismissedHints.has(id)) || null;
  }, [isFirstTimeUser, dismissedHints]);

  const isHintVisible = useCallback((id: HintId): boolean => {
    // Only show this hint if it's the active (highest priority non-dismissed) hint
    return activeHint === id;
  }, [activeHint]);

  const dismissHint = useCallback((id: HintId) => {
    setDismissedHints(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const dismissAllHints = useCallback(() => {
    localStorage.setItem('hints-fully-dismissed', 'true');
    setIsFirstTimeUser(false);
  }, []);

  const resetHints = useCallback(() => {
    localStorage.removeItem(HINTS_STORAGE_KEY);
    localStorage.removeItem('hints-fully-dismissed');
    setDismissedHints(new Set());
    setIsFirstTimeUser(true);
  }, []);

  return {
    isHintVisible,
    dismissHint,
    dismissAllHints,
    resetHints,
    isFirstTimeUser,
  };
}
