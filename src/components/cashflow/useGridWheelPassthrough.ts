import { useEffect, useRef } from 'react';

/**
 * Attaches non-passive wheel listeners to a table card and any overflow descendants.
 * Vertical wheel events are forwarded to the page; horizontal ones scroll naturally.
 */
export function useGridWheelPassthrough<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const isOverflowContainer = (element: HTMLElement) => {
      const styles = window.getComputedStyle(element);
      return [styles.overflow, styles.overflowX, styles.overflowY].some(
        (value) => value === 'auto' || value === 'scroll' || value === 'hidden' || value === 'clip'
      );
    };

    const targets = Array.from(
      new Set([
        root,
        ...Array.from(root.querySelectorAll<HTMLElement>('*')).filter(isOverflowContainer),
      ])
    );

    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        e.stopPropagation();
        window.scrollBy(0, e.deltaY);
      }
    };

    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true };

    targets.forEach((target) => target.addEventListener('wheel', handler, listenerOptions));

    return () => {
      targets.forEach((target) => target.removeEventListener('wheel', handler, listenerOptions));
    };
  }, []);

  return ref;
}