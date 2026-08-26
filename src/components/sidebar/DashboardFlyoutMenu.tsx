import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { LayoutDashboard, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDashboardCarouselWidgets } from '@/hooks/useDashboardCarouselWidgets';
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useCloseOnRouteChange } from '@/hooks/useCloseOnRouteChange';

const OPEN_DELAY = 60;
const CLOSE_DELAY = 180;

/**
 * Sidebar item for "Dashboard" with a flyout submenu listing the user's
 * enabled dashboard quick-action widgets. Clicking a submenu item navigates
 * to /dashboard?widget=<id>, which the Dashboard page reads to open the
 * matching widget modal automatically.
 */
export function DashboardFlyoutMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, isHovering } = useSidebar();
  const isMobile = useIsMobile();
  const widgets = useDashboardCarouselWidgets();

  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the flyout is opened via keyboard, we want to move focus into the
  // menu and start arrow-key navigation. Hover-open should NOT steal focus.
  const openedViaKeyboardRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Safety net: if anything inside the flyout (or anywhere else) drives a
  // route change while the panel is open, force-close synchronously so the
  // panel never lingers on top of the destination route.
  useCloseOnRouteChange(open, () => setOpen(false));

  const showExpanded = state === 'expanded' || (state === 'collapsed' && isHovering);
  const isDashboardRoute = location.pathname === '/dashboard';
  const activeWidgetId = isDashboardRoute ? searchParams.get('widget') : null;
  const hasWidgets = widgets.length > 0;

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  // Ensure the flyout never lingers across route transitions. The instant the
  // pathname (or the ?widget= search param) changes — i.e. navigation has
  // started/committed — collapse the panel so it doesn't sit on top of the
  // next page while it loads.
  useEffect(() => {
    if (open) {
      clearTimers();
      openedViaKeyboardRef.current = false;
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchParams]);

  // Keep the item ref array sized to the current widget list.
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, widgets.length);
  }, [widgets.length]);

  // When the menu closes, reset focus tracking. When it opens via keyboard,
  // focus the first (or active) item.
  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    if (openedViaKeyboardRef.current) {
      const activeIdx = widgets.findIndex((w) => w.id === activeWidgetId);
      const startIdx = activeIdx >= 0 ? activeIdx : 0;
      setFocusedIndex(startIdx);
      // Focus on the next frame so the popover content is mounted.
      requestAnimationFrame(() => {
        itemRefs.current[startIdx]?.focus();
      });
    }
  }, [open, widgets, activeWidgetId]);

  // Move DOM focus whenever the focused index changes (roving tabindex).
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  const scheduleOpen = () => {
    if (!hasWidgets || isMobile) return;
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
    // Return focus to the trigger after the popover unmounts so tab order resumes from the sidebar.
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    // The chevron is a dedicated submenu toggle — never navigates.
    e.preventDefault();
    e.stopPropagation();
    if (!hasWidgets) return;
    openedViaKeyboardRef.current = false;
    setOpen((v) => !v);
  };

  const handleParentKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (!hasWidgets) return;
    // Open + move focus into the submenu.
    // Enter / Space on the parent link: let it navigate to /dashboard (default).
    // Arrow keys open the submenu instead.
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

  const handleSubItemClick = (id: string) => {
    // Dismiss the panel synchronously BEFORE navigation kicks off so it
    // never hangs on screen during the route transition.
    clearTimers();
    openedViaKeyboardRef.current = false;
    flushSync(() => setOpen(false));
    navigate(`/dashboard?widget=${encodeURIComponent(id)}`);
  };

  const handleSubItemKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((index + 1) % widgets.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((index - 1 + widgets.length) % widgets.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(widgets.length - 1);
        break;
      case 'ArrowLeft':
      case 'Escape':
        e.preventDefault();
        closeAndReturnFocus();
        break;
      case 'Tab':
        // Let Tab close the flyout so focus continues naturally to the next sidebar item.
        openedViaKeyboardRef.current = false;
        setOpen(false);
        break;
      default:
        break;
    }
  };

  // The Dashboard label is always a real <Link> to /dashboard. The chevron is
  // a separate button that toggles the flyout, so the two interactions never
  // conflict. The whole row still triggers hover-to-open on desktop.
  const dashboardLink = (
    <SidebarMenuButton
      asChild
      isActive={isDashboardRoute}
      tooltip="Dashboard"
      className={cn(
        'hover:bg-sidebar-accent/50',
        // Add right padding when the chevron is visible so its absolute
        // position doesn't overlap the label text.
        hasWidgets && showExpanded && 'pr-8',
        isDashboardRoute && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
      )}
    >
      <Link
        to="/dashboard"
        onKeyDown={handleParentKeyDown}
        aria-current={isDashboardRoute ? 'page' : undefined}
        data-tour="nav-dashboard"
      >
        <LayoutDashboard className="h-4 w-4" />
        {showExpanded && <span>Dashboard</span>}
      </Link>
    </SidebarMenuButton>
  );

  if (!hasWidgets) {
    return <SidebarMenuItem>{dashboardLink}</SidebarMenuItem>;
  }

  return (
    <SidebarMenuItem>
      <div
        ref={rowRef}
        className="relative"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {dashboardLink}
        {(
          <Popover
          open={open}
          onOpenChange={(next) => {
            if (!next) openedViaKeyboardRef.current = false;
            setOpen(next);
          }}
        >
            {showExpanded ? (
              <PopoverTrigger asChild>
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={handleChevronClick}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-label="Open dashboard widgets submenu"
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
            ) : (
              <PopoverAnchor asChild>
                <span className="pointer-events-none absolute inset-0" aria-hidden="true" />
              </PopoverAnchor>
            )}

          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className={cn(
              // Use the platform's shared glass-module surface (same
              // translucent navy fill, soft border, blur + diagonal sheen)
              // used by Insights cards, Weekly Rundown modules, and other
              // polished panels — so the flyout reads as part of the same
              // design system rather than a one-off popover.
              'w-56 p-1.5 text-popover-foreground sidebar-flyout',
              'shadow-[0_12px_28px_-12px_rgba(0,0,0,0.65)]',
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
            onOpenAutoFocus={(e) => {
              // We manage focus manually based on how the popover was opened.
              // Always prevent Radix's default auto-focus to avoid focus jumps
              // when the menu opens via hover.
              e.preventDefault();
            }}
            onCloseAutoFocus={(e) => {
              // We handle focus return ourselves in closeAndReturnFocus(); prevent
              // Radix from also moving focus, which can fight with our logic.
              e.preventDefault();
            }}
          >
            <div role="menu" aria-label="Dashboard widgets">
              <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider sidebar-flyout-label">
                Quick widgets
              </div>
              {widgets.map((w, index) => {
                const isActive = activeWidgetId === w.id;
                const isFocused = focusedIndex === index;
                return (
                  <button
                    key={w.id}
                    ref={(el) => (itemRefs.current[index] = el)}
                    role="menuitem"
                    tabIndex={isFocused || (focusedIndex < 0 && index === 0) ? 0 : -1}
                    onClick={() => handleSubItemClick(w.id)}
                    onKeyDown={(e) => handleSubItemKeyDown(e, index)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={cn(
                      // Mirror the hover/active language used by the platform's
                      // standard dropdown items (DropdownMenuItem / PopoverContent
                      // links): the accent token, not an ad-hoc white wash.
                      'flex w-full items-center rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors sidebar-flyout-item',
                    )}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
          </Popover>
        )}
      </div>
    </SidebarMenuItem>
  );
}