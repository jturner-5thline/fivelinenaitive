import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholders that mirror the real lender surfaces (`.deal-glass`)
 * so the directory keeps the same depth/contrast hierarchy as the Deals
 * page while data loads.
 */

export function LenderGridCardSkeleton() {
  return (
    <div className="deal-glass deal-tile relative p-3 flex flex-col h-full min-h-[180px] overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
      />
      <div className="relative flex flex-col flex-1 gap-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-28 bg-white/10" />
          <Skeleton className="h-5 w-10 rounded-md bg-white/10" />
        </div>
        <Skeleton className="h-3.5 w-3/4 bg-white/10" />
        <Skeleton className="h-3.5 w-1/2 bg-white/10" />
        <div className="mt-auto pt-3 border-t border-white/10 flex items-center gap-2">
          <Skeleton className="h-5 w-14 rounded-full bg-white/10" />
          <Skeleton className="h-5 w-16 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function LenderListCardSkeleton() {
  return (
    <div className="deal-glass deal-tile relative flex items-center gap-3 p-3 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
      />
      <Skeleton className="h-10 w-10 rounded-lg shrink-0 bg-white/10" />
      <div className="relative flex-1 min-w-0 space-y-2">
        <Skeleton className="h-4 w-48 max-w-full bg-white/10" />
        <Skeleton className="h-3.5 w-64 max-w-full bg-white/10" />
      </div>
      <div className="relative flex items-center gap-2 shrink-0">
        <Skeleton className="h-8 w-8 rounded-md bg-white/10" />
        <Skeleton className="h-8 w-8 rounded-md bg-white/10" />
      </div>
    </div>
  );
}

interface LendersListSkeletonProps {
  viewMode?: 'list' | 'grid' | 'spreadsheet';
  count?: number;
}

/**
 * Whole-list skeleton — chooses the right tile shape per view mode.
 * Mirrors `<DealsListSkeleton />` from the Deals page so both loading
 * states read as the same component family.
 */
export function LendersListSkeleton({
  viewMode = 'list',
  count = 6,
}: LendersListSkeletonProps) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: Math.max(count, 10) }).map((_, i) => (
          <LenderGridCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // List + spreadsheet both fall back to row-shaped skeletons.
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <LenderListCardSkeleton key={i} />
      ))}
    </div>
  );
}