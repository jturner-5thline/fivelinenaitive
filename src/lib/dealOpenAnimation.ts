/**
 * Captures the bounding rect of a clicked deal card so the deal overlay
 * can animate from the tile's exact position to the near full-screen
 * modal frame ("expand-from-tile" interaction).
 *
 * A single capture-phase mousedown listener resolves the nearest
 * `<a href="/deal/...">` ancestor of the click target — which is the
 * shared root of both <DealCard> and <NaitiveDealCard> — and records its
 * `getBoundingClientRect()` keyed by the deal id parsed out of the href.
 * The overlay then consumes that rect on open. Records older than ~1s
 * are ignored so a stale click never animates a deep-link open from a
 * meaningless point.
 */

type Rect = { left: number; top: number; width: number; height: number };

interface OriginRecord {
  id: string;
  rect: Rect;
  ts: number;
}

let lastOrigin: OriginRecord | null = null;
let installed = false;

const STALE_MS = 1000;

function parseDealIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = href.match(/\/deal\/([^/?#]+)/);
  return m?.[1] ?? null;
}

export function ensureDealOpenAnimationInstalled() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(
    'mousedown',
    (event) => {
      const target = event.target as Element | null;
      if (!target) return;
      // Prefer explicit opener marker so non-anchor click targets (table
      // rows, kanban rows, calendar pills, etc.) animate the same way as
      // <Link to="/deal/...">. Falls back to the legacy anchor capture so
      // existing card components keep working unchanged.
      const explicit = target.closest('[data-deal-open-id]') as HTMLElement | null;
      let id: string | null = null;
      let originEl: HTMLElement | null = null;
      if (explicit) {
        id = explicit.getAttribute('data-deal-open-id');
        originEl = explicit;
      } else {
        const anchor = target.closest('a[href^="/deal/"]') as HTMLAnchorElement | null;
        if (anchor) {
          id = parseDealIdFromHref(anchor.getAttribute('href'));
          originEl = anchor;
        }
      }
      if (!id || !originEl) return;
      const r = originEl.getBoundingClientRect();
      lastOrigin = {
        id,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        ts: Date.now(),
      };
    },
    true,
  );
}

/** Returns and clears the origin rect for `dealId` if it was just clicked. */
export function consumeDealOpenOriginRect(dealId: string): Rect | null {
  const o = lastOrigin;
  if (!o) return null;
  if (o.id !== dealId) return null;
  if (Date.now() - o.ts > STALE_MS) {
    lastOrigin = null;
    return null;
  }
  lastOrigin = null;
  return o.rect;
}

/**
 * Looks up the live bounding rect of the tile currently representing
 * `dealId` in the DOM. Used by the overlay's close animation to collapse
 * the panel back into the originating tile, even after the open-rect
 * record has been consumed.
 *
 * Resolution order matches the click-capture listener:
 *   1. `[data-deal-open-id="<id>"]` explicit opener marker
 *   2. `a[href^="/deal/<id>"]` legacy anchor
 *
 * Returns null when the tile isn't on screen (filtered out, scrolled
 * away, list view collapsed, etc.) so the caller can fall back to a
 * generic shrink-out animation instead of jumping to a stale point.
 */
export function findDealTileRect(dealId: string): Rect | null {
  if (typeof document === 'undefined') return null;
  const selector =
    `[data-deal-open-id="${CSS.escape(dealId)}"], a[href^="/deal/${CSS.escape(dealId)}"]`;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Ignore zero-size or off-screen elements (e.g. virtualized rows that
  // unmounted while the overlay was open).
  if (r.width <= 0 || r.height <= 0) return null;
  if (r.bottom < 0 || r.top > window.innerHeight) return null;
  if (r.right < 0 || r.left > window.innerWidth) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}