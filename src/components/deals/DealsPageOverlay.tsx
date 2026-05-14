import { Suspense, lazy, Component, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Loader2 } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const DealsPage = lazy(() => import('@/pages/Deals'));

class DealsErrorBoundary extends Component<
  { children: ReactNode; onFallback: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onFallback();
  }
  render() {
    if (this.state.hasError) return <Navigate to="/deals" replace />;
    return this.props.children;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DealsPageOverlay({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-none w-[calc(100vw-32px)] h-[calc(100vh-32px)] sm:w-[calc(100vw-48px)] sm:h-[calc(100vh-48px)] rounded-2xl overflow-hidden border border-white/10 bg-background">
        <VisuallyHidden>
          <DialogTitle>Deals</DialogTitle>
        </VisuallyHidden>
        <div className="h-full w-full overflow-auto">
          <DealsErrorBoundary onFallback={() => onOpenChange(false)}>
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <DealsPage />
            </Suspense>
          </DealsErrorBoundary>
        </div>
      </DialogContent>
    </Dialog>
  );
}