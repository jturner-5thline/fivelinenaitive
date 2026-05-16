import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { Briefcase, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useCloseOnRouteChange } from '@/hooks/useCloseOnRouteChange';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { useRecentDealIds } from '@/hooks/useRecentDeals';
import type { Deal } from '@/types/deal';

const OPEN_DELAY = 120;
const CLOSE_DELAY = 180;

/** Maximum number of recently opened deals to surface in the dropdown. */
const MAX_RECENT_IN_MENU = 5;

/** Custom event consumed by the inbox view (see DealEmailsTab) to apply the
 * inbox-level deal filter selected from the sidebar flyout. */
export const SIDEBAR_DEAL_FILTER_EVENT = 'naitive:select-inbox-deal';

/**
 * Sidebar item for "Deals" with a flyout submenu listing the deals in the
 * Active Pipeline that are still open. Clicking a deal opens the email
 * inbox widget and applies the deal filter via a window event.
 */
export function DealsFlyoutMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, isHovering } = useSidebar();
  const isMobile = useIsMobile();
  const { deals } = useDealsContext();
  const { activePipelineId, activePipeline } = usePipelineContext();
  const recentDealIds = useRecentDealIds();

  const [open, setOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedViaKeyboardRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  useCloseOnRouteChange(open, () => setOpen(false));

  const showExpanded = state === 'expanded' || (state === 'collapsed' && isHovering);
  const isDealsRoute = location.pathname === '/deals';

  /** The user's 5 most recently opened deals (most recent first), resolved
   *  against the loaded deals list. Excluded test deals and deals the user
   *  no longer has access to are skipped. */
  const activeDeals = useMemo<Deal[]>(() => {
    if (!recentDealIds.length || !deals?.length) return [];
    const byId = new Map(deals.map((d) => [d.id, d]));
    const out: Deal[] = [];
    for (const dealId of recentDealIds) {
      const d = byId.get(dealId);
      if (!d) continue;
      if (isExcludedDealName(d.name)) continue;
      out.push(d);
      if (out.length >= MAX_RECENT_IN_MENU) break;
    }
    return out;
  }, [recentDealIds, deals]);

  const hasDeals = activeDeals.length > 0;

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  // Close synchronously across route transitions so the flyout never lingers.
  useEffect(() => {
    if (open) {
      clearTimers();
      openedViaKeyboardRef.current = false;
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchParams]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, activeDeals.length);
  }, [activeDeals.length]);

  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    if (openedViaKeyboardRef.current) {
      const activeIdx = activeDeals.findIndex((d) => d.id === selectedDealId);
      const startIdx = activeIdx >= 0 ? activeIdx : 0;
      setFocusedIndex(startIdx);
      requestAnimationFrame(() => {
        itemRefs.current[startIdx]?.focus();
      });
    }
  }, [open, activeDeals, selectedDealId]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  const scheduleOpen = () => {
    if (!hasDeals || isMobile) return;
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };

  const scheduleClose = () => {
    if (isMobile) return;
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  const closeAndReturnFocus = () => {
    clearTimers();
    openedViaKeyboardRef.current = false;
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasDeals) return;
    openedViaKeyboardRef.current = false;
    setOpen((v) => !v);
  };

  const handleParentKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (!hasDeals) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      clearTimers();
      openedViaKeyboardRef.current = true;
      setOpen(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      closeAndReturnFocus();
    }
  };

  const handleSubItemClick = (dealId: string) => {
    clearTimers();
    openedViaKeyboardRef.current = false;
    flushSync(() => setOpen(false));
    setSelectedDealId(dealId);
    // Open the deal detail view, matching deal-card click behavior in the
    // /deals pipeline.
    navigate(`/deal/${dealId}`);
  };

  const handleSubItemKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((index + 1) % activeDeals.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((index - 1 + activeDeals.length) % activeDeals.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(activeDeals.length - 1);
        break;
      case 'ArrowLeft':
      case 'Escape':
        e.preventDefault();
        closeAndReturnFocus();
        break;
      case 'Tab':
        openedViaKeyboardRef.current = false;
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const dealsLink = (
    <SidebarMenuButton
      asChild
      isActive={isDealsRoute}
      tooltip="Deals"
      className={cn(
        'hover:bg-sidebar-accent/50',
        hasDeals && showExpanded && 'pr-8',
        isDealsRoute && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
      )}
    >
      <Link
        to="/deals"
        onKeyDown={handleParentKeyDown}
        aria-current={isDealsRoute ? 'page' : undefined}
        data-tour="nav-deals"
      >
        <Briefcase className="h-4 w-4" />
        {showExpanded && <span>Deals</span>}
      </Link>
    </SidebarMenuButton>
  );

  if (!hasDeals) {
    return <SidebarMenuItem>{dealsLink}</SidebarMenuItem>;
  }

  return (
    <SidebarMenuItem>
      <div
        className="relative"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {dealsLink}
        {showExpanded && (
          <Popover
            open={open}
            onOpenChange={(next) => {
              if (!next) openedViaKeyboardRef.current = false;
              setOpen(next);
            }}
          >
            <PopoverTrigger asChild>
              <button
                ref={triggerRef}
                type="button"
                onClick={handleChevronClick}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Open recently opened deals submenu"
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 z-10',
                  'flex h-6 w-6 items-center justify-center rounded-sm',
                  'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                )}
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    open && 'rotate-90',
                  )}
                  aria-hidden="true"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              className={cn(
                'w-64 p-1.5 rounded-xl border text-popover-foreground',
                'bg-[rgba(28,44,74,0.86)] border-[rgba(120,170,240,0.28)]',
                'backdrop-blur-xl backdrop-saturate-150',
                'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_0_0_rgba(0,0,0,0.25),0_12px_28px_-12px_rgba(0,0,0,0.65)]',
              )}
              onMouseEnter={() => clearTimers()}
              onMouseLeave={scheduleClose}
              onEscapeKeyDown={(e) => {
                e.preventDefault();
                closeAndReturnFocus();
              }}
              onInteractOutside={() => {
                openedViaKeyboardRef.current = false;
              }}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div role="menu" aria-label="Recently opened deals">
                <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Recently opened
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 truncate max-w-[110px]" title={activePipeline?.name || ''}>
                    Last {activeDeals.length}
                  </span>
                </div>
                {/* Scrollable list — caps height so long pipelines don't
                    overflow the viewport. */}
                <div className="max-h-[60vh] overflow-y-auto pr-0.5">
                  {activeDeals.map((d, index) => {
                    const isActive = selectedDealId === d.id;
                    const isFocused = focusedIndex === index;
                    const label = d.company || d.name;
                    return (
                      <button
                        key={d.id}
                        ref={(el) => (itemRefs.current[index] = el)}
                        role="menuitem"
                        tabIndex={isFocused || (focusedIndex < 0 && index === 0) ? 0 : -1}
                        onClick={() => handleSubItemClick(d.id)}
                        onKeyDown={(e) => handleSubItemKeyDown(e, index)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        title={label}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-popover-foreground/90 outline-none transition-colors',
                          'hover:bg-white/10 hover:text-popover-foreground',
                          'focus:bg-white/10 focus:text-popover-foreground',
                          isActive && 'bg-white/15 text-popover-foreground font-medium',
                        )}
                      >
                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-popover-foreground/60" />
                        <span className="truncate text-left flex-1">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </SidebarMenuItem>
  );
}
