import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDashboardCarouselWidgets } from '@/hooks/useDashboardCarouselWidgets';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const OPEN_DELAY = 120;
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
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

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

  const handleParentClick = (e: React.MouseEvent) => {
    // On mobile, tap toggles the submenu instead of navigating.
    if (isMobile && hasWidgets) {
      e.preventDefault();
      openedViaKeyboardRef.current = false;
      setOpen((v) => !v);
      return;
    }
    navigate('/dashboard');
  };

  const handleParentKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!hasWidgets) return;
    // Open + move focus into the submenu.
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      // Enter / Space on the parent: if menu is closed, open it AND let the
      // default click-through navigate? No — we want predictable behavior:
      // Enter/Space activates Dashboard navigation, Arrow keys open the menu.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        clearTimers();
        openedViaKeyboardRef.current = true;
        setOpen(true);
      }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      closeAndReturnFocus();
    }
  };

  const handleSubItemClick = (id: string) => {
    openedViaKeyboardRef.current = false;
    setOpen(false);
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

  const triggerButton = (
    <SidebarMenuButton
      ref={triggerRef}
      isActive={isDashboardRoute}
      tooltip="Dashboard"
      onClick={handleParentClick}
      onKeyDown={handleParentKeyDown}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      // Don't auto-open on focus — that traps keyboard users. They use
      // ArrowRight / ArrowDown to open intentionally.
      aria-haspopup={hasWidgets ? 'menu' : undefined}
      aria-expanded={hasWidgets ? open : undefined}
      className={cn(
        'hover:bg-sidebar-accent/50',
        isDashboardRoute && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
      )}
    >
      <LayoutDashboard className="h-4 w-4" />
      {showExpanded && (
        <span className="flex flex-1 items-center justify-between gap-1.5">
          <span>Dashboard</span>
          {hasWidgets && (
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform',
                open && 'rotate-90',
              )}
              aria-hidden="true"
            />
          )}
        </span>
      )}
    </SidebarMenuButton>
  );

  return (
    <SidebarMenuItem>
      {hasWidgets ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (!next) openedViaKeyboardRef.current = false;
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-56 p-1"
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
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      'flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      'focus:bg-accent focus:text-accent-foreground',
                      isActive && 'bg-accent text-accent-foreground font-medium',
                    )}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        triggerButton
      )}
    </SidebarMenuItem>
  );
}