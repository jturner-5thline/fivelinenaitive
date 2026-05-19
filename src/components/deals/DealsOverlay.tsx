import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { PipelineTab } from '@/components/dashboard/DailyBriefingModal';

interface DealsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Error boundary so a thrown error inside the Deals tree renders a
 *  readable fallback inside the popup instead of leaving it blank. */
class DealsErrorBoundary extends React.Component<
  { onReset: () => void; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[DealsOverlay] render error', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-foreground">Couldn't load Deals</p>
          <p className="max-w-md text-xs text-muted-foreground">
            {this.state.error.message || 'An unexpected error occurred while rendering the Deals view.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Standalone modal that mounts the real `/deals` page component (same
 * providers, hooks, contexts, and side effects) inside an overlay. Used as
 * the "Deal Rundown" shortcut from Daily Rundown so the popup shows the
 * identical Deals view without navigating away.
 */
export function DealsOverlay({ open, onOpenChange }: DealsOverlayProps) {
  const navigate = useNavigate();
  // Force the shared Deals tab to remount each time the overlay opens so
  // its queries and state initialize from scratch — identical behavior to
  // the Daily Rundown Deals tab.
  const [mountKey, setMountKey] = React.useState(0);
  React.useEffect(() => {
    if (open) setMountKey((k) => k + 1);
  }, [open]);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open || typeof document === 'undefined') return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deals"
      className="fixed inset-0 z-[2000] flex items-center justify-center animate-in fade-in duration-150"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative z-10 w-[96vw] h-[94vh] rounded-2xl overflow-hidden border border-border bg-background shadow-2xl flex flex-col"
        style={{ transform: 'none', filter: 'none', backdropFilter: 'none', willChange: 'auto' }}
      >
        <div className="absolute top-2 right-2 z-20">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close Deals"
            onClick={() => onOpenChange(false)}
            className="h-9 w-9 rounded-full bg-background/80 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-background">
          <DealsErrorBoundary onReset={() => setMountKey((k) => k + 1)}>
            <React.Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center p-8 text-sm text-muted-foreground">
                  Loading Deals…
                </div>
              }
            >
              {/* Render the EXACT same component used by the Daily Rundown
                  Deals tab so both surfaces always stay in sync. No
                  overlay-only filters, padding, or background overrides. */}
              <PipelineTab
                key={mountKey}
                enabled={open}
                onNavigate={(path) => {
                  onOpenChange(false);
                  navigate(path);
                }}
              />
            </React.Suspense>
          </DealsErrorBoundary>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}