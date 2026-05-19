import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DealsPage = React.lazy(() => import('@/pages/Deals'));

interface DealsOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Standalone modal that hosts the full /deals view inside an iframe.
 * Loaded with `?embedded=1` so AppLayout strips its chrome (sidebar,
 * header, banners) and the iframe renders only the Deals page surface.
 * Independent from the Daily Rundown briefing modal — this is purely a
 * shortcut to the Deals tab content without leaving the current route.
 */
export function DealsOverlay({ open, onOpenChange }: DealsOverlayProps) {
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
    // Flex/grid centering only — no transform: translate(-50%, -50%).
    // Opacity-only fade-in on the outer wrapper so no text-bearing
    // container ever animates scale.
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
      {/*
        Panel: no transform, no filter/backdrop-filter, no will-change,
        no scale animation. Solid background so subpixel text rendering
        stays crisp on every GPU.
      */}
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
          <React.Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading Deals…</div>}>
            <DealsPage />
          </React.Suspense>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}