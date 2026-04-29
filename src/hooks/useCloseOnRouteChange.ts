import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Router-level safety net for dashboard quick-action dropdowns / widget panels.
 *
 * When `isOpen` is true and the router pathname changes, calls `close()` once
 * synchronously. This guarantees that any dropdown / widget panel that fired
 * a navigation (directly or via a child link) tears itself down before the
 * destination route's first paint, preventing the "lingers open during
 * navigation" bug.
 *
 * Usage:
 *   useCloseOnRouteChange(isOpen, close);
 *
 * Notes:
 *  - Only the *change* in pathname triggers the close — the initial mount
 *    does NOT close the panel even if it is already open.
 *  - Works for keyboard-activated navigation (Enter/Space) identically to
 *    mouse clicks because both eventually update `location.pathname`.
 */
export function useCloseOnRouteChange(isOpen: boolean, close: () => void): void {
  const { pathname } = useLocation();
  const lastPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      if (isOpen) close();
    }
    // We deliberately depend on pathname only; `isOpen`/`close` are read
    // from the latest closure but should not re-arm the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}