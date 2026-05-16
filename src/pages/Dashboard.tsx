import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { Settings2, Pencil, Check, Calendar as CalendarIcon, Mail, Briefcase, LayoutTemplate, Newspaper, Handshake, Inbox as InboxIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
// Heavy modals are lazy-loaded so they don't bloat the initial Dashboard
// chunk. Each is only mounted when the user actually opens its widget,
// so deferring the import has no perceptible cost on first interaction
// (the dynamic import races with the modal's open animation).
import type { DealsCarouselView } from '@/components/dashboard/DealsCarouselDialog';
const DailyBriefingModal = lazy(() =>
  import('@/components/dashboard/DailyBriefingModal').then(m => ({ default: m.DailyBriefingModal })),
);
// InboxDialog is eagerly imported (NOT lazy) so the modal can paint
// instantly from the prefetched inbox cache on click. Lazy-loading this
// chunk previously added 1–2s of network + parse latency between the
// click and the first list paint, defeating the prefetch.
import { InboxDialog } from '@/components/dashboard/InboxDialog';
const DealsCarouselDialog = lazy(() =>
  import('@/components/dashboard/DealsCarouselDialog').then(m => ({ default: m.DealsCarouselDialog })),
);
import { WidgetCarouselChrome } from '@/components/dashboard/widget-carousel/WidgetCarouselChrome';
import { useWidgetCarouselStore } from '@/stores/widgetCarouselStore';
import { useProfile } from '@/hooks/useProfile';
import { useDashboardPresets, WidgetConfig, GridItem } from '@/hooks/useDashboardPresets';
import { WIDGET_REGISTRY } from '@/components/dashboard/widgetRegistry';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { PresetManager } from '@/components/dashboard/PresetManager';
import { NewPresetButton } from '@/components/dashboard/NewPresetButton';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
const AddWidgetDialog = lazy(() =>
  import('@/components/dashboard/AddWidgetDialog').then(m => ({ default: m.AddWidgetDialog })),
);
import { EmailIntelligenceWidget } from '@/components/dashboard/EmailIntelligenceWidget';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { useAiActionQueue, useAiActionQueueCount } from '@/hooks/useAiActionQueue';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { perfMark, perfMeasure } from '@/lib/perfMarks';

// Mark module evaluation as the start of the Dashboard mount window.
// Paired with the post-mount measure below to surface initial-load latency
// in the browser User Timing track during dev profiling.
if (typeof performance !== 'undefined') {
  perfMark('dashboard:mount-start');
}

/**
 * Shared interaction styles for the dashboard widget tiles
 * (Calendar, Email, New Deal, Daily Rundown, Niki's Daily Rundown).
 *
 * Hover and focus only adjust the translucent glass background and border.
 * No glow, no drop shadow, no scale — we explicitly override the default
 * dark-mode hover shadow from `<Card>` via `dark:hover:shadow-none`.
 */
/**
 * Frosted-glass shortcut tile.
 *
 * Restrained financial-SaaS take on glassmorphism:
 *   - Translucent neutral surface with backdrop blur.
 *   - Soft inner highlight via inset ring (top edge).
 *   - Low-contrast border, gentle (not heavy) shadow.
 *   - Hover: subtle surface brighten + tiny lift, no glow.
 */
/**
 * Frosted-glass shortcut tile container.
 *
 * Mirrors the reference glassy icon-tile composition: the visible "tile" is
 * the icon chip itself, with the label centered below it. The surrounding
 * `<Card>` is intentionally stripped of its dashboard-card chrome
 * (no background, no border, no shadow) so the chip reads as a standalone
 * frosted shortcut, identical in spirit to the attached reference.
 *
 * The `group` class lets the inner chip respond to hover/focus on the tile.
 * `!` important overrides neutralize the base `<Card>` dark-mode glass styles.
 */
/**
 * Unified dashboard quick-action tile.
 *
 * All tiles share a single surface (bg-card / border-border / rounded-2xl /
 * shadow-sm) matching the My Tasks / My Deals cards directly below. Icons
 * use the single brand accent (primary). Differentiation between tiles is
 * carried by a low-saturation 2px top accent bar from one of three category
 * tokens (inbox, pipeline, reports), paired with the label/icon — never
 * color alone.
 */
const TILE_INTERACTIVE_CLASSES =
  'group relative cursor-pointer outline-none overflow-hidden ' +
  'flex flex-col items-center justify-center text-center ' +
  'h-full w-full ' +
  'p-[calc(var(--tile-size)*0.14)] gap-[calc(var(--tile-size)*0.10)] ' +
  'rounded-2xl border border-border bg-card shadow-sm ' +
  'transition-[background-color,border-color,box-shadow] duration-200 ease-out ' +
  'hover:bg-accent/30 hover:border-border/80 ' +
  'active:ring-1 active:ring-primary/40 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Three low-saturation category tokens. Surfaced as a 2px top accent bar. */
type TileCategory = 'inbox' | 'pipeline' | 'reports';
const CATEGORY_BAR_CLASS: Record<TileCategory, string> = {
  inbox: 'bg-primary/40',
  pipeline: 'bg-accent/50',
  reports: 'bg-muted-foreground/40',
};

/** Tile label — matches dashboard section title typography. */
const TILE_LABEL_CLASSES =
  'text-sm font-semibold leading-tight tracking-[0.01em] ' +
  'text-foreground text-center whitespace-nowrap';

/** Standardized icon: 28px, single brand accent, 1.75 stroke. */
const TILE_ICON_CLASSES =
  'h-7 w-7 text-primary transition-colors duration-200 group-hover:text-primary';

const handleTileKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, action: () => void) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    action();
  }
};

