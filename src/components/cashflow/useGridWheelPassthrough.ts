import { useEffect, useRef } from 'react';

/**
 * Attaches a non-passive wheel listener to an overflow-x container.
 * Vertical wheel events are forwarded to the page; horizontal ones scroll the container.
 */
export function useGridWheelPassthrough<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      // If primarily vertical scroll, forward to page
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        window.scrollBy(0, e.deltaY);
      }
      // Horizontal scroll is handled naturally by the container
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return ref;
}