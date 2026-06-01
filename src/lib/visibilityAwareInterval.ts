/**
 * Shared visibility-aware polling primitive.
 *
 * Wraps `setInterval` so that:
 *  - Ticks are skipped while `document.visibilityState === 'hidden'`.
 *  - The callback re-fires immediately when the tab becomes visible again,
 *    closing the gap users notice when returning to the app.
 *
 * Used to coordinate background polls (inbox sync, deal notification counts,
 * email intelligence sync, calendar refresh, etc.) so a long-lived
 * backgrounded tab does not pile up request storms or starve the main
 * thread when the user returns. The previous behavior — every poll firing
 * on its own raw `setInterval` regardless of focus — was a likely
 * contributor to compounding slowdown over multi-hour sessions.
 */
export function startVisibilityAwareInterval(
  callback: () => void,
  intervalMs: number,
  options?: {
    /** Fire the callback once on visibility regain even if no interval is due. Default: true. */
    refreshOnVisible?: boolean;
  },
): () => void {
  const refreshOnVisible = options?.refreshOnVisible !== false;

  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try { callback(); } catch { /* swallow — polling should never crash callers */ }
  };

  const interval = setInterval(tick, intervalMs);

  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible' && refreshOnVisible) {
      try { callback(); } catch { /* noop */ }
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    clearInterval(interval);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}