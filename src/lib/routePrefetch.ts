/**
 * Route chunk prefetcher.
 *
 * With every route already lazy-loaded via `React.lazy`, the first visit
 * to a page still pays a one-time chunk download. That's the dominant
 * cause of "navigating between pages feels slow" on otherwise warm caches.
 *
 * This module exposes:
 *   - `prefetchRoute(name)`  — kick off the dynamic import for a single
 *                              route. Vite dedupes, so calling this and
 *                              `React.lazy(() => import(...))` resolve to
 *                              the same module/promise.
 *   - `prefetchCommonRoutes()` — schedule prefetches for the routes users
 *                              hit most often, during browser idle time.
 *
 * The map below intentionally mirrors the imports in `src/App.tsx`. Vite's
 * static analyzer needs the literal `import('./...')` string to emit each
 * chunk, so we keep them inline rather than passing functions around.
 */

type Prefetcher = () => Promise<unknown>;

/**
 * Routes worth prefetching after first paint. Keep this list short — the
 * goal is to warm the top of the navigation funnel, not to defeat lazy
 * loading by eagerly downloading everything.
 */
const PREFETCHERS: Record<string, Prefetcher> = {
  deals: () => import("@/pages/Deals"),
  pipeline: () => import("@/pages/NaitivePipeline"),
  tasks: () => import("@/pages/Tasks"),
  finserv: () => import("@/pages/FinServ"),
  lenders: () => import("@/pages/Lenders"),
  finance: () => import("@/pages/Finance"),
  analytics: () => import("@/pages/Analytics"),
  reports: () => import("@/pages/Reports"),
  contacts: () => import("@/pages/Contacts"),
  crmCompanies: () => import("@/pages/CrmCompanies"),
  settings: () => import("@/pages/Settings"),
  workflows: () => import("@/pages/Workflows"),
  emailIntelligence: () => import("@/pages/EmailIntelligencePage"),
};

const fired = new Set<string>();

function fire(name: string, factory: Prefetcher): void {
  if (fired.has(name)) return;
  fired.add(name);
  // Swallow errors silently — prefetch is best-effort.
  factory().catch(() => {
    fired.delete(name);
  });
}

/**
 * Prefetch a single route's chunk by key. Safe to call from hover/focus
 * handlers — repeat calls are deduped.
 */
export function prefetchRoute(name: keyof typeof PREFETCHERS): void {
  const factory = PREFETCHERS[name];
  if (factory) fire(name, factory);
}

type IdleCb = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type IdleWindow = Window & {
  requestIdleCallback?: (cb: IdleCb, opts?: { timeout: number }) => number;
};

function scheduleIdle(cb: () => void, timeout = 2000): void {
  if (typeof window === "undefined") return;
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => cb(), { timeout });
  } else {
    setTimeout(cb, timeout);
  }
}

/**
 * Warm the most-used route chunks during browser idle time, staggered so
 * we don't saturate the network on slow connections.
 */
export function prefetchCommonRoutes(): void {
  const names = Object.keys(PREFETCHERS) as Array<keyof typeof PREFETCHERS>;
  names.forEach((name, idx) => {
    // Stagger by ~250ms each so the network has room for any in-flight
    // user-initiated requests on the current page.
    scheduleIdle(() => prefetchRoute(name), 1500 + idx * 250);
  });
}