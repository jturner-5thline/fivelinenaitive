import { useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWidgetCarouselStore } from '@/stores/widgetCarouselStore';

/**
 * Persistent chrome overlay for the widget carousel.
 *
 * Renders fixed left/right arrow buttons and a small position indicator
 * (e.g. "2 / 5") that stay visible regardless of which underlying widget
 * dialog is mounted. Also wires:
 *   - Esc/← /→ keyboard navigation
 *   - Body scroll lock while open
 *   - Swipe-left/right gestures on touch devices
 *
 * The active widget content itself is rendered by Dashboard.tsx, which
 * mounts the existing per-widget Dialog with `open` driven by the store.
 * This component intentionally renders no content of its own beyond the
 * floating navigation chrome so the underlying widget dialogs can keep
 * their existing styling.
 */
export function WidgetCarouselChrome() {
  const isOpen = useWidgetCarouselStore((s) => s.isOpen);
  const activeIndex = useWidgetCarouselStore((s) => s.activeIndex);
  const order = useWidgetCarouselStore((s) => s.order);
  const next = useWidgetCarouselStore((s) => s.next);
  const prev = useWidgetCarouselStore((s) => s.prev);
  const close = useWidgetCarouselStore((s) => s.close);

  const total = order.length;
  const active = order[activeIndex];
  const disablePrev = activeIndex <= 0;
  const disableNext = activeIndex >= total - 1;

  // Body scroll lock while a carousel widget is open. The underlying
  // Radix Dialog already adds its own lock, but we add a defensive layer
  // in case a widget dialog is replaced mid-flight.
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Keyboard navigation: ←/→ for prev/next, Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in an input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
      // Esc is already handled by Radix Dialog.
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, next, prev]);

  // Swipe handlers (touch devices). We attach to a transparent edge
  // overlay so we don't interfere with scroll/inputs inside widget bodies.
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = touchStartX.current;
      const startY = touchStartY.current;
      touchStartX.current = null;
      touchStartY.current = null;
      if (startX == null || startY == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Require a clearly horizontal swipe of at least 60px.
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) next();
      else prev();
    },
    [next, prev],
  );

  if (!isOpen || total === 0 || !active) return null;

  return (
    <div
      // Sits above the Radix dialog overlay (z-50) but below typical toasts.
      className="pointer-events-none fixed inset-0 z-[60]"
      aria-hidden={false}
    >
      {/* Left swipe edge (mobile only) */}
      <div
        className="pointer-events-auto absolute left-0 top-0 h-full w-12 sm:hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-hidden="true"
      />
      {/* Right swipe edge (mobile only) */}
      <div
        className="pointer-events-auto absolute right-0 top-0 h-full w-12 sm:hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-hidden="true"
      />

      {/* Top-center label + position indicator */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 sm:top-4">
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5',
            'bg-background/40 backdrop-blur-2xl border border-white/[0.08]',
            'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]',
            'animate-fade-in',
          )}
        >
          <span className="text-xs font-medium text-foreground/90">{active.label}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {activeIndex + 1} / {total}
          </span>
        </div>
      </div>

      {/* Previous arrow */}
      <button
        type="button"
        onClick={prev}
        disabled={disablePrev}
        aria-label="Previous widget"
        className={cn(
          'pointer-events-auto absolute left-2 top-1/2 -translate-y-1/2 sm:left-4',
          'flex h-12 w-12 items-center justify-center rounded-full',
          'bg-background/40 backdrop-blur-2xl border border-white/[0.08]',
          'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]',
          'transition-all duration-200 hover:bg-background/60 hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-background/40',
        )}
      >
        <ChevronLeft className="h-6 w-6 text-foreground/90" />
      </button>

      {/* Next arrow */}
      <button
        type="button"
        onClick={next}
        disabled={disableNext}
        aria-label="Next widget"
        className={cn(
          'pointer-events-auto absolute right-2 top-1/2 -translate-y-1/2 sm:right-4',
          'flex h-12 w-12 items-center justify-center rounded-full',
          'bg-background/40 backdrop-blur-2xl border border-white/[0.08]',
          'shadow-[0_8px_32px_-12px_rgba(0,0,0,0.5)]',
          'transition-all duration-200 hover:bg-background/60 hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-background/40',
        )}
      >
        <ChevronRight className="h-6 w-6 text-foreground/90" />
      </button>
    </div>
  );
}