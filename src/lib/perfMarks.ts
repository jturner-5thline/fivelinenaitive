/**
 * Tiny dev-only perf instrumentation.
 *
 * Usage:
 *   perfMark('dashboard:mount-start');
 *   ...
 *   perfMeasure('dashboard:mount', 'dashboard:mount-start');
 *
 * In production builds we no-op so there's zero overhead. In dev these
 * show up as User Timing entries in the browser Performance panel and as
 * console logs (gated by localStorage flag `perf:debug`).
 */
const isDev = import.meta.env?.DEV === true;

function debugEnabled() {
  if (!isDev) return false;
  try {
    return localStorage.getItem('perf:debug') === '1';
  } catch {
    return false;
  }
}

export function perfMark(name: string) {
  if (!isDev) return;
  try {
    performance.mark(name);
  } catch {
    /* noop */
  }
}

export function perfMeasure(name: string, startMark: string, endMark?: string) {
  if (!isDev) return;
  try {
    if (endMark) performance.measure(name, startMark, endMark);
    else performance.measure(name, startMark);
    if (debugEnabled()) {
      const entries = performance.getEntriesByName(name, 'measure');
      const last = entries[entries.length - 1];
      if (last) {
        // eslint-disable-next-line no-console
        console.log(`[perf] ${name}: ${last.duration.toFixed(1)}ms`);
      }
    }
  } catch {
    /* noop — start mark may not exist yet */
  }
}