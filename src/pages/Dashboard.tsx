import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { Settings2, Pencil, Check, Calendar as CalendarIcon, Mail, Briefcase, LayoutTemplate, Newspaper, Handshake } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';
import { InboxDialog } from '@/components/dashboard/InboxDialog';
import { DealsCarouselDialog, DealsCarouselView } from '@/components/dashboard/DealsCarouselDialog';
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
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { AddWidgetDialog } from '@/components/dashboard/AddWidgetDialog';
import { DashboardAIInput } from '@/components/dashboard/DashboardAIInput';
import { EmailIntelligenceWidget } from '@/components/dashboard/EmailIntelligenceWidget';
import { cn } from '@/lib/utils';

/**
 * Shared interaction styles for the dashboard widget tiles
 * (Calendar, Email, New Deal, Daily Briefing, Niki's Daily Briefing).
 *
 * Hover and focus only adjust the translucent glass background and border.
 * No glow, no drop shadow, no scale — we explicitly override the default
 * dark-mode hover shadow from `<Card>` via `dark:hover:shadow-none`.
 */
const TILE_INTERACTIVE_CLASSES =
  'p-4 cursor-pointer outline-none transition-colors duration-150 ' +
  // Hover: subtle glass tint + slightly brighter border
  'hover:bg-foreground/[0.04] hover:border-border/60 ' +
  // Kill the default Card dark-mode hover shadow/glow
  'hover:shadow-none dark:hover:shadow-none ' +
  // Keyboard focus: same surface change + ring on the border
  'focus-visible:bg-foreground/[0.06] focus-visible:border-border/70 ' +
  'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0';

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
    <Card className="p-4 h-full" aria-hidden="true">
      <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-3.5 w-20" />
      </div>
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

  const open = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setIsHovering(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsHovering(false), 120);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <div
      className={cn('relative h-full', className)}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={(e) => {
        // Only close if focus actually leaves the wrapper subtree
        if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
      }}
    >
      <Card
        className={cn(TILE_INTERACTIVE_CLASSES, 'h-full overflow-hidden')}
        onClick={(e) => onOpen(e.currentTarget as HTMLElement)}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
          <div className="relative h-12 w-12 rounded-xl border border-[hsl(280,85%,65%,0.55)] bg-[hsl(275,80%,40%,0.3)] backdrop-blur-xl flex items-center justify-center overflow-hidden">
            <Mail className="relative z-10 h-7 w-7 text-foreground" />
          </div>
          <span className="text-sm font-medium text-foreground">Email</span>
        </div>
      </Card>

      {/*
        Hover-anchored Email Intelligence panel.
        - Absolutely positioned so it overlays/sits adjacent to this tile
          rather than reflowing the dashboard.
        - Visibility is gated on hover/focus state of the tile or panel.
        - Suppressed on touch / no-hover devices via media query.
      */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-[360px] max-w-[92vw] -translate-x-1/2',
          'transition-all duration-150 ease-out',
          '[@media(hover:none)]:hidden',
          isHovering
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : '-translate-y-1 opacity-0',
        )}
        role="region"
        aria-label="Email Intelligence"
        aria-hidden={!isHovering}
      >
        <div className="rounded-xl border border-border/40 bg-popover/95 shadow-xl backdrop-blur-xl flex flex-col max-h-[360px] overflow-hidden">
          <EmailIntelligenceWidget />
        </div>
      </div>
    </div>
  );
}

import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DashboardTemplatesDialog } from '@/components/dashboard/DashboardTemplates';
import { FullCalendarView } from '@/components/dashboard/FullCalendarView';
import { NewsFeedDialog } from '@/components/dashboard/NewsFeedDialog';
import { toast } from 'sonner';
import {
  canSeeNikiBriefing,
  NIKI_USER_ID,
  NIKI_ASSIGNEE_NAME,
  NIKI_EMAIL,
} from '@/constants/nikiBriefing';
import { useDashboardCarouselWidgets } from '@/hooks/useDashboardCarouselWidgets';

export default function Dashboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isJTurner = user?.email === 'jturner@5thline.co';
  const canSeeNiki = canSeeNikiBriefing(user?.email);
  const isNikiViewingHerself = user?.email?.toLowerCase() === NIKI_EMAIL;
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
  const [newsFeedDialogOpen, setNewsFeedDialogOpen] = useState(false);
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
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  // #24: Always compute firstName regardless of sidebar state
  const firstName = profile?.first_name || (profile?.display_name ? profile.display_name.split(' ')[0] : '') || 'there';
  // Track recently removed widgets for undo (#13)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ widgetId: string; widget: WidgetConfig; gridItem: GridItem } | null>(null);
  const [dealsDialogOpen, setDealsDialogOpen] = useState(false);
  const [dealsInitialView, setDealsInitialView] = useState<DealsCarouselView | undefined>(undefined);

  // Backwards-compat deep link: previously the News Feed lived under
  // ?tab=news-feed. It is now a popup, so we open the dialog and strip the
  // legacy param so back/refresh doesn't reopen it unexpectedly.
  useEffect(() => {
    if (searchParams.get('tab') === 'news-feed') {
      setNewsFeedDialogOpen(true);
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Auto-open Daily Briefing from email link (?briefing=true)
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
    const widgetParam = searchParams.get('widget');
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
          </div>

          <div
            className={`grid items-stretch gap-3 md:gap-4 ${skeletonGridColsClass}`}
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

      <div className="bg-transparent flex flex-col items-center px-3 sm:px-4 py-6 sm:py-8">
        <div className="w-full max-w-6xl space-y-4 sm:space-y-6">
          {/* Hero: Greeting + AI Input + Quick Actions */}
          <div className="text-center space-y-2 pt-2">
            <p className="text-base sm:text-lg text-muted-foreground">{getTimeBasedGreeting()}, <span className="whitespace-nowrap">{firstName}</span></p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif text-foreground">What can I do for you?</h1>
          </div>

          <HintTooltip
            hint="Use these quick actions to open your calendar, email, quick prompts, or create a new deal — all without leaving the dashboard."
            visible={isHintVisible('dashboard-quick-actions')}
            onDismiss={() => dismissHint('dashboard-quick-actions')}
            side="bottom"
          >
          {(() => {
            // Quick Prompts is now a tile too (4 base tiles).
            // Niki's Daily Briefing renders in the top row for every user
            // who is allowed to see it (jturner included). For jturner the
            // tiles are also reordered via Tailwind `order-*` classes.
            const nikiInTopRow = canSeeNiki;
            // +1 for the always-on "Deals" tile that opens the AI insights carousel.
            const tileCount = 4 + 1 + (isJTurner ? 1 : 0) + (nikiInTopRow ? 1 : 0) + (is5thLine ? 1 : 0);
            const gridColsClass =
              tileCount >= 8 ? 'grid-cols-4 sm:grid-cols-8'
              : tileCount === 7 ? 'grid-cols-4 sm:grid-cols-7'
              : tileCount === 6 ? 'grid-cols-3 sm:grid-cols-6'
              : tileCount === 5 ? 'grid-cols-3 sm:grid-cols-5'
              : tileCount === 4 ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-3';
            return (
          <>
          <div className={`grid items-stretch gap-3 md:gap-4 ${gridColsClass}`}>
            <Card
              className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', isJTurner && 'order-1')}
              onClick={(e) => openCarouselWidget('calendar', e.currentTarget as HTMLElement)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('calendar', e.currentTarget as HTMLElement),
                )
              }
            >
              <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                <div className="relative h-12 w-12 rounded-xl border border-primary/30 bg-primary/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <CalendarIcon className="relative z-10 h-7 w-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Calendar</span>
              </div>
            </Card>
            <EmailTileWithIntelligence
              className={isJTurner ? 'order-2' : undefined}
              onOpen={(el) => openCarouselWidget('email', el)}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('email', e.currentTarget as HTMLElement),
                )
              }
            />
            <Card
              className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', isJTurner && 'order-4')}
              onClick={(e) => openCarouselWidget('new-deal', e.currentTarget as HTMLElement)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('new-deal', e.currentTarget as HTMLElement),
                )
              }
            >
              <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                <div className="relative h-12 w-12 rounded-xl border border-accent/30 bg-accent/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <Briefcase className="relative z-10 h-7 w-7 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">New Deal</span>
              </div>
            </Card>
            {isJTurner && (
              <Card
                className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', 'order-5')}
                onClick={(e) => openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement),
                  )
                }
              >
                <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                  <div className="relative h-12 w-12 rounded-xl border border-warning/30 bg-warning/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                    <Newspaper className="relative z-10 h-7 w-7 text-warning" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Daily Briefing</span>
                </div>
              </Card>
            )}
            {nikiInTopRow && (
              <Card
                className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', isJTurner && 'order-6')}
                onClick={(e) => openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement),
                  )
                }
              >
                <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                  <div className="relative h-12 w-12 rounded-xl border border-[hsl(190,90%,55%,0.4)] bg-[hsl(190,90%,45%,0.18)] backdrop-blur-sm flex items-center justify-center overflow-hidden">
                    <Newspaper className="relative z-10 h-7 w-7 text-[hsl(190,90%,70%)]" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing"}
                  </span>
                </div>
              </Card>
            )}
            {/* Deals tile — opens the AI-powered Deals insights carousel.
                Placed immediately to the right of Niki's Daily Briefing. */}
            <Card
              className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', isJTurner && 'order-7')}
              onClick={() => setDealsDialogOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleTileKeyDown(e, () => setDealsDialogOpen(true))}
              aria-label="Open Deals insights"
            >
              <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                <div className="relative h-12 w-12 rounded-xl border border-emerald-500/30 bg-emerald-500/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <Handshake className="relative z-10 h-7 w-7 text-emerald-400" />
                </div>
                <span className="text-sm font-medium text-foreground">Deals</span>
              </div>
            </Card>
            {is5thLine && (
              <Card
                className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', isJTurner && 'order-3')}
                onClick={(e) => openCarouselWidget('deal-rundown', e.currentTarget as HTMLElement)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('deal-rundown', e.currentTarget as HTMLElement),
                  )
                }
              >
                <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                  <div className="relative h-12 w-12 rounded-xl border border-primary/30 bg-primary/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                    <Briefcase className="relative z-10 h-7 w-7 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Deal Rundown</span>
                </div>
              </Card>
            )}
            {/* News Feed tile — opens the News Feed in a popup overlay,
                replacing the previous Overview/News Feed tab control. */}
            <Card
              className={cn(TILE_INTERACTIVE_CLASSES, 'h-full', isJTurner && 'order-8')}
              onClick={() => setNewsFeedDialogOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => handleTileKeyDown(e, () => setNewsFeedDialogOpen(true))}
              aria-label="Open News Feed"
            >
              <div className="flex flex-col items-center justify-center text-center space-y-3 h-full">
                <div className="relative h-12 w-12 rounded-xl border border-sky-500/30 bg-sky-500/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <Newspaper className="relative z-10 h-7 w-7 text-sky-400" />
                </div>
                <span className="text-sm font-medium text-foreground">News Feed</span>
              </div>
            </Card>
          </div>
          </>
            );
          })()}
          </HintTooltip>

          <div className="-mt-2 sm:-mt-4">
            <DashboardAIInput />
          </div>

          {/* Dashboard overview — the previous Overview/News Feed tab control
              was removed. News Feed now lives in a popup launched from the
              quick-action tile row above. */}
          <div>
              {/* Preset tabs + Add Widget */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <PresetManager
                  presets={presets}
                  activePreset={activePreset}
                  onSwitch={switchPreset}
                  onCreate={handleCreatePreset}
                  onDuplicate={duplicatePreset}
                  onDelete={deletePreset}
                  onRename={handleRenamePreset}
                />
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isSaving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
                  <HintTooltip
                    hint="Click 'Edit' to customize your dashboard — add, remove, or rearrange widgets to match your workflow."
                    visible={isHintVisible('dashboard-edit')}
                    onDismiss={() => dismissHint('dashboard-edit')}
                    side="left"
                  >
                    <Button
                      variant={isEditing ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      {isEditing ? 'Done' : 'Edit'}
                    </Button>
                  </HintTooltip>
                  <DashboardTemplatesDialog
                    mode="replace"
                    onSelectTemplate={handleCreateFromTemplate}
                    onApplyToCurrentDashboard={handleApplyTemplateToCurrentDashboard}
                  />
                  {isEditing && activePreset && (
                    <AddWidgetDialog
                      existingWidgetIds={activePreset.widgets_config.map(w => w.id)}
                      onAddBuiltIn={handleAddBuiltIn}
                      onAddCustom={handleAddCustom}
                    />
                  )}
                </div>
              </div>

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
          </div>
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
      {isWidgetActive('calendar') && (
        <FullCalendarView open onOpenChange={handleCarouselDialogOpenChange} />
      )}
      {isWidgetActive('email') && (
        <InboxDialog open onOpenChange={handleCarouselDialogOpenChange} />
      )}
      {isWidgetActive('new-deal') && (
        <CreateDealDialog open onOpenChange={handleCarouselDialogOpenChange} />
      )}
      {isJTurner && isWidgetActive('daily-briefing') && (
        <DailyBriefingModal open onOpenChange={handleCarouselDialogOpenChange} />
      )}
      {canSeeNiki && isWidgetActive('niki-briefing') && (
        <DailyBriefingModal
          open
          onOpenChange={handleCarouselDialogOpenChange}
          title={isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing"}
          targetUserId={NIKI_USER_ID}
          targetAssigneeName={NIKI_ASSIGNEE_NAME}
          excludeTabs={['financial']}
        />
      )}
      {is5thLine && isWidgetActive('deal-rundown') && (
        <DailyBriefingModal
          open
          onOpenChange={handleCarouselDialogOpenChange}
          title="Deal Rundown"
          initialTab="pipeline"
        />
      )}
      <WidgetCarouselChrome />
      <DealsCarouselDialog
        open={dealsDialogOpen}
        onOpenChange={(next) => {
          setDealsDialogOpen(next);
          if (!next) setDealsInitialView(undefined);
        }}
        initialView={dealsInitialView}
      />
      <NewsFeedDialog open={newsFeedDialogOpen} onOpenChange={setNewsFeedDialogOpen} />
    </>
  );
}
