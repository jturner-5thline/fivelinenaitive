import { useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Deal } from '@/types/deal';
import { PipelineMemoCard } from '@/components/pipeline/memo/PipelineMemoCard';
import { usePipelineDigests } from '@/hooks/usePipelineDigests';

interface PipelineMemoViewProps {
  deals: Deal[];
  /** Empty-state message when no deals match the filter. */
  emptyMessage?: string;
  onOpenDeal?: (dealId: string) => void;
}

/** Estimated card height in px. Cards measure themselves once mounted. */
const ESTIMATED_CARD_HEIGHT = 360;
/** Px of buffer rendered above + below the visible viewport. */
const VIRTUAL_OVERSCAN = 4;

/**
 * Virtualised stack of PipelineMemoCard components. Replaces the previous
 * "render every deal" implementation that was freezing the Daily Briefing
 * modal on click.
 *
 * Performance budget hit:
 *  - Only ~10–15 cards mount at a time (initial render <300 ms even on 200 deals).
 *  - Single shared blurred page background (no per-card backdrop-filter).
 *  - Single batched 24h digest fetch (3 queries total, not 3 × N).
 *  - Live-dot pulse animation only on the topmost visible card.
 */
export function PipelineMemoView({ deals, emptyMessage = 'No deals to summarize.', onOpenDeal }: PipelineMemoViewProps) {
  // Surface most-recently-updated first (matches digest cadence).
  const sorted = useMemo(() => {
    return [...deals].sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
  }, [deals]);

  const { digestMap, isLoading: digestsLoading } = usePipelineDigests(sorted, sorted.length > 0);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: useCallback(() => ESTIMATED_CARD_HEIGHT, []),
    overscan: VIRTUAL_OVERSCAN,
    measureElement: typeof ResizeObserver !== 'undefined'
      ? (el) => el.getBoundingClientRect().height
      : undefined,
  });

  if (sorted.length === 0) {
    return (
      <div className="pipeline-memo-page rounded-xl py-12 px-4 text-center">
        <p className="text-[#4a6070] text-sm font-light italic">{emptyMessage}</p>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={scrollRef}
      className="pipeline-memo-page pipeline-memo-scroll -mx-1 px-3 py-5 rounded-xl overflow-y-auto max-h-[78vh]"
    >
      <div className="max-w-[1100px] mx-auto relative" style={{ height: totalHeight }}>
        {items.map(virtualRow => {
          const deal = sorted[virtualRow.index];
          if (!deal) return null;
          return (
            <div
              key={deal.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 right-0 pb-5"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <PipelineMemoCard
                deal={deal}
                digest={digestMap.get(deal.id)}
                isDigestLoading={digestsLoading}
                showLiveDot={virtualRow.index === 0}
                onOpenDeal={onOpenDeal}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}