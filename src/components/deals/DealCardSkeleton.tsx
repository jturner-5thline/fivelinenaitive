import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

export function DealCardSkeleton() {
  return (
    <Card className="overflow-hidden p-6 space-y-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1 min-w-0">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
      </div>

      {/* Notes */}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />

      <Separator className="opacity-30" />

      {/* Bottom row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex-1 flex items-center gap-2 justify-center">
          <Skeleton className="h-5 w-16 rounded-lg" />
          <Skeleton className="h-5 w-20 rounded-lg" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </Card>
  );
}