/**
 * Skeleton placeholder that mirrors the dimensions and layout of a real
 * dashboard widget tile (Calendar, Email, etc.) so the row reserves space
 * and doesn't shift when the gated tile set finishes loading.
 */
function WidgetTileSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border bg-card shadow-sm p-[calc(var(--tile-size)*0.14)] h-full flex flex-col items-center justify-center gap-[calc(var(--tile-size)*0.10)]"
      aria-hidden="true"
    >
      <Skeleton className="h-7 w-7 rounded" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/**
 * Single shared dashboard quick-action tile. All 7 tiles use this.
 */
function QuickActionTile({
  label,
  icon: Icon,
  category,
  onClick,
  onKeyDown,
  className,
  ariaLabel,
  badgeCount,
}: {
  label: string;
  icon: React.ComponentType<any>;
  category: TileCategory;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
  ariaLabel?: string;
  badgeCount?: number;
}) {
  return (
    <Card
      className={cn(TILE_INTERACTIVE_CLASSES, className)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel ?? label}
    >
      <span
        aria-hidden="true"
        className={cn('absolute left-0 right-0 top-0 h-[2px]', CATEGORY_BAR_CLASS[category])}
      />
      <Icon className={TILE_ICON_CLASSES} strokeWidth={1.75} />
      <span className={TILE_LABEL_CLASSES}>{label}</span>
      {typeof badgeCount === 'number' && badgeCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 text-[10px] leading-none"
        >
          {badgeCount > 99 ? '99+' : badgeCount}
        </Badge>
      )}
    </Card>
  );
}

/**
 * Email tile + hover-anchored Email Intelligence panel.
 *
 * The Email Intelligence panel is hidden by default and only appears when
 * the user hovers (or keyboard-focuses) the Email tile itself. It is
 * positioned absolutely inside this relatively-positioned container so it
 * stays anchored to the tile and slightly overlaps below it. The panel
 * stays open while the pointer is over either the trigger tile or the
 * panel, and fades out on leave. On touch devices (no hover), the panel
 * is suppressed entirely.
 */
function EmailTileWithIntelligence({
  onOpen,
  onKeyDown,
  className,
}: {
  onOpen: (el: HTMLElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tileRef = useRef<HTMLDivElement | null>(null);
  type Placement = 'right' | 'left' | 'bottom';
  const [placement, setPlacement] = useState<Placement>('right');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const PANEL_WIDTH = 360;
  const GAP = 12;
  const VIEWPORT_PAD = 12;

  const recompute = useCallback(() => {
    const tile = tileRef.current;
    const wrapper = wrapperRef.current;
    if (!tile || !wrapper) return;

    const tileRect = tile.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const vw = window.innerWidth;

    // Always anchor BENEATH the Email tile so the popover never overlaps
    // the neighboring Action Queue / Deals tiles. Falls back to side
    // placements only if there's truly no vertical room (rare on desktop).
    const spaceBelow = window.innerHeight - tileRect.bottom - VIEWPORT_PAD;
    const spaceRight = vw - tileRect.right - VIEWPORT_PAD;
    const spaceLeft = tileRect.left - VIEWPORT_PAD;

    let next: Placement = 'bottom';
    if (spaceBelow < 220) {
      // Not enough vertical room — fall back to a side that fits.
      if (spaceRight >= PANEL_WIDTH + GAP) next = 'right';
      else if (spaceLeft >= PANEL_WIDTH + GAP) next = 'left';
      else next = 'bottom';
    }

    // Position relative to wrapper (which is position: relative).
    const tileTopInWrapper = tileRect.top - wrapperRect.top;
    const tileLeftInWrapper = tileRect.left - wrapperRect.left;

    if (next === 'right') {
      setPanelStyle({
        top: tileTopInWrapper,
        left: tileLeftInWrapper + tileRect.width + GAP,
        width: PANEL_WIDTH,
      });
    } else if (next === 'left') {
      setPanelStyle({
        top: tileTopInWrapper,
        left: tileLeftInWrapper - PANEL_WIDTH - GAP,
        width: PANEL_WIDTH,
      });
    } else {
      // Bottom: center under tile but clamp inside viewport.
      const desiredCenter = tileRect.left + tileRect.width / 2;
      const halfPanel = PANEL_WIDTH / 2;
      const clampedCenter = Math.min(
        Math.max(desiredCenter, VIEWPORT_PAD + halfPanel),
        vw - VIEWPORT_PAD - halfPanel,
      );
      const leftViewport = clampedCenter - halfPanel;
      setPanelStyle({
        top: tileTopInWrapper + tileRect.height + GAP,
        left: leftViewport - wrapperRect.left,
        width: PANEL_WIDTH,
      });
    }
    setPlacement(next);
  }, []);

  useEffect(() => {
    if (!isHovering) return;
    recompute();
    const onResize = () => recompute();
    const onScroll = () => recompute();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isHovering, recompute]);

  const open = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setIsHovering(true);
    // Measure on next frame so layout is stable.
    requestAnimationFrame(recompute);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsHovering(false), 120);
  };

  const closeNow = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setIsHovering(false);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn('relative h-full', className)}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={(e) => {
        // Only close if focus actually leaves the wrapper subtree
        if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
      }}
      onKeyDownCapture={(e) => {
        if (e.key === 'Escape' && isHovering) {
          e.stopPropagation();
          closeNow();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    >
      <div ref={tileRef} className="h-full">
        <QuickActionTile
          label="Email"
          icon={Mail}
          category="inbox"
          badgeCount={useInboxCacheStore(selectUnreadCount)}
          onClick={(e) => onOpen(e.currentTarget as HTMLElement)}
          onKeyDown={onKeyDown}
        />
      </div>

      {/*
        Hover-anchored Email Intelligence panel.
        - Absolutely positioned so it overlays/sits adjacent to this tile
          rather than reflowing the dashboard.
        - Visibility is gated on hover/focus state of the tile or panel.
        - Suppressed on touch / no-hover devices via media query.
      */}
      <div
        style={panelStyle}
        className={cn(
          'pointer-events-none absolute z-40 max-w-[92vw]',
          'transition-all duration-200 ease-out',
          '[@media(hover:none)]:hidden',
          isHovering
            ? 'opacity-100 pointer-events-auto translate-x-0 translate-y-0'
            : placement === 'right'
              ? 'opacity-0 -translate-x-1'
              : placement === 'left'
                ? 'opacity-0 translate-x-1'
                : 'opacity-0 -translate-y-1',
        )}
        role="region"
        aria-label="Email Intelligence"
        aria-hidden={!isHovering}
      >
        {/*
          Invisible hover bridge — covers the GAP between the tile and the
          panel so the cursor doesn't briefly land on dead space (which
          would trigger onMouseLeave → close flicker). Only present when
          the panel is open. Sized per placement.
        */}
        {isHovering && (
          <div
            aria-hidden
            className="absolute"
            style={
              placement === 'bottom'
                ? { left: 0, right: 0, top: -GAP, height: GAP }
                : placement === 'right'
                  ? { top: 0, bottom: 0, left: -GAP, width: GAP }
                  : { top: 0, bottom: 0, right: -GAP, width: GAP }
            }
          />
        )}
        {/*
          Glass surface — matches the dashboard's existing glass language
          (translucent background + blur + soft border + inner highlight),
          consistent with WidgetCarouselChrome / InboxDialog / OperationalDashboard.
        */}
        <div
          className={cn(
            'flex flex-col max-h-[360px] overflow-hidden rounded-xl',
            'bg-background/70 backdrop-blur-2xl',
            'glass-border-soft',
            'shadow-2xl shadow-black/30',
            'ring-1 ring-white/[0.04]',
          )}
          style={{
            // Subtle inner top highlight for the "liquid glass" feel.
            boxShadow:
              'inset 0 1px 0 hsl(0 0% 100% / 0.06), 0 20px 40px -12px hsl(0 0% 0% / 0.45)',
          }}
        >
          <EmailIntelligenceWidget />
        </div>
      </div>
    </div>
  );
}

import { DashboardTemplatesDialog } from '@/components/dashboard/DashboardTemplates';
const FullCalendarView = lazy(() =>
  import('@/components/dashboard/FullCalendarView').then(m => ({ default: m.FullCalendarView })),
);
import { NewsFeedPanel } from '@/components/dashboard/NewsFeedPanel';
import { NewsFeedDialog } from '@/components/dashboard/NewsFeedDialog';
import { NikiPerformanceTab } from '@/components/dashboard/NikiPerformanceTab';
import { toast } from 'sonner';
import {
  canSeeNikiBriefing,
  NIKI_USER_ID,
  NIKI_ASSIGNEE_NAME,
  NIKI_EMAIL,
} from '@/constants/nikiBriefing';
import { useDashboardCarouselWidgets } from '@/hooks/useDashboardCarouselWidgets';
import { useInboxPrefetch } from '@/hooks/useInboxPrefetch';
import { useInboxCacheStore, selectUnreadCount } from '@/stores/inboxCacheStore';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchNewsFeed } from '@/hooks/useNews';

export default function Dashboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  // Eagerly warm the inbox cache on dashboard mount so the Email widget
  // opens instantly with cached messages instead of a spinner. Polls
  // every 2 minutes (and on tab focus) to keep new messages flowing in.
  useInboxPrefetch();
  // Background prefetch the news feed so the News section opens instantly.
  const queryClient = useQueryClient();
  useEffect(() => {
    const t = setTimeout(() => {
      prefetchNewsFeed(queryClient);
    }, 500);
    return () => clearTimeout(t);
  }, [queryClient]);
  // Dev-only: emit a single performance.measure for Dashboard mount
  // latency. View in DevTools → Performance → User Timing, or set
  // `localStorage.setItem('perf:debug','1')` to log to the console.
  useEffect(() => {
    perfMeasure('dashboard:mount', 'dashboard:mount-start');
  }, []);
  const isJTurner = user?.email === 'jturner@5thline.co';
  const canSeeNiki = canSeeNikiBriefing(user?.email);
  const isNikiViewingHerself = user?.email?.toLowerCase() === NIKI_EMAIL;
  // Performance tab is restricted to Niki and James.
  const canSeePerformance =
    user?.email === 'nheikali@5thline.co' || user?.email === 'jturner@5thline.co';
  // 5th Line workspace gating for the Deal Rundown quick-action tile.
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const {
    presets,
    activePreset,
    isLoading,
    isSaving,
    createPreset,
    updatePreset,
    switchPreset,
    deletePreset,
    duplicatePreset,
    addWidgetToPreset,
    removeWidgetFromPreset,
  } = useDashboardPresets();

  const [searchParams, setSearchParams] = useSearchParams();
  const [dashboardTab, setDashboardTab] = useState<string>(() => {
    return searchParams.get('tab') || 'overview';
  });
  const [isEditing, setIsEditing] = useState(false);
  // Carousel-driven open state for the top quick-action widgets
  const carouselIsOpen = useWidgetCarouselStore((s) => s.isOpen);
  const carouselActiveIndex = useWidgetCarouselStore((s) => s.activeIndex);
  const carouselOrder = useWidgetCarouselStore((s) => s.order);
  const setCarouselOrder = useWidgetCarouselStore((s) => s.setOrder);
  const openCarouselWidget = useWidgetCarouselStore((s) => s.openWidget);
  const closeCarousel = useWidgetCarouselStore((s) => s.close);
  const activeCarouselId = carouselIsOpen ? carouselOrder[carouselActiveIndex]?.id : null;
  const isWidgetActive = (id: string) => activeCarouselId === id;
  const handleCarouselDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeCarousel();
    },
    [closeCarousel],
  );

  // Always start the dashboard with the carousel closed. The carousel
  // store is module-level (Zustand) and is NOT cleared on route change,
  // so if the user previously had Calendar (or any other widget) open
  // and navigated away, it would still be `isOpen: true` when they
  // returned to the dashboard and Calendar — being the first registered
  // widget — would auto-open. Reset on every dashboard mount so the
  // landing state is neutral.
  useEffect(() => {
    closeCarousel();
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  // #24: Always compute firstName regardless of sidebar state
  const firstName = profile?.first_name || (profile?.display_name ? profile.display_name.split(' ')[0] : '') || 'there';
  // Track recently removed widgets for undo (#13)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ widgetId: string; widget: WidgetConfig; gridItem: GridItem } | null>(null);
  const [dealsDialogOpen, setDealsDialogOpen] = useState(false);
  const [dealsInitialView, setDealsInitialView] = useState<DealsCarouselView | undefined>(undefined);
  // Action Queue modal — opened from the top-row quick-action tile so the
  // queue stays a first-class shortcut rather than a sibling card.
  const [actionQueueOpen, setActionQueueOpen] = useState(false);
  const actionQueueCount = useAiActionQueueCount();
  const { data: actionQueueItems = [], refetch: refetchActionQueue } = useAiActionQueue();

  // Auto-refresh queue contents whenever the modal opens so the list always
  // reflects the latest pending AI actions.
  const openActionQueue = () => {
    setActionQueueOpen(true);
    refetchActionQueue();
  };

  // Sync tab from URL query params
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'news-feed') setDashboardTab('news-feed');
    if (tab === 'performance' && canSeePerformance) setDashboardTab('performance');
  }, [searchParams, canSeePerformance]);

  // Auto-open Daily Rundown from email link (?briefing=true)
  useEffect(() => {
    if (isJTurner && searchParams.get('briefing') === 'true') {
      // Open via the shared carousel so arrow nav works from the link.
      openCarouselWidget('daily-briefing', null);
      // Clean up the URL params
      searchParams.delete('briefing');
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, [isJTurner, searchParams, setSearchParams, openCarouselWidget]);

  // Register the carousel widget order. Order is recomputed when the
  // gating flags (isJTurner, canSeeNiki) change so optional widgets
  // appear/disappear consistently.
  const widgetOrderEntries = useDashboardCarouselWidgets();

  useEffect(() => {
    setCarouselOrder(widgetOrderEntries);
  }, [widgetOrderEntries, setCarouselOrder]);

  // Deep-link: open a carousel widget from ?widget=<id>. Ignored if the user
  // doesn't have access to that widget.
  useEffect(() => {
    let widgetParam = searchParams.get('widget');
    // Backstop: a deep link that targets a specific email thread/message
    // (e.g. the "Open email" link on a task created from email) implies
    // the Email widget should open even if `?widget=email` was omitted.
    // The thread/message params are intentionally NOT stripped here —
    // DealEmailsTab consumes and clears them once the inbox renders.
    if (!widgetParam && (searchParams.get('thread') || searchParams.get('message'))) {
      widgetParam = 'email';
    }
    if (!widgetParam) return;
    // Special-case: the Deals dialog isn't part of the carousel store —
    // it's a standalone modal opened from the Deals quick-action tile. We
    // route ?widget=deals (optionally with ?view=<sub-view>) here so users
    // can deep-link to e.g. the new Key Alerts page.
    if (widgetParam === 'deals') {
      const view = searchParams.get('view') as DealsCarouselView | null;
      setDealsInitialView(view ?? undefined);
      setDealsDialogOpen(true);
      searchParams.delete('widget');
      searchParams.delete('view');
      setSearchParams(searchParams, { replace: true });
      return;
    }
    if (widgetOrderEntries.length === 0) return; // wait until order is ready
    const isAllowed = widgetOrderEntries.some((w) => w.id === widgetParam);
    if (isAllowed) {
      openCarouselWidget(widgetParam, null);
    }
    // Always strip the param so reloads/back-button don't re-open it.
    searchParams.delete('widget');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, openCarouselWidget, widgetOrderEntries]);

  const handleDashboardTabChange = (tab: string) => {
    setDashboardTab(tab);
    if (tab === 'overview') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleLayoutChange = useCallback((newLayout: GridItem[]) => {
    if (!activePreset) return;
    updatePreset(activePreset.id, { grid_config: newLayout });
  }, [activePreset, updatePreset]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    if (!activePreset) return;
    // Find the widget and grid item before removing
    const widget = activePreset.widgets_config.find(w => w.id === widgetId);
    const gridItem = activePreset.grid_config.find(g => g.i === widgetId);
    if (!widget || !gridItem) {
      removeWidgetFromPreset(widgetId);
      return;
    }

    // Clear any existing undo timer
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }

    // Store for undo
    setPendingRemoval({ widgetId, widget, gridItem });

    // Remove immediately from UI
    removeWidgetFromPreset(widgetId);

    // Show undo toast (#13)
    toast('Widget removed', {
      description: `"${widget.title}" was removed.`,
      action: {
        label: 'Undo',
        onClick: () => {
          // Re-add the widget
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          setPendingRemoval(null);
          // Re-add widget and grid item
          updatePreset(activePreset.id, {
            grid_config: [...(activePreset.grid_config.filter(g => g.i !== widgetId)), gridItem],
            widgets_config: [...(activePreset.widgets_config.filter(w => w.id !== widgetId)), widget],
          });
        },
      },
      duration: 5000,
    });

    // Auto-commit after 5 seconds
    undoTimerRef.current = setTimeout(() => {
      setPendingRemoval(null);
    }, 5000);
  }, [removeWidgetFromPreset, activePreset, updatePreset]);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (!activePreset) return;
    const sorted = [...activePreset.grid_config].sort((a, b) => (a.y * 12 + a.x) - (b.y * 12 + b.x));
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    const updated = sorted.map((item, idx) => ({
      ...item,
      x: (idx % 2) * 6,
      y: Math.floor(idx / 2) * 4,
    }));
    updatePreset(activePreset.id, { grid_config: updated });
  }, [activePreset, updatePreset]);

  const handleAddBuiltIn = useCallback((widgetType: string) => {
    const def = WIDGET_REGISTRY[widgetType];
    if (!def) return;
    const widget: WidgetConfig = {
      id: widgetType,
      type: widgetType,
      title: def.label,
      config: {},
    };
    addWidgetToPreset(widget);
  }, [addWidgetToPreset]);

  const handleAddCustom = useCallback((widget: WidgetConfig) => {
    addWidgetToPreset(widget);
  }, [addWidgetToPreset]);

  const handleCreatePreset = useCallback((name: string) => {
    createPreset(name, [], [], true);
  }, [createPreset]);

  const handleCreateFromTemplate = useCallback((name: string, grid: GridItem[], widgets: WidgetConfig[]) => {
    createPreset(name, grid, widgets, true);
  }, [createPreset]);

  // Fix #2: Apply template to current dashboard instead of creating new
  const handleApplyTemplateToCurrentDashboard = useCallback((grid: GridItem[], widgets: WidgetConfig[]) => {
    if (!activePreset) return;
    updatePreset(activePreset.id, { grid_config: grid, widgets_config: widgets });
  }, [activePreset, updatePreset]);

  const handleRenamePreset = useCallback((presetId: string, name: string) => {
    updatePreset(presetId, { name });
  }, [updatePreset]);

  if (isLoading) {
    // Loading state mirrors the real layout so the dashboard feels fast:
    // hero greeting + a skeleton widgets row in place + a placeholder for
    // the Ask anything bar. No layout shift when real data arrives.
    const skeletonTileCount =
      4 /* base */ +
      1 /* always-on Deals tile */ +
      1 /* always-on Action Queue tile */ +
      (isJTurner ? 1 : 0) +
      (canSeeNiki ? 1 : 0) +
      (is5thLine ? 1 : 0);
    const skeletonGridColsClass =
      skeletonTileCount >= 8 ? 'grid-cols-4 sm:grid-cols-8'
      : skeletonTileCount === 7 ? 'grid-cols-4 sm:grid-cols-7'
      : skeletonTileCount === 6 ? 'grid-cols-3 sm:grid-cols-6'
      : skeletonTileCount === 5 ? 'grid-cols-3 sm:grid-cols-5'
      : skeletonTileCount === 4 ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-3';
    return (
      <div className="bg-transparent flex flex-col items-center px-3 sm:px-4 py-6 sm:py-8">
        <div className="w-full max-w-6xl space-y-4 sm:space-y-6">
          <div className="text-center space-y-2 pt-2">
            <p className="text-base sm:text-lg text-muted-foreground">
              {getTimeBasedGreeting()},{' '}
              <span className="whitespace-nowrap">{firstName}</span>
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif text-foreground">
              What can I do for you?
            </h1>
            <p className="text-sm text-muted-foreground/50 mt-1">
              Ask me anything about your deals, pipeline, lenders, or market research
            </p>
          </div>

          <div
            className={`grid items-stretch ${skeletonGridColsClass}`}
            style={{
              // Tile size scales fluidly with viewport width and the gap
              // scales proportionally with tile size so the grid feels
              // designed at every breakpoint.
              ['--tile-size' as any]: 'clamp(64px, 11vw, 112px)',
              gap: 'calc(var(--tile-size) * 0.18)',
            }}
            aria-busy="true"
            aria-label="Loading dashboard widgets"
          >
            {Array.from({ length: skeletonTileCount }).map((_, i) => (
              <WidgetTileSkeleton key={i} />
            ))}
          </div>

          <Skeleton className="h-14 w-full rounded-2xl" />

          <div className="space-y-3">
            <Skeleton className="h-9 w-64" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - naitive</title>
        <meta name="description" content="Your personal dashboard for managing deals and workflows." />
      </Helmet>

      <div className="bg-transparent flex flex-col items-center px-3 sm:px-4 py-3 sm:py-4">
        <div className="w-full max-w-6xl space-y-2 sm:space-y-3">
          {/* Hero: Greeting + AI Input + Quick Actions */}
          <div className="text-center space-y-1 pt-1">
            <p className="text-base sm:text-lg text-muted-foreground">{getTimeBasedGreeting()}, <span className="whitespace-nowrap">{firstName}</span></p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif text-foreground">What can I do for you?</h1>
            <p className="text-sm text-muted-foreground/50">Ask me anything about your deals, pipeline, lenders, or market research</p>
          </div>

          <HintTooltip
            hint="Use these quick actions to open your calendar, email, quick prompts, or create a new deal — all without leaving the dashboard."
            visible={isHintVisible('dashboard-quick-actions')}
            onDismiss={() => dismissHint('dashboard-quick-actions')}
            side="bottom"
          >
          {(() => {
            // Quick Prompts is now a tile too (4 base tiles).
            // Niki's Daily Rundown renders in the top row for every user
            // who is allowed to see it (jturner included). For jturner the
            // tiles are also reordered via Tailwind `order-*` classes.
            const nikiInTopRow = canSeeNiki;
            // Base tiles: Calendar + Email + Action Queue + Deals (AI insights).
            // New Deal moved to the dashboard action row next to Templates.
            const tileCount = 4 + (isJTurner ? 1 : 0) + (nikiInTopRow ? 1 : 0) + (is5thLine ? 1 : 0);
            const gridColsClass =
              tileCount >= 8 ? 'grid-cols-4 sm:grid-cols-8'
              : tileCount === 7 ? 'grid-cols-4 sm:grid-cols-7'
              : tileCount === 6 ? 'grid-cols-3 sm:grid-cols-6'
              : tileCount === 5 ? 'grid-cols-3 sm:grid-cols-5'
              : tileCount === 4 ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-3';
            return (
          <>
          <div
            className={`grid items-stretch ${gridColsClass}`}
            style={{
              // See skeleton block above — single source of truth for the
              // responsive tile-size + proportional gap.
              ['--tile-size' as any]: 'clamp(64px, 11vw, 112px)',
              gap: 'calc(var(--tile-size) * 0.18)',
            }}
          >
            <QuickActionTile
              label="Calendar"
              icon={CalendarIcon}
              category="inbox"
              className={cn(isJTurner && 'order-1')}
              onClick={(e) => openCarouselWidget('calendar', e.currentTarget as HTMLElement)}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('calendar', e.currentTarget as HTMLElement),
                )
              }
            />
            <EmailTileWithIntelligence
              className={isJTurner ? 'order-2' : undefined}
              onOpen={(el) => {
                // Perf: time the click → first paint window so we can
                // verify the eager-import + prefetch keep this instant.
                if (typeof performance !== 'undefined') {
                  performance.mark('inbox:open-click');
                  // eslint-disable-next-line no-console
                  console.time('[InboxOpen] click → first paint');
                }
                openCarouselWidget('email', el);
              }}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () => {
                  if (typeof performance !== 'undefined') {
                    performance.mark('inbox:open-click');
                    // eslint-disable-next-line no-console
                    console.time('[InboxOpen] click → first paint');
                  }
                  openCarouselWidget('email', e.currentTarget as HTMLElement);
                })
              }
            />
            {/* Action Queue tile — first-class quick-action sibling to
                Calendar/Email/Deals. Click opens the queue modal so deferred
                AI suggestions are one tap away from the dashboard hero. */}
            <QuickActionTile
              label="Action Queue"
              icon={InboxIcon}
              category="inbox"
              ariaLabel={`Open Action Queue${actionQueueCount > 0 ? `, ${actionQueueCount} pending` : ''}`}
              badgeCount={actionQueueCount}
              className={cn(isJTurner && 'order-3')}
              onClick={openActionQueue}
              onKeyDown={(e) => handleTileKeyDown(e, openActionQueue)}
            />
            {isJTurner && (
              <QuickActionTile
                label="Daily Rundown"
                icon={Newspaper}
                category="reports"
                className="order-5"
                onClick={(e) => openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement)}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement),
                  )
                }
              />
            )}
            {nikiInTopRow && (
              <QuickActionTile
                label={isNikiViewingHerself ? 'My Daily Rundown' : "Niki's Daily Rundown"}
                icon={Newspaper}
                category="reports"
                className={cn(isJTurner && 'order-6')}
                onClick={(e) => openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement)}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement),
                  )
                }
              />
            )}
            {/* Deals tile — opens the AI-powered Deals insights carousel.
                Placed immediately to the right of Niki's Daily Rundown. */}
            <QuickActionTile
              label="Deals"
              icon={Handshake}
              category="pipeline"
              ariaLabel="Open Deals insights"
              className={cn(isJTurner && 'order-7')}
              onClick={() => setDealsDialogOpen(true)}
              onKeyDown={(e) => handleTileKeyDown(e, () => setDealsDialogOpen(true))}
            />
            {is5thLine && (
              <QuickActionTile
                label="Deal Rundown"
                icon={Briefcase}
                category="pipeline"
                className={cn(isJTurner && 'order-4')}
                onClick={(e) => openCarouselWidget('deal-rundown', e.currentTarget as HTMLElement)}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('deal-rundown', e.currentTarget as HTMLElement),
                  )
                }
              />
            )}
          </div>
          </>
            );
          })()}
          </HintTooltip>

          {/* ─── Dashboard navigation ──────────────────────────────────
              Single navigation row: preset tabs (My Dashboard, …)
              followed by a sibling
              "News Feed" tab. The Edit / Templates / New buttons live
              in a separate, visually distinct action row below. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pb-2">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0">
              <PresetManager
                presets={presets}
                activePreset={dashboardTab === 'news-feed' ? null : activePreset}
                onSwitch={(id) => {
                  // Switching to a preset implicitly returns to overview.
                  if (dashboardTab === 'news-feed') handleDashboardTabChange('overview');
                  switchPreset(id);
                }}
                onCreate={handleCreatePreset}
                onDuplicate={duplicatePreset}
                onDelete={deletePreset}
                onRename={handleRenamePreset}
                hideNewButton
              />
              <button
                type="button"
                onClick={() => handleDashboardTabChange(dashboardTab === 'news-feed' ? 'overview' : 'news-feed')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0',
                  dashboardTab === 'news-feed'
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
                aria-pressed={dashboardTab === 'news-feed'}
              >
                <Newspaper className="h-3 w-3" />
                News Feed
              </button>
              {canSeePerformance && (
                <button
                  type="button"
                  onClick={() =>
                    handleDashboardTabChange(dashboardTab === 'performance' ? 'overview' : 'performance')
                  }
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0',
                    dashboardTab === 'performance'
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                  aria-pressed={dashboardTab === 'performance'}
                >
                  <Briefcase className="h-3 w-3" />
                  Performance
                </button>
              )}
              <NewPresetButton onCreate={handleCreatePreset} className="ml-1" />
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
              {isSaving && (
                <span className="text-[11px] text-muted-foreground animate-pulse shrink-0">Saving…</span>
              )}
              {dashboardTab !== 'news-feed' && dashboardTab !== 'performance' && (
                <>
                  <DashboardTemplatesDialog
                    mode="replace"
                    onSelectTemplate={handleCreateFromTemplate}
                    onApplyToCurrentDashboard={handleApplyTemplateToCurrentDashboard}
                  />
                  {isEditing && activePreset && (
                    <Suspense fallback={null}>
                      <AddWidgetDialog
                        existingWidgetIds={activePreset.widgets_config.map(w => w.id)}
                        onAddBuiltIn={handleAddBuiltIn}
                        onAddCustom={handleAddCustom}
                      />
                    </Suspense>
                  )}
                  <HintTooltip
                    hint="Click 'Edit' to customize your dashboard — add, remove, or rearrange widgets to match your workflow."
                    visible={isHintVisible('dashboard-edit')}
                    onDismiss={() => dismissHint('dashboard-edit')}
                    side="left"
                  >
                    <Button
                      variant={isEditing ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      {isEditing ? 'Done' : 'Edit'}
                    </Button>
                  </HintTooltip>
                </>
              )}
            </div>
          </div>

          {dashboardTab === 'performance' ? (
            <NikiPerformanceTab />
          ) : dashboardTab !== 'news-feed' ? (
            <>
              {/* Grid */}
              {activePreset && activePreset.widgets_config.length > 0 && (
                <div className="mt-4">
                  <DashboardGrid
                    gridConfig={activePreset.grid_config}
                    widgetsConfig={activePreset.widgets_config}
                    isEditing={isEditing}
                    onLayoutChange={handleLayoutChange}
                    onRemoveWidget={handleRemoveWidget}
                    onReorder={handleReorder}
                  />
                </div>
              )}

              {/* Empty state */}
              {activePreset && activePreset.widgets_config.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Settings2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">No widgets yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start with a template or click "Start Editing" to add widgets manually.
                  </p>
                  <div className="flex items-center gap-2">
                    <DashboardTemplatesDialog
                      mode="replace"
                      onSelectTemplate={handleCreateFromTemplate}
                      onApplyToCurrentDashboard={handleApplyTemplateToCurrentDashboard}
                      trigger={
                        <Button variant="default" size="sm">
                          <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
                          Browse Templates
                        </Button>
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Start Editing
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4">
              <NewsFeedPanel />
            </div>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────
        Carousel-driven widget pop-ups.

        Each widget keeps its existing Dialog wrapper and styling. The
        shared `WidgetCarouselChrome` overlay renders persistent
        navigation controls (arrows, header, indicator) on top, so users
        can swipe / arrow between widgets without ever closing the
        modal experience.
      ──────────────────────────────────────────────────────────────── */}
      {/*
        IMPORTANT: Only mount the active widget's Dialog at any given time.

        Previously every widget Dialog was always mounted with
        `open={isWidgetActive(id)}` and a shared onOpenChange handler that
        closed the carousel when `open` flipped to false. That caused arrow
        navigation to dismiss the modal entirely: pressing → on Calendar
        flipped Calendar's `open` from true to false, which fired Radix's
        onOpenChange(false) and triggered closeCarousel() before Email
        could open.

        By conditionally rendering only the active widget, switching tabs
        unmounts the previous Dialog (no onOpenChange fires on unmount) and
        mounts the next one already open. The carousel only closes via the
        widget's own X / Esc / backdrop, which still calls
        handleCarouselDialogOpenChange(false).
      */}
      {/* Lazy-loaded modal shells. fallback={null} keeps the dashboard
          paint instant; each modal renders its own skeleton/loader once
          its chunk arrives. */}
      <Suspense fallback={null}>
        {isWidgetActive('calendar') && (
          <FullCalendarView open onOpenChange={handleCarouselDialogOpenChange} />
        )}
        {isWidgetActive('email') && (
          <InboxDialog open onOpenChange={handleCarouselDialogOpenChange} />
        )}
        {isJTurner && isWidgetActive('daily-briefing') && (
          <DailyBriefingModal open onOpenChange={handleCarouselDialogOpenChange} briefingType="daily_briefing" />
        )}
        {canSeeNiki && isWidgetActive('niki-briefing') && (
          <DailyBriefingModal
            open
            onOpenChange={handleCarouselDialogOpenChange}
            title={isNikiViewingHerself ? 'My Daily Rundown' : "Niki's Daily Rundown"}
            targetUserId={NIKI_USER_ID}
            targetAssigneeName={NIKI_ASSIGNEE_NAME}
            excludeTabs={['financial']}
            briefingType="niki_daily_briefing"
          />
        )}
        {is5thLine && isWidgetActive('deal-rundown') && (
          <DailyBriefingModal
            open
            onOpenChange={handleCarouselDialogOpenChange}
            title="Deal Rundown"
            initialTab="pipeline"
            briefingType="deal_rundown"
          />
        )}
        <WidgetCarouselChrome />
        {dealsDialogOpen && (
          <DealsCarouselDialog
            open={dealsDialogOpen}
            onOpenChange={(next) => {
              setDealsDialogOpen(next);
              if (!next) setDealsInitialView(undefined);
            }}
            initialView={dealsInitialView}
          />
        )}
      </Suspense>
      <Dialog open={actionQueueOpen} onOpenChange={setActionQueueOpen}>
        <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden flex flex-col max-h-[80vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Action Queue</DialogTitle>
          </DialogHeader>
          <ActionQueuePanel items={actionQueueItems} onClose={() => setActionQueueOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
