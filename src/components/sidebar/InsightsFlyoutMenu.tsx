import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { BarChart3, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useCloseOnRouteChange } from '@/hooks/useCloseOnRouteChange';

const OPEN_DELAY = 60;
const CLOSE_DELAY = 180;

type SubItem = { id: string; label: string; url: string; icon: typeof BarChart3 };

interface Props {
  showSalesBd: boolean;
  showReports: boolean;
}

/**
 * Sidebar item for "Insights" with a flyout submenu listing Insights and
 * Sales & BD destinations. The parent label still navigates to /insights.
 */
export function InsightsFlyoutMenu({ showSalesBd, showReports }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, isHovering } = useSidebar();
  const isMobile = useIsMobile();

  const items: SubItem[] = [
    { id: 'insights', label: 'Insights', url: '/insights', icon: BarChart3 },
    ...(showReports
      ? [{ id: 'reports', label: 'Reports', url: '/reports', icon: FileText } as SubItem]
      : []),
  ];


  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedViaKeyboardRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  useCloseOnRouteChange(open, () => setOpen(false));

  const showExpanded = state === 'expanded' || (state === 'collapsed' && isHovering);
  const isInsightsRoute = location.pathname.startsWith('/insights');
  const hasSub = items.length > 1;

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (open) {
      clearTimers();
      openedViaKeyboardRef.current = false;
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length]);

  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    if (openedViaKeyboardRef.current) {
      setFocusedIndex(0);
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  const scheduleOpen = () => {
    if (!hasSub || isMobile) return;
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
    if (!hasSub) return;
    openedViaKeyboardRef.current = false;
    setOpen((v) => !v);
  };

  const handleParentKeyDown = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (!hasSub) return;
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

  const handleSubItemClick = (url: string) => {
    clearTimers();
    openedViaKeyboardRef.current = false;
    flushSync(() => setOpen(false));
    navigate(url);
  };

  const handleSubItemKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((index + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((index - 1 + items.length) % items.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(items.length - 1);
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

  const insightsLink = (
    <SidebarMenuButton
      asChild
      isActive={isInsightsRoute}
      tooltip="Insights"
      className={cn(
        'hover:bg-sidebar-accent/50',
        hasSub && showExpanded && 'pr-8',
        isInsightsRoute && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
      )}
    >
      <Link
        to="/insights"
        onKeyDown={handleParentKeyDown}
        aria-current={isInsightsRoute ? 'page' : undefined}
        data-tour="nav-insights"
      >
        <BarChart3 className="h-4 w-4" />
        {showExpanded && <span>Insights</span>}
      </Link>
    </SidebarMenuButton>
  );

  if (!hasSub) {
    return <SidebarMenuItem>{insightsLink}</SidebarMenuItem>;
  }

  return (
    <SidebarMenuItem>
      <div
        className="relative"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {insightsLink}
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
                  aria-label="Open insights submenu"
                  className={cn(
                    'absolute right-1 top-1/2 -translate-y-1/2 z-10',
                    'flex h-6 w-6 items-center justify-center rounded-sm',
                    'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                  )}
                >
                  <ChevronRight
                    className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')}
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
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div role="menu" aria-label="Insights">
                {items.map((it, index) => {
                  const isActive = location.pathname.startsWith(it.url);
                  const isFocused = focusedIndex === index;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      ref={(el) => (itemRefs.current[index] = el)}
                      role="menuitem"
                      data-active={isActive ? 'true' : undefined}
                      tabIndex={isFocused || (focusedIndex < 0 && index === 0) ? 0 : -1}
                      onClick={() => handleSubItemClick(it.url)}
                      onKeyDown={(e) => handleSubItemKeyDown(e, index)}
                      onMouseEnter={() => setFocusedIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors sidebar-flyout-item',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {it.label}
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