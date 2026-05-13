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
      const anchor = target.closest('a[href^="/deal/"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const id = parseDealIdFromHref(anchor.getAttribute('href'));
      if (!id) return;
      const r = anchor.getBoundingClientRect();
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