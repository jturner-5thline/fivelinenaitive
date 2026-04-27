import * as React from "react";

/**
 * Declares the height of a global, persistent top bar that lives ABOVE the
 * scrollable `<main>` container in `AppLayout` (or that overlays the top of
 * `<main>` with `position: fixed`).
 *
 * Mounting this component sets the CSS variable `--app-top-bar-height` on
 * `:root`, which `<StickyDashboardHeader>` reads to compute its sticky
 * `top` offset. This guarantees that the pinned dashboard header is never
 * hidden behind the global navigation, on every dashboard route, with no
 * per-page changes.
 *
 * The value is **stacked**: multiple top bars (e.g. an announcement banner
 * + the main nav) can each register their height. The total is the sum.
 *
 * Usage:
 *   function GlobalTopBar() {
 *     return (
 *       <>
 *         <AppTopBarOffset height={56} />
 *         <header className="fixed top-0 inset-x-0 h-14 ...">…</header>
 *       </>
 *     );
 *   }
 *
 * The component renders nothing.
 */

const CSS_VAR = "--app-top-bar-height";

/** Live registry of contributing heights, keyed by a stable id. */
const registry = new Map<symbol, number>();

function recompute() {
  let total = 0;
  registry.forEach((h) => {
    total += h;
  });
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(CSS_VAR, `${total}px`);
}

export interface AppTopBarOffsetProps {
  /** Height of the top bar in pixels. */
  height: number;
}

export function AppTopBarOffset({ height }: AppTopBarOffsetProps) {
  React.useEffect(() => {
    const id = Symbol("app-top-bar-offset");
    registry.set(id, Math.max(0, Math.round(height)));
    recompute();
    return () => {
      registry.delete(id);
      recompute();
    };
  }, [height]);

  return null;
}