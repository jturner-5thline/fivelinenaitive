import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DashboardModalProps } from './DashboardModal';

type DashboardModalLazyHostProps = DashboardModalProps & {
  fallback?: ReactNode;
};

function createLazyDashboardModal() {
  return lazy(() => import('./DashboardModal'));
}

class DashboardChunkErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[DashboardModal] failed to load dashboard chunk', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center text-foreground">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-destructive/35 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Dashboard couldn’t load</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              The dashboard module was unavailable. Retry loading it without leaving this page.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function DashboardModalLazyHost({ fallback, ...props }: DashboardModalLazyHostProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const LazyDashboardModal = useMemo(createLazyDashboardModal, [retryNonce]);

  return (
    <DashboardChunkErrorBoundary onRetry={() => setRetryNonce((nonce) => nonce + 1)}>
      <Suspense fallback={fallback ?? null}>
        <LazyDashboardModal {...props} />
      </Suspense>
    </DashboardChunkErrorBoundary>
  );
}