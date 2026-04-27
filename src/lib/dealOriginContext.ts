/**
 * Shared back-navigation contract for the Deal Details page.
 *
 * When a user opens a deal from a dashboard drilldown (e.g. the Insights
 * "Signed Deals — Apr 2026" modal), we record where they came from so the
 * Deal Details page can render a clear "Back to {origin}" button that
 * returns them to the originating dashboard route AND re-opens the same
 * drilldown for the same timeframe.
 *
 * Contract:
 *   - The opener attaches a `DealOrigin` to `<Link state>` when navigating
 *     to `/deal/:id`.
 *   - DealDetail reads `useLocation().state.dealOrigin`, falls back to the
 *     last-seen origin in sessionStorage (so refresh preserves it), and
 *     renders a tailored back button.
 *   - When the user clicks "Back", DealDetail navigates to
 *     `origin.returnTo` and attaches `state.reopenDrilldown = origin.reopen`
 *     so the originating page can re-hydrate the drilldown UI.
 */

/** A drilldown to re-open on the originating page after returning. */
export interface DealOriginReopenDrilldown {
  /** Which dashboard widget owns the drilldown (consumers match on this). */
  source:
    | 'insights.signed-deals-and-ar'
    | 'insights.pipeline-metrics'
    | (string & { __brand?: 'DealOriginReopenSource' });
  /** Stable bucket key (e.g. "2026-04" or `${source}|${stage}`). */
  bucketKey: string;
  /** Human-readable bucket label, used in the drilldown title. */
  bucketLabel: string;
  /** Optional quarter id so the page can restore the timeframe selector. */
  quarterId?: string;
}

export interface DealOrigin {
  /** Short label for the back button — e.g. "Back to Signed Deals (Apr 2026)". */
  label: string;
  /** Path to navigate to when the user clicks "Back" — e.g. "/insights". */
  returnTo: string;
  /** Payload that lets the destination page re-open its drilldown. */
  reopen?: DealOriginReopenDrilldown;
}

/** Wrapped shape we use everywhere so other location.state keys can coexist. */
export interface DealOriginLocationState {
  dealOrigin?: DealOrigin;
}

/** Wrapped shape we read on the destination page after pressing "Back". */
export interface DealOriginReturnState {
  reopenDrilldown?: DealOriginReopenDrilldown;
}

const SESSION_KEY_PREFIX = 'deal-origin:';

/** Persist origin so a hard refresh on `/deal/:id` keeps the back button smart. */
export function persistDealOrigin(dealId: string, origin: DealOrigin): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY_PREFIX + dealId,
      JSON.stringify(origin),
    );
  } catch {
    /* sessionStorage may be unavailable (private mode, SSR) — silently skip */
  }
}

export function loadPersistedDealOrigin(dealId: string): DealOrigin | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + dealId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DealOrigin;
    if (!parsed || typeof parsed.returnTo !== 'string' || typeof parsed.label !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedDealOrigin(dealId: string): void {
  try {
    sessionStorage.removeItem(SESSION_KEY_PREFIX + dealId);
  } catch {
    /* ignore */
  }
}

/**
 * Single key the destination page reads from `sessionStorage` to know it
 * should re-open a drilldown on next mount. Used as a fallback path when
 * `location.state` is lost (e.g. after a hard refresh or full reload).
 */
export const PENDING_REOPEN_SESSION_KEY = 'deal-origin:pending-reopen';

export function pushPendingReopen(reopen: DealOriginReopenDrilldown): void {
  try {
    sessionStorage.setItem(PENDING_REOPEN_SESSION_KEY, JSON.stringify(reopen));
  } catch {
    /* ignore */
  }
}

export function consumePendingReopen(
  matches: (r: DealOriginReopenDrilldown) => boolean,
): DealOriginReopenDrilldown | null {
  try {
    const raw = sessionStorage.getItem(PENDING_REOPEN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DealOriginReopenDrilldown;
    if (!parsed || typeof parsed.source !== 'string') return null;
    if (!matches(parsed)) return null;
    sessionStorage.removeItem(PENDING_REOPEN_SESSION_KEY);
    return parsed;
  } catch {
    return null;
  }
}