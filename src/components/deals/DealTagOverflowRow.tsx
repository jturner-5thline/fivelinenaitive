import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface DealTag {
  key: string;
  label: string;
  className: string;
  style?: React.CSSProperties;
}

const MORE_BADGE_CLASS =
  'text-[11px] font-medium rounded-md px-2 py-0.5 bg-white/[0.03] border-white/10 shrink-0';

/**
 * Single-line tag row. Tags never wrap under the deal amount — when they don't
 * fit, the overflow collapses into a "+N more" badge with a tooltip listing the
 * hidden tags.
 */
export function DealTagOverflowRow({ tags }: { tags: DealTag[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  const recompute = () => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const available = container.clientWidth;
    if (!available) return;
    const items = Array.from(measure.children) as HTMLElement[];
    // Last measured child is the "+N more" chip.
    const moreWidth = items.length > tags.length ? items[tags.length].offsetWidth : 0;
    const gap = 6; // gap-1.5

    let used = 0;
    let fit = 0;
    for (let i = 0; i < tags.length; i += 1) {
      const w = items[i]?.offsetWidth ?? 0;
      const next = used + (i === 0 ? 0 : gap) + w;
      if (next > available) break;
      used = next;
      fit += 1;
    }

    if (fit < tags.length) {
      // Make room for the "+N more" chip.
      while (fit > 0) {
        const withMore = used + gap + moreWidth;
        if (withMore <= available) break;
        const w = items[fit - 1]?.offsetWidth ?? 0;
        used -= w + (fit === 1 ? 0 : gap);
        fit -= 1;
      }
    }

    setVisibleCount(fit);
  };

  useLayoutEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags.map(t => t.label).join('|')]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags.map(t => t.label).join('|')]);

  if (tags.length === 0) return null;

  const hidden = tags.slice(visibleCount);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
      {/* Hidden measurement row — natural widths for every tag + the more chip. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex items-center gap-1.5 opacity-0"
        style={{ visibility: 'hidden' }}
      >
        {tags.map(tag => (
          <Badge key={tag.key} variant="outline" className={tag.className} style={tag.style}>
            {tag.label}
          </Badge>
        ))}
        <Badge variant="outline" className={MORE_BADGE_CLASS}>
          +{tags.length} more
        </Badge>
      </div>

      {tags.slice(0, visibleCount).map(tag => (
        <Badge key={tag.key} variant="outline" className={tag.className} style={tag.style}>
          {tag.label}
        </Badge>
      ))}

      {hidden.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={MORE_BADGE_CLASS}
                style={{ color: 'rgba(222, 234, 250, 0.92)' }}
              >
                +{hidden.length} more
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              {hidden.map(t => t.label).join(', ')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
