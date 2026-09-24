import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Progressive rendering for large lists: start with `step` items and grow
 * by `step` whenever the sentinel element scrolls near view. Resets when
 * `resetKey` changes (new sort / search / filter).
 */
export function useProgressiveCount(total: number, resetKey: unknown, step = 60) {
  const [count, setCount] = useState(step);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    setCount(step);
  }, [resetKey, step]);

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node) return;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setCount((c) => Math.min(total, c + step));
          }
        },
        { rootMargin: '800px 0px' },
      );
      obs.observe(node);
      observerRef.current = obs;
    },
    [total, step],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { count: Math.min(count, total), hasMore: count < total, sentinelRef };
}
