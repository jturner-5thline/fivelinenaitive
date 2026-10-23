import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Scroll container with the native scrollbar hidden. Shows a small, subtle
 * down-arrow at the bottom centre while more content is below.
 */
export function HiddenScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [update]);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        ref={ref}
        onScroll={update}
        className="h-full w-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll down"
        tabIndex={hasMore ? 0 : -1}
        onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.6, behavior: 'smooth' })}
        className={cn(
          'absolute bottom-1.5 left-1/2 -translate-x-1/2 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-opacity duration-200 hover:text-foreground',
          hasMore ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <ChevronDown className="h-4 w-4 animate-bounce [animation-duration:2s]" />
      </button>
    </div>
  );
}
