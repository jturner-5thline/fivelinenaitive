import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholder that mirrors the real DealCard surface (`.deal-glass`)
 * so the list keeps the same depth / contrast hierarchy while data loads.
 * Layout matches DealCard: stable top row (min-h-[60px]), notes block,
 * divider, and footer meta row.
 */
export function DealCardSkeleton() {
  return (
    <div className="deal-glass relative h-full flex flex-col min-w-0 max-w-full min-h-[200px] overflow-hidden">
      {/* Static placeholder — no shimmer sweep. The animated sweep made
          real tiles look like they were flickering when the loading
          skeleton briefly mounted during refetches. */}
      <div className="relative px-6 pt-5 pb-6 flex flex-col flex-1 gap-3.5">
        {/* Top row: title/value + status pills */}
        <div className="flex items-start justify-between gap-4 min-w-0 min-h-[60px]">
          <div className="flex-1 min-w-0 space-y-2 self-start">
            <Skeleton className="h-5 w-40 max-w-full bg-white/10" />
            <Skeleton className="h-6 w-24 bg-white/10" />
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
            <Skeleton className="h-5 w-28 rounded-full bg-white/10" />
          </div>
        </div>

        {/* Notes lines */}
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-full bg-white/10" />
          <Skeleton className="h-3.5 w-3/4 bg-white/10" />
        </div>

        <div className="mt-auto pt-3 border-t border-white/10">
          {/* Footer meta row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-4 rounded-full bg-white/10" />
              <Skeleton className="h-3.5 w-16 bg-white/10" />
            </div>
            <div className="flex-1 flex items-center gap-2 justify-center">
              <Skeleton className="h-5 w-16 rounded-md bg-white/10" />
              <Skeleton className="h-5 w-20 rounded-md bg-white/10" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-full bg-white/10" />
              <Skeleton className="h-3.5 w-20 bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
