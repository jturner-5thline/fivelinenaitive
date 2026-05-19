import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deals"
      className="fixed inset-0 z-[2000] flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="relative z-10 w-[96vw] h-[94vh] rounded-2xl overflow-hidden border border-border bg-background shadow-2xl flex flex-col"
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
        <iframe
          src="/deals?embedded=1"
          title="Deals"
          className="flex-1 w-full h-full border-0 bg-background"
        />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}