import { DealCardSkeleton } from './DealCardSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

interface DealsListSkeletonProps {
  groupByStatus?: boolean;
}

export function DealsListSkeleton({ groupByStatus = true }: DealsListSkeletonProps) {
  if (!groupByStatus) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <DealCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Show skeleton groups
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, groupIndex) => (
        <div key={groupIndex} className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-8" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(groupIndex === 0 ? 3 : 2)].map((_, i) => (
              <DealCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
