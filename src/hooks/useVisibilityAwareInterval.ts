import { useEffect, useRef } from 'react';
import { startVisibilityAwareInterval } from '@/lib/visibilityAwareInterval';
import { incVisibilityAwareIntervals, decVisibilityAwareIntervals } from '@/lib/perfDiagnostics';

/**
 * React-hook wrapper around `startVisibilityAwareInterval`.
 *
 * - Skips ticks while the tab is hidden.
 * - Fires once on tab-visibility-regain (configurable).
 * - Always reads the latest callback via a ref, so callers don't need to
 *   wrap it in `useCallback` and don't re-arm the timer on every render.
 * - Pass `enabled = false` (or a falsy `intervalMs`) to suspend.
 *
 * Use this everywhere we previously called bare `setInterval` for polling,
 * relative-time tick re-renders, or recurring background syncs. The goal
 * is that opening the app in a background tab does NOT burn CPU.
 */
export function useVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number | null | false,
  options?: { enabled?: boolean; refreshOnVisible?: boolean },
): void {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; }, [callback]);

  const enabled = options?.enabled !== false;
  const refreshOnVisible = options?.refreshOnVisible !== false;

  useEffect(() => {
    if (!enabled || !intervalMs || intervalMs <= 0) return;
    incVisibilityAwareIntervals();
    const stop = startVisibilityAwareInterval(() => cbRef.current(), intervalMs, { refreshOnVisible });
    return () => {
      stop();
      decVisibilityAwareIntervals();
    };
  }, [enabled, intervalMs, refreshOnVisible]);
}