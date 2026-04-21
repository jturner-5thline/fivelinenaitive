import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Full-page skeleton for the Insights route. Mirrors the structure of the
 * real dashboard (header → stat cards → chart widgets) so the layout doesn't
 * jump when data finishes loading.
 */
export function InsightsLoadingSkeleton() {
  return (
    <div className="bg-transparent">
      <div
        className="container mx-auto py-6 px-4 space-y-6"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Header skeleton */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-5 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border border-border rounded-lg p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Chart widgets skeleton */}
        <div className="grid lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="border border-border rounded-lg p-4 space-y-3"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-[220px] w-full rounded-md" />
            </div>
          ))}
        </div>

        <span className="sr-only">Loading insights…</span>
      </div>
    </div>
  );
}

/**
 * Error state for the Insights route. Surfaces the error message and a
 * Retry button that re-runs the underlying query.
 */
export function InsightsErrorState({
  error,
  onRetry,
  isRetrying,
}: {
  error: Error | null;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div className="bg-transparent">
      <div className="container mx-auto py-12 px-4">
        <div
          role="alert"
          className="max-w-md mx-auto border border-destructive/30 bg-destructive/5 rounded-lg p-6 text-center space-y-4"
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Couldn't load insights</h2>
            <p className="text-sm text-muted-foreground">
              {error?.message ||
                'Something went wrong while loading your dashboard data.'}
            </p>
          </div>
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-2"
          >
            <RefreshCw
              className={cn('h-4 w-4', isRetrying && 'animate-spin')}
            />
            {isRetrying ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      </div>
    </div>
  );
}
