import { Suspense, lazy, memo, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useResolvedPath } from 'react-router-dom';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsUpDown, Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  consumeDealOpenOriginRect,
  ensureDealOpenAnimationInstalled,
  findDealTileRect,
} from '@/lib/dealOpenAnimation';
import { markOverlayJustClosed } from '@/lib/overlayClickSuppression';
import { loadDealDetail } from '@/lib/lazyDealDetail';

// Lazy-load the (large) deal detail page so the overlay shell can paint
// before its chunk is parsed. Shared loader (see lazyDealDetail.ts) so
// hover/idle preloaders, the /deal/:id route, and this overlay all share
// one in-flight promise and one emitted chunk.
const DealDetail = lazy(() => loadDealDetail());

/** Compact, enterprise-grade header nav button. 44px min hit area. */
const navButtonClass =
  'inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/15 bg-background/85 px-3 text-[13px] font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 whitespace-nowrap';

const segmentButtonClass =
  'inline-flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-40';

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
  // Carousel-style nav direction. 'next' = new deal slides in from the
  // right, 'prev' = from the left. Cleared after the slide settles.
  const [navDir, setNavDir] = useState<'prev' | 'next' | null>(null);
  const navDirRef = useRef<'prev' | 'next' | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  // Expand-from-tile animation state. When `originTransform` is set, the
  // panel renders pinned to the clicked tile's rect and then transitions
  // to its natural full-screen frame on the next frame. `contentVisible`
  // controls a slight delay before the inner deal content fades in over
  // the expanding shell — keeps the motion premium, not jittery.
  const [originTransform, setOriginTransform] = useState<string | null>(null);
  const [originBorderRadius, setOriginBorderRadius] = useState<number | null>(null);
  const [contentVisible, setContentVisible] = useState(false);
  const lastAnimatedDealId = useRef<string | null>(null);
  // Close animation state. While `isClosing` is true the panel collapses
  // back into the originating tile (or shrinks in place when the tile
  // isn't in the DOM anymore) before `onClose` is actually invoked.
  const [isClosing, setIsClosing] = useState(false);
  const closingDealIdRef = useRef<string | null>(null);

  // Animate the panel back into the tile, then call the parent's onClose.
  // Snappier than open (220ms vs 360ms) so dismissal feels crisp.
  const animateClose = () => {
    if (isClosing) return;
    markOverlayJustClosed(450);
    const id = deal?.id ?? null;
    closingDealIdRef.current = id;
    if (reduceMotion || !id) {
      onClose();
      return;
    }
    const rect = findDealTileRect(id);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDesktop = vw >= 640;
    const inset = isDesktop ? 24 : 0;
    const finalLeft = inset;
    const finalTop = inset;
    const finalWidth = vw - inset * 2;
    const finalHeight = vh - inset * 2;

    if (rect) {
      const sx = Math.max(rect.width / finalWidth, 0.05);
      const sy = Math.max(rect.height / finalHeight, 0.05);
      const tx = rect.left - finalLeft;
      const ty = rect.top - finalTop;
      setOriginTransform(`translate3d(${tx}px, ${ty}px, 0) scale(${sx}, ${sy})`);
      setOriginBorderRadius(16);
    } else {
      // No tile to land on — gently shrink in place toward the panel center.
      setOriginTransform('scale(0.94)');
      setOriginBorderRadius(20);
    }
    setContentVisible(false);
    setIsClosing(true);

    // Hard belt-and-suspenders against click-through: while the close
    // animation plays AND for a short buffer after the overlay unmounts,
    // swallow every pointerdown / mousedown / click at the document
    // capture phase. This guarantees the click on the X cannot reach the
    // page's "+ New Deal" button (or any other underlying control) even
    // if stacking contexts or portals would otherwise let it through.
    const swallow = (e: Event) => {
      e.stopPropagation();
      // Do NOT preventDefault on the originating click target chain
      // beyond stopping propagation — the X's own React handler has
      // already fired. Stopping propagation here only blocks *other*
      // listeners (Radix DialogTrigger uses pointerdown at capture).
      if ((e as PointerEvent).type !== 'click') {
        e.preventDefault();
      }
    };
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener('pointerdown', swallow, opts);
    document.addEventListener('mousedown', swallow, opts);
    document.addEventListener('click', swallow, opts);
    window.setTimeout(() => {
      document.removeEventListener('pointerdown', swallow, opts);
      document.removeEventListener('mousedown', swallow, opts);
      document.removeEventListener('click', swallow, opts);
      onClose();
    }, 240);
  };

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
      setIsClosing(false);
      closingDealIdRef.current = null;
      return;
    }
    // Re-opening (or navigating to a sibling) cancels any in-flight close.
    if (isClosing) {
      setIsClosing(false);
      closingDealIdRef.current = null;
    }
    // NOTE: we intentionally do NOT early-return when the effect re-runs
    // for the same deal.id. In React strict mode (and on any parent
    // remount) the previous effect's cleanup cancels the release rAFs,
    // and an early-return here would leave `originTransform` stuck at
    // the tile's scale — the panel would then render permanently at the
    // tile's size. Fall through so the release path re-arms.
    // Carousel navigation between sibling deals: skip the expand-from-tile
    // shell animation entirely. The shell stays visually pinned and only
    // the inner content wrapper slides horizontally (handled by the
    // key + animation style on the body wrapper below).
    if (navDirRef.current && lastAnimatedDealId.current) {
      lastAnimatedDealId.current = deal.id;
      setOriginTransform(null);
      setOriginBorderRadius(null);
      setContentVisible(true);
      return;
    }
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
      // No tile origin → no expand animation to wait on. Mount the
      // content immediately so the click → content paint feels instant.
      setContentVisible(true);
      return;
    }

    // Final panel frame mirrors the className: full screen below `sm`,
    // 8px inset above. Use viewport size to compute the resting box.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDesktop = vw >= 640;
    const inset = isDesktop ? 24 : 0;
    const finalLeft = inset;
    const finalTop = inset;
    const finalWidth = vw - inset * 2;
    const finalHeight = vh - inset * 2;

    const sx = Math.max(rect.width / finalWidth, 0.05);
    const sy = Math.max(rect.height / finalHeight, 0.05);
    const tx = rect.left - finalLeft;
    const ty = rect.top - finalTop;

    // Apply the starting transform synchronously, then release on the
    // next frame so the CSS transition interpolates back to identity.
    setOriginTransform(`translate3d(${tx}px, ${ty}px, 0) scale(${sx}, ${sy})`);
    setOriginBorderRadius(16);
    // Mirror the close animation: content is visible inside the shell
    // from the very first frame, so the shell expands from the tile
    // WITH the deal content already painted (reverse of the collapse).
    setContentVisible(true);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setOriginTransform(null);
        setOriginBorderRadius(null);
      });
    });
    // Safety net: some browsers (notably Safari) and slower machines
    // occasionally miss the double-rAF release — the panel then stays
    // pinned at the tile's size because the transform is never cleared.
    // Guarantee a release after ~80ms regardless of rAF behavior.
    const safety = window.setTimeout(() => {
      setOriginTransform(null);
      setOriginBorderRadius(null);
    }, 80);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      window.clearTimeout(safety);
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
    navDirRef.current = 'prev';
    setNavDir('prev');
    onNavigate(prevDeal);
    window.setTimeout(() => {
      navDirRef.current = null;
      setNavDir(null);
    }, 360);
  };
  const goNext = () => {
    if (!nextDeal) return;
    navDirRef.current = 'next';
    setNavDir('next');
    onNavigate(nextDeal);
    window.setTimeout(() => {
      navDirRef.current = null;
      setNavDir(null);
    }, 360);
  };

  /** Jump directly to any deal in the current ordered list. */
  const jumpTo = (target: Deal) => {
    setJumpOpen(false);
    if (!target || target.id === deal?.id) return;
    const targetIdx = orderedDeals.findIndex(d => d.id === target.id);
    const dir: 'prev' | 'next' = targetIdx < idx ? 'prev' : 'next';
    navDirRef.current = dir;
    setNavDir(dir);
    onNavigate(target);
    window.setTimeout(() => {
      navDirRef.current = null;
      setNavDir(null);
    }, 360);
  };

  // Esc + arrow key navigation. Skip when focus is in an editable element
  // inside the overlay so typing still works inside DealDetail.
  useEffect(() => {
    if (!deal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); animateClose(); return; }
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
  }, [deal?.id, prevDeal?.id, nextDeal?.id, isClosing, reduceMotion]);

  if (!deal) return null;

  // When navigating between sibling deals, slide the inner content
  // horizontally based on direction. Keyed by deal.id so the wrapper
  // remounts and the CSS animation re-fires every navigation.
  const carouselAnimation =
    reduceMotion || !navDir
      ? undefined
      : navDir === 'next'
        ? 'slideInFromRight 320ms cubic-bezier(0.16, 1, 0.3, 1) both'
        : 'slideInFromLeft 320ms cubic-bezier(0.16, 1, 0.3, 1) both';

  const overlay = (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Deal details for ${deal.company || 'deal'}`}
      style={{ pointerEvents: 'auto' }}
      onPointerDownCapture={(e) => {
        // While the overlay is animating closed, swallow every pointer
        // event so a stray click can't reach background controls (e.g.
        // the page's "+ New Deal" button) once the panel collapses.
        if (isClosing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClickCapture={(e) => {
        if (isClosing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0',
          reduceMotion ? '' : 'animate-fade-in',
        )}
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(10, 14, 24, 0.18) 0%, rgba(7, 10, 18, 0.34) 58%, rgba(4, 6, 12, 0.46) 100%)',
          backdropFilter: 'blur(8px) saturate(80%) brightness(0.72)',
          WebkitBackdropFilter: 'blur(8px) saturate(80%) brightness(0.72)',
          opacity: reduceMotion ? 1 : isClosing ? 0 : 1,
          transition: reduceMotion ? undefined : 'opacity 220ms ease-out',
        }}
        onClick={(e) => {
          e.stopPropagation();
          animateClose();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Pointer-event shield — stays interactive for the entire close
          animation window. The panel scales down toward the originating
          tile during this 240ms, but the shield keeps the whole viewport
          unreachable so a stray click can't land on background controls
          such as the page's "+ New Deal" button. */}
      {isClosing && (
        <div
          aria-hidden
          className="absolute inset-0 z-[55]"
          style={{ background: 'transparent' }}
          onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onPointerDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
        />
      )}

      {/* Panel — near full-screen canvas. Sits above all app chrome
          (sidebar / global header) via z-[100] on the wrapper. */}
      <div
        className={cn(
          'popup-shell-surface deal-popup-shell relative w-screen h-screen sm:w-[calc(100vw-3rem)] sm:h-[calc(100vh-3rem)] sm:rounded-2xl overflow-hidden flex flex-col',
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
            : isClosing
              ? 'transform 240ms cubic-bezier(0.4, 0, 0.2, 1), border-radius 240ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease-out'
              : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 240ms cubic-bezier(0.22, 1, 0.36, 1)',
          opacity: isClosing ? 0.92 : 1,
          willChange: 'transform',
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
        {/* Header navigation zone — prev/next deal + close, all on one
            row so nothing floats over the modal body content. */}
        <div className="absolute top-2 right-2 z-[60] flex items-center gap-1.5">
          {/* Jump to any deal without leaving the modal */}
          <Popover open={jumpOpen} onOpenChange={setJumpOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={jumpOpen}
                aria-label="Jump to deal"
                title="Jump to deal"
                className={cn(navButtonClass, 'max-w-[14rem] md:max-w-[18rem]')}
              >
                <span className="truncate">{deal?.company || 'Jump to deal'}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="z-[70] w-[20rem] p-0">
              <Command>
                <CommandInput placeholder="Search deals…" />
                <CommandList className="max-h-[18rem]">
                  <CommandEmpty>No deals found.</CommandEmpty>
                  <CommandGroup>
                    {orderedDeals.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={`${d.company ?? ''} ${d.id}`}
                        onSelect={() => jumpTo(d)}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            d.id === deal?.id ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{d.company || 'Untitled deal'}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Desktop: labeled buttons. Mobile/tablet: compact segmented control. */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              type="button"
              onClick={goPrev}
              disabled={!prevDeal}
              aria-label={`Previous deal${prevDeal?.company ? `: ${prevDeal.company}` : ''}`}
              title="Previous deal (←)"
              className={navButtonClass}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Previous deal</span>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextDeal}
              aria-label={`Next deal${nextDeal?.company ? `: ${nextDeal.company}` : ''}`}
              title="Next deal (→)"
              className={navButtonClass}
            >
              <span>Next deal</span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          </div>

          <div className="flex md:hidden items-center rounded-lg border border-white/15 bg-background/85 shadow-sm backdrop-blur overflow-hidden">
            <button
              type="button"
              onClick={goPrev}
              disabled={!prevDeal}
              aria-label="Previous deal"
              className={segmentButtonClass}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span aria-hidden className="h-6 w-px bg-white/15" />
            <button
              type="button"
              onClick={goNext}
              disabled={!nextDeal}
              aria-label="Next deal"
              className={segmentButtonClass}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-background/85 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              animateClose();
            }}
            onPointerDown={(e) => {
              // Prevent the pointerdown from leaking to underlying page controls
              // (e.g., the "New Deal" button) while the overlay is animating closed.
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
            // The inner <main> (rendered by AppLayout in embedded mode) is
            // the actual scroll container. Keep this wrapper as a fixed-
            // height flex shell so the bottom tab rail inside DealDetail
            // can stay pinned to the modal's bottom edge via sticky.
            'deal-popup-scroll relative flex-1 min-h-0 w-full bg-transparent overflow-hidden flex flex-col',
          )}
          style={{
            opacity: reduceMotion ? 1 : contentVisible ? 1 : 0,
            transform: reduceMotion || contentVisible ? undefined : 'translateY(6px)',
            transition: reduceMotion
              ? undefined
              : 'opacity 160ms ease-out, transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
            // Isolate DealDetail's layout/paint from the animated shell
            // so reconciliation inside the deal page can't invalidate the
            // outer transform animation (eliminates open-time shudder).
            contain: 'layout paint style',
          }}
        >
          <div
            key={`carousel-${deal.id}`}
            className="w-full flex-1 flex flex-col min-h-0"
            style={{ animation: carouselAnimation, willChange: carouselAnimation ? 'transform, opacity' : undefined }}
          >
          <Suspense fallback={<DealOverlayHydrating />}>
            {/* Defer mounting DealDetail until the shell expansion has
                finished. Mounting it during the transform animation
                causes visible jitter as heavy subtrees hydrate and lay
                out. While we wait we render a lightweight placeholder
                so the shell stays visually stable. */}
            {!contentVisible ? (
              <DealOverlayHydrating />
            ) : (
            <>
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
            </>
            )}
          </Suspense>
          </div>
        </div>
      </div>
    </div>
  );

  // Portal to <body> so the overlay sits above the entire app shell
  // (sidebar, global header, route chrome) regardless of where it was
  // mounted in the React tree.
  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
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