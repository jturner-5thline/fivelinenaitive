import { lazy, Suspense, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const DealDetail = lazy(() => import('@/pages/DealDetail'));

interface Props {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Near full-screen overlay rendering the canonical DealDetail page for a
 * given deal id. Uses the existing top-level app router by passing a
 * synthetic `location` to <Routes> — this lets DealDetail's useParams()
 * resolve the modal's deal id without nesting another <Router>.
 */
export function NaitiveDealDetailModal({ dealId, open, onOpenChange }: Props) {
  const syntheticLocation = useMemo(
    () =>
      dealId
        ? ({
            pathname: `/deal/${dealId}`,
            search: '',
            hash: '',
            state: null,
            key: `modal-${dealId}`,
          } as const)
        : null,
    [dealId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden border-border/60',
          'w-[calc(100vw-2rem)] sm:w-[calc(100vw-3rem)] max-w-[1600px]',
          'h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)]',
          'rounded-xl',
        )}
        aria-label="Deal details"
      >
        <DialogTitle className="sr-only">Deal details</DialogTitle>
        <DialogDescription className="sr-only">
          Full deal details for the selected pipeline deal.
        </DialogDescription>
        <div className="h-full w-full overflow-y-auto">
          {syntheticLocation && (
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
            >
              <Routes location={syntheticLocation}>
                <Route path="/deal/:id" element={<DealDetail />} />
              </Routes>
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
