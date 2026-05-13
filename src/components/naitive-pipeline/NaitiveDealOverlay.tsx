import { useEffect, useMemo, useRef, useState } from 'react';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Currently open deal. Null when overlay is closed. */
  deal: Deal | null;
  /** Flat ordered list used for prev/next traversal (column-by-column, top-to-bottom). */
  orderedDeals: Deal[];
  stages: DealStageOption[];
  onClose: () => void;
  onNavigate: (deal: Deal) => void;
  onStageChange: (dealId: string, newStage: string) => void;
}

/**
 * Focused content-canvas overlay rendering the deal detail route inside an
 * iframe. Chrome (header / footer / sidebar) is intentionally stripped — the
 * iframe is loaded with `?embedded=1` so the inner app shell suppresses its
 * sidebar too. Keyboard ←/→ still navigates between deals; Esc closes.
 */
export function NaitiveDealOverlay({ deal, orderedDeals, stages, onClose, onNavigate, onStageChange }: Props) {
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Forward Esc from inside the iframe to the parent so the overlay closes
  // even when focus is within the embedded deal page.
  const attachIframeEscListener = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      });
    } catch {
      // Cross-origin — ignore.
    }
  };

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(m.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    m.addEventListener?.('change', handler);
    return () => m.removeEventListener?.('change', handler);
  }, []);

  const idx = useMemo(
    () => (deal ? orderedDeals.findIndex(d => d.id === deal.id) : -1),
    [deal, orderedDeals],
  );
  const prevDeal = idx > 0 ? orderedDeals[idx - 1] : null;
  const nextDeal = idx >= 0 && idx < orderedDeals.length - 1 ? orderedDeals[idx + 1] : null;

  const goPrev = () => {
    if (!prevDeal) return;
    setSlideDir('right');
    onNavigate(prevDeal);
    window.setTimeout(() => setSlideDir(null), 200);
  };
  const goNext = () => {
    if (!nextDeal) return;
    setSlideDir('left');
    onNavigate(nextDeal);
    window.setTimeout(() => setSlideDir(null), 200);
  };

  // Esc + arrow key navigation. Skip when focus is in an editable element
  // inside the overlay so typing still works inside DealDetail.
  useEffect(() => {
    if (!deal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable) return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal?.id, prevDeal?.id, nextDeal?.id]);

  if (!deal) return null;

  const slideClass = reduceMotion || !slideDir ? '' : 'animate-fade-in';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Deal details for ${deal.company || 'deal'}`}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-black/55 backdrop-blur-sm',
          reduceMotion ? '' : 'animate-fade-in',
        )}
        onClick={onClose}
      />

      {/* Panel — single-column content canvas, no header / footer / sidebar */}
      <div
        className={cn(
          'relative w-[95vw] h-[92vh] rounded-xl border border-white/10 bg-background shadow-2xl overflow-hidden',
          reduceMotion ? '' : 'animate-scale-in',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating close — preserves close behavior without adding header chrome */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-background/70 backdrop-blur hover:bg-background"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Body — embeds the existing deal detail page so every tab/feature
            (Deal Info, Deal Space, Lenders, Management, Write Up, Data Room…)
            stays identical to the standalone /deal/:id route. */}
        <div className={cn('relative h-full w-full bg-background', slideClass)}>
          <iframe
            key={deal.id}
            ref={iframeRef}
            src={`/deal/${deal.id}?embedded=1`}
            title={`Deal ${deal.company || deal.id}`}
            className="absolute inset-0 h-full w-full border-0"
            onLoad={attachIframeEscListener}
          />
        </div>
      </div>
    </div>
  );
}