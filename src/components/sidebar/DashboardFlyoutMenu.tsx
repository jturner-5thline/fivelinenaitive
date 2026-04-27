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

  const handleParentClick = (e: React.MouseEvent) => {
    // On mobile, tap toggles the submenu instead of navigating.
    if (isMobile && hasWidgets) {
      e.preventDefault();
      setOpen((v) => !v);
      return;
    }
    navigate('/dashboard');
  };

  const handleParentKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!hasWidgets) return;
    if (e.key === 'ArrowRight' || (e.key === 'ArrowDown' && open)) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const handleSubItemClick = (id: string) => {
    setOpen(false);
    navigate(`/dashboard?widget=${encodeURIComponent(id)}`);
  };

  const triggerButton = (
    <SidebarMenuButton
      isActive={isDashboardRoute}
      tooltip="Dashboard"
      onClick={handleParentClick}
      onKeyDown={handleParentKeyDown}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            className="w-56 p-1"
            onMouseEnter={() => clearTimers()}
            onMouseLeave={scheduleClose}
            onEscapeKeyDown={() => setOpen(false)}
            onOpenAutoFocus={(e) => {
              // Don't pull focus on hover-open; only when user opens via keyboard/click.
              if (!isMobile) e.preventDefault();
            }}
          >
            <div role="menu" aria-label="Dashboard widgets">
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quick widgets
              </div>
              {widgets.map((w) => {
                const isActive = activeWidgetId === w.id;
                return (
                  <button
                    key={w.id}
                    role="menuitem"
                    onClick={() => handleSubItemClick(w.id)}
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