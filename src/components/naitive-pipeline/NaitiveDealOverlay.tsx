import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useResolvedPath } from 'react-router-dom';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  consumeDealOpenOriginRect,
  ensureDealOpenAnimationInstalled,
} from '@/lib/dealOpenAnimation';

// Lazy-load the (large) deal detail page so the overlay shell can paint
// before its chunk is parsed. Once loaded the chunk is cached for the
// session, so subsequent opens skip this cost entirely.
const DealDetail = lazy(() => import('@/pages/DealDetail'));

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
function NaitiveDealOverlayImpl({ deal, orderedDeals, stages, onClose, onNavigate, onStageChange }: Props) {
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Expand-from-tile animation state. When `originTransform` is set, the
  // panel renders pinned to the clicked tile's rect and then transitions
  // to its natural full-screen frame on the next frame. `contentVisible`
  // controls a slight delay before the inner deal content fades in over
  // the expanding shell — keeps the motion premium, not jittery.
  const [originTransform, setOriginTransform] = useState<string | null>(null);
  const [originBorderRadius, setOriginBorderRadius] = useState<number | null>(null);
  const [contentVisible, setContentVisible] = useState(false);
  const lastAnimatedDealId = useRef<string | null>(null);

  // Install the global click-rect capture once. Cheap: a single window
  // mousedown listener.
  useEffect(() => {
    ensureDealOpenAnimationInstalled();
  }, []);

  // The matched pathname of the parent route this overlay is rendered in
  // (e.g. "/deals" on the deals page, "/naitive-pipeline" on the pipeline
  // page). React Router requires any synthetic <Routes location> pathname
  // to start with this base, otherwise it throws an invariant.
  const parentBase = useResolvedPath('.').pathname.replace(/\/$/, '');

  // Focus trap: remember the previously-focused element, move focus into the
  // panel when the overlay opens, restore on close, and keep Tab cycling
  // between the close button and the iframe so keyboard users can't escape
  // the modal into the page behind it.
  useEffect(() => {
    if (!deal) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Defer to next tick so the panel is mounted.
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement as HTMLElement | null;
      const inPanel = !!active && panel.contains(active);
      // If focus escapes the panel, pull it back in. Tab cycling within
      // the panel is handled natively now that DealDetail renders inline.
      if (!inPanel) {
        e.preventDefault();
        closeBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onTrap, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onTrap, true);
      previouslyFocused?.focus?.();
    };
  }, [deal?.id]);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(m.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    m.addEventListener?.('change', handler);
    return () => m.removeEventListener?.('change', handler);
  }, []);

  // When the overlay opens for a new deal, attempt to read the rect of
  // the tile that was just clicked and pin the panel there for one frame
  // before releasing it to its full-screen position.
  useEffect(() => {
    if (!deal) {
      lastAnimatedDealId.current = null;
      setOriginTransform(null);
      setOriginBorderRadius(null);
      setContentVisible(false);
      return;
    }
    if (lastAnimatedDealId.current === deal.id) return;
    lastAnimatedDealId.current = deal.id;

    if (reduceMotion) {
      setOriginTransform(null);
      setOriginBorderRadius(null);
      setContentVisible(true);
      return;
    }

    const rect = consumeDealOpenOriginRect(deal.id);
    if (!rect) {
      setOriginTransform(null);
      setOriginBorderRadius(null);
      // Still defer the content fade slightly so the scale-in shell reads
      // as "container first, then content".
      setContentVisible(false);
      const t = window.setTimeout(() => setContentVisible(true), 120);
      return () => window.clearTimeout(t);
    }

    // Final panel frame mirrors the className: full screen below `sm`,
    // 8px inset above. Use viewport size to compute the resting box.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDesktop = vw >= 640;
    const finalLeft = isDesktop ? 8 : 0;
    const finalTop = isDesktop ? 8 : 0;
    const finalWidth = isDesktop ? vw - 16 : vw;
    const finalHeight = isDesktop ? vh - 16 : vh;

    const sx = Math.max(rect.width / finalWidth, 0.05);
    const sy = Math.max(rect.height / finalHeight, 0.05);
    const tx = rect.left - finalLeft;
    const ty = rect.top - finalTop;

    // Apply the starting transform synchronously, then release on the
    // next frame so the CSS transition interpolates back to identity.
    setOriginTransform(`translate3d(${tx}px, ${ty}px, 0) scale(${sx}, ${sy})`);
    setOriginBorderRadius(12);
    setContentVisible(false);

    let raf2 = 0;
    let revealTimeout = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setOriginTransform(null);
        setOriginBorderRadius(null);
      });
      // Reveal the inner content shortly after the shell starts expanding.
      revealTimeout = window.setTimeout(() => setContentVisible(true), 160);
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (revealTimeout) window.clearTimeout(revealTimeout);
    };
  }, [deal?.id, reduceMotion]);

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
      className="fixed inset-0 z-[100] flex items-center justify-center"
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

      {/* Panel — near full-screen canvas. Sits above all app chrome
          (sidebar / global header) via z-[100] on the wrapper. */}
      <div
        className={cn(
          'deal-popup-shell relative w-screen h-screen sm:w-[calc(100vw-1rem)] sm:h-[calc(100vh-1rem)] sm:rounded-xl overflow-hidden flex flex-col',
          // Only fall back to the generic scale-in when we have neither a
          // tile-origin transform nor reduced motion — the rect-driven
          // transform already provides the entrance animation.
          reduceMotion ? '' : !originTransform && lastAnimatedDealId.current !== deal.id ? 'animate-scale-in' : '',
        )}
        style={{
          transformOrigin: 'top left',
          transform: originTransform ?? undefined,
          borderRadius: originBorderRadius != null ? `${originBorderRadius}px` : undefined,
          transition: reduceMotion
            ? undefined
            : 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 360ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
          background:
            'radial-gradient(circle at 12% 10%, rgba(24,31,49,0.90) 0%, rgba(18,24,40,0.92) 32%, rgba(12,17,28,0.95) 66%, rgba(7,10,18,0.98) 100%)',
          backdropFilter: 'blur(18px) saturate(135%)',
          WebkitBackdropFilter: 'blur(18px) saturate(135%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow:
            '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)',
          animation: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
        tabIndex={-1}
      >
        {/* Soft top sheen — frosted-glass highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            borderRadius: 'inherit',
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 18%, rgba(255,255,255,0) 40%)',
          }}
        />
        {/* Floating close — preserves close behavior without adding header chrome */}
        <Button
          ref={closeBtnRef}
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-background/70 backdrop-blur hover:bg-background"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Body — render the deal detail page directly in the same React
            tree (was previously an iframe). This shares the parent app's
            QueryClient, DealsContext, StagesContext, etc., so:
              • the deal row already loaded by the kanban is reused with
                zero refetch (instant primary paint),
              • secondary react-query caches (activity, milestones, lenders…)
                persist across opens — reopening a recent deal is instant,
              • we don't pay for a second JS execution context / provider tree.
            An isolated MemoryRouter scopes useParams / useNavigate /
            useSearchParams to the modal so DealDetail's internal "back" /
            "delete" / tab navigation stays inside the overlay and never
            disturbs the parent URL. */}
        {/* `[&_header]:hidden` strips DealDetail's internal <DealsHeader>
            so the modal starts directly at the deal content area without
            duplicating app shell chrome. */}
        <div
          className={cn(
            'deal-popup-scroll relative flex-1 min-h-0 w-full bg-transparent overflow-y-auto overflow-x-hidden',
            slideClass,
          )}
          style={{
            opacity: reduceMotion ? 1 : contentVisible ? 1 : 0,
            transform: reduceMotion || contentVisible ? undefined : 'translateY(6px)',
            transition: reduceMotion
              ? undefined
              : 'opacity 220ms ease-out 60ms, transform 260ms cubic-bezier(0.22, 1, 0.36, 1) 60ms',
          }}
        >
          <Suspense fallback={<DealOverlayHydrating />}>
            {/* Render DealDetail using a synthetic location so `useParams`
                resolves to this deal id, while reusing the parent Router
                (React Router forbids nested <Router> instances). */}
            {/* Synthetic location must start with the parent's matched
                pathname base (e.g. "/deals" or "/naitive-pipeline") to
                satisfy React Router's invariant. We append the deal id so
                `useParams().id` resolves to it. The trailing `/__overlay`
                segment lets the overlay render even when the parent route
                itself is `/deals/:id` (a sibling route — would otherwise
                produce an ambiguous match). */}
            <Routes
              key={deal.id}
              location={{
                pathname: `${parentBase}/__overlay/${deal.id}`,
                search: '?embedded=1',
                hash: '',
                state: null,
                key: deal.id,
              }}
            >
              <Route path="__overlay/:id" element={<DealDetail />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/** Instant header summary using data already known to the parent so the
 *  user sees real deal info before DealDetail finishes mounting. Sits
 *  behind the lazy chunk and is hidden once DealDetail paints over it. */
function DealOverlaySummary({ deal }: { deal: Deal }) {
  // Hidden visually once DealDetail paints (it covers the full panel),
  // but rendered first so the very first frame after click is meaningful.
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 px-8 pt-6"
    >
      <div className="text-2xl font-semibold text-foreground/90 truncate">
        {deal.company || 'Deal'}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
        {deal.stage && <span className="rounded-full border border-white/10 px-2 py-0.5">{deal.stage}</span>}
        {deal.manager && <span>Owner: {deal.manager}</span>}
        {deal.value != null && <span>Value: {String(deal.value)}</span>}
      </div>
    </div>
  );
}

function DealOverlayHydrating() {
  return (
    <div className="absolute inset-0 z-0 flex items-start justify-center pt-32 text-xs text-muted-foreground">
      Loading deal…
    </div>
  );
}

// Memoize so unrelated parent re-renders (filter changes, kanban resorts)
// don't rebuild the overlay subtree or unmount the embedded DealDetail.
export const NaitiveDealOverlay = memo(NaitiveDealOverlayImpl);