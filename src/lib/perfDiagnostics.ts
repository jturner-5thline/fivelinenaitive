/**
 * Lightweight client-side perf diagnostics.
 *
 * Goals (see plan Phase 1):
 *  - Count active intervals/timeouts, event listeners, and Supabase Realtime
 *    channels so we can spot leaks ("number keeps climbing forever").
 *  - Observe long tasks (>50ms) so we can attribute jank to a route.
 *  - Sample JS heap (Chrome only) every minute while the tab is visible so
 *    we can detect memory growth over time.
 *  - Surface all of this in the Admin → Observability → Performance panel
 *    via `getPerfSnapshot()`.
 *
 * Designed to be safe in production: zero overhead until `initPerfDiagnostics`
 * is called, no monkey-patching of globals (those wrappers can themselves
 * cause perf issues and break third-party libs), and all sampling is
 * visibility-aware.
 */

export interface PerfLongTask {
  route: string;
  duration: number;
  startTime: number;
  ts: number;
}

export interface PerfMemorySample {
  ts: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  route: string;
}

export interface PerfRouteSample {
  route: string;
  visits: number;
  lastRenderMs: number;
  avgRenderMs: number;
  maxRenderMs: number;
}

export interface PerfSnapshot {
  startedAt: number;
  uptimeMs: number;
  currentRoute: string;
  counters: {
    realtimeChannels: number;
    visibilityAwareIntervals: number;
    longTasksTotal: number;
  };
  memory: {
    samples: PerfMemorySample[];
    latest: PerfMemorySample | null;
    growthMb: number; // last - first sample
  };
  longTasks: PerfLongTask[];
  routes: PerfRouteSample[];
  warnings: string[];
}

const STATE = {
  startedAt: 0,
  initialized: false,
  longTasks: [] as PerfLongTask[],
  memorySamples: [] as PerfMemorySample[],
  routes: new Map<string, { visits: number; lastRenderMs: number; totalMs: number; maxMs: number }>(),
  channels: 0,
  intervals: 0,
  memoryTimer: 0 as unknown as ReturnType<typeof setInterval> | 0,
};

const MAX_LONG_TASKS = 50;
const MAX_MEMORY_SAMPLES = 60; // ~60 min at 1/min

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname + window.location.search;
}

export function initPerfDiagnostics(): void {
  if (STATE.initialized || typeof window === 'undefined') return;
  STATE.initialized = true;
  STATE.startedAt = Date.now();

  // ── Long-task observer ────────────────────────────────────────────
  try {
    const PO = (window as any).PerformanceObserver;
    if (PO && PO.supportedEntryTypes?.includes('longtask')) {
      const obs = new PO((list: any) => {
        const entries = list.getEntries();
        for (const e of entries) {
          STATE.longTasks.push({
            route: currentRoute(),
            duration: e.duration,
            startTime: e.startTime,
            ts: Date.now(),
          });
          if (STATE.longTasks.length > MAX_LONG_TASKS) STATE.longTasks.shift();
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
    }
  } catch { /* noop */ }

  // ── Memory sampler (Chrome only) ──────────────────────────────────
  const sample = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const mem = (performance as any).memory;
    if (!mem) return;
    STATE.memorySamples.push({
      ts: Date.now(),
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      route: currentRoute(),
    });
    if (STATE.memorySamples.length > MAX_MEMORY_SAMPLES) STATE.memorySamples.shift();
  };
  sample();
  STATE.memoryTimer = setInterval(sample, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sample();
  });
}

// ── Counters (called from helpers) ──────────────────────────────────

export function incRealtimeChannels(): void { STATE.channels++; }
export function decRealtimeChannels(): void { STATE.channels = Math.max(0, STATE.channels - 1); }
export function incVisibilityAwareIntervals(): void { STATE.intervals++; }
export function decVisibilityAwareIntervals(): void { STATE.intervals = Math.max(0, STATE.intervals - 1); }

// ── Route render timing ─────────────────────────────────────────────

export function recordRouteRender(route: string, ms: number): void {
  const r = STATE.routes.get(route) ?? { visits: 0, lastRenderMs: 0, totalMs: 0, maxMs: 0 };
  r.visits += 1;
  r.lastRenderMs = ms;
  r.totalMs += ms;
  r.maxMs = Math.max(r.maxMs, ms);
  STATE.routes.set(route, r);
}

// ── Snapshot ────────────────────────────────────────────────────────

export function getPerfSnapshot(): PerfSnapshot {
  const memSamples = STATE.memorySamples.slice();
  const first = memSamples[0];
  const last = memSamples[memSamples.length - 1];
  const growthMb = first && last ? (last.usedJSHeapSize - first.usedJSHeapSize) / (1024 * 1024) : 0;

  const routes: PerfRouteSample[] = Array.from(STATE.routes.entries()).map(([route, r]) => ({
    route,
    visits: r.visits,
    lastRenderMs: Math.round(r.lastRenderMs),
    avgRenderMs: Math.round(r.totalMs / Math.max(1, r.visits)),
    maxRenderMs: Math.round(r.maxMs),
  })).sort((a, b) => b.maxRenderMs - a.maxRenderMs);

  const warnings: string[] = [];
  if (STATE.channels > 15) warnings.push(`High Realtime channel count (${STATE.channels}). Possible subscription leak.`);
  if (growthMb > 50) warnings.push(`JS heap grew ${growthMb.toFixed(1)}MB since start. Possible memory leak.`);
  const recentLongTasks = STATE.longTasks.filter((t) => Date.now() - t.ts < 60_000);
  if (recentLongTasks.length > 10) warnings.push(`${recentLongTasks.length} long tasks in last minute — UI may feel janky.`);

  return {
    startedAt: STATE.startedAt,
    uptimeMs: Date.now() - STATE.startedAt,
    currentRoute: currentRoute(),
    counters: {
      realtimeChannels: STATE.channels,
      visibilityAwareIntervals: STATE.intervals,
      longTasksTotal: STATE.longTasks.length,
    },
    memory: { samples: memSamples, latest: last ?? null, growthMb },
    longTasks: STATE.longTasks.slice().reverse(),
    routes,
    warnings,
  };
}

// Expose for ad-hoc devtools poking: `__naitivePerf()` in console.
if (typeof window !== 'undefined') {
  (window as any).__naitivePerf = getPerfSnapshot;
}