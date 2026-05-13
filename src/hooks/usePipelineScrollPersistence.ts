import { useEffect, useRef } from 'react';

/**
 * Persist the pipeline board scroll position across deal-overlay open/close.
 *
 * The deal overlay mounts on top of the board (it doesn't unmount the board
 * tree), but route changes / re-renders triggered by `setSearchParams('deal=…')`
 * can occasionally reset Radix ScrollArea viewports back to 0,0 on iOS Safari
 * and after long-running renders. This hook snapshots scroll positions when
 * the overlay opens and restores them when it closes, so the kanban returns
 * to exactly where the user left it.
 *
 * It captures both:
 *   • window scroll (in case the page itself has scrolled), and
 *   • every `[data-radix-scroll-area-viewport]` inside the board container.
 */
export function usePipelineScrollPersistence(
  containerRef: React.RefObject<HTMLElement | null>,
  isOverlayOpen: boolean,
) {
  const snapshotRef = useRef<{
    windowX: number;
    windowY: number;
    viewports: Array<{ el: HTMLElement; left: number; top: number }>;
  } | null>(null);

  useEffect(() => {
    if (isOverlayOpen) {
      // Take snapshot when the overlay opens.
      const root = containerRef.current ?? document;
      const viewports = Array.from(
        root.querySelectorAll<HTMLElement>('[data-radix-scroll-area-viewport]'),
      ).map((el) => ({ el, left: el.scrollLeft, top: el.scrollTop }));
      snapshotRef.current = {
        windowX: window.scrollX,
        windowY: window.scrollY,
        viewports,
      };
      return;
    }

    // Overlay just closed — restore on the next two frames so layout has
    // settled (Radix re-measures after children mount).
    const snap = snapshotRef.current;
    if (!snap) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.scrollTo(snap.windowX, snap.windowY);
        snap.viewports.forEach(({ el, left, top }) => {
          if (!el.isConnected) return;
          el.scrollLeft = left;
          el.scrollTop = top;
        });
        snapshotRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [isOverlayOpen, containerRef]);
}