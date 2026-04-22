import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { Settings2, Pencil, Check, Calendar as CalendarIcon, Mail, Briefcase, LayoutTemplate, Newspaper } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';
import { InboxDialog } from '@/components/dashboard/InboxDialog';
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
}: {
  onOpen: (el: HTMLElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
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
      className="relative"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={(e) => {
        // Only close if focus actually leaves the wrapper subtree
        if (!e.currentTarget.contains(e.relatedTarget as Node)) scheduleClose();
      }}
    >
      <Card
        className={TILE_INTERACTIVE_CLASSES}
        onClick={(e) => onOpen(e.currentTarget as HTMLElement)}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="flex flex-col items-center text-center space-y-3">
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
        <div className="rounded-xl border border-border/40 bg-popover/95 shadow-xl backdrop-blur-xl">
          <EmailIntelligenceWidget />
        </div>
      </div>
    </div>
  );
}

import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DashboardTemplatesDialog } from '@/components/dashboard/DashboardTemplates';
import { FullCalendarView } from '@/components/dashboard/FullCalendarView';
import { NewsFeedPanel } from '@/components/dashboard/NewsFeedPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  canSeeNikiBriefing,
  NIKI_USER_ID,
  NIKI_ASSIGNEE_NAME,
  NIKI_EMAIL,
} from '@/constants/nikiBriefing';

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
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  // #24: Always compute firstName regardless of sidebar state
  const firstName = profile?.first_name || (profile?.display_name ? profile.display_name.split(' ')[0] : '') || 'there';
  // Track recently removed widgets for undo (#13)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ widgetId: string; widget: WidgetConfig; gridItem: GridItem } | null>(null);

  // Sync tab from URL query params
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'news-feed') setDashboardTab('news-feed');
  }, [searchParams]);

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
  const widgetOrderEntries = useMemo(() => {
    const entries: { id: string; label: string }[] = [
      { id: 'calendar', label: 'Calendar' },
      { id: 'email', label: 'Email' },
      { id: 'new-deal', label: 'New Deal' },
    ];
    if (isJTurner) entries.push({ id: 'daily-briefing', label: 'Daily Briefing' });
    if (canSeeNiki) {
      entries.push({
        id: 'niki-briefing',
        label: isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing",
      });
    }
    if (is5thLine) {
      entries.push({ id: 'deal-rundown', label: 'Deal Rundown' });
    }
    return entries;
  }, [isJTurner, canSeeNiki, isNikiViewingHerself, is5thLine]);

  useEffect(() => {
    setCarouselOrder(widgetOrderEntries);
  }, [widgetOrderEntries, setCarouselOrder]);

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
    return (
      <div className="px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
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
            <p className="text-sm text-muted-foreground/50 mt-1">Ask me anything about your deals, pipeline, lenders, or market research</p>
          </div>

          <DashboardAIInput />

          <HintTooltip
            hint="Use these quick actions to open your calendar, email, quick prompts, or create a new deal — all without leaving the dashboard."
            visible={isHintVisible('dashboard-quick-actions')}
            onDismiss={() => dismissHint('dashboard-quick-actions')}
            side="bottom"
          >
          {(() => {
            // Quick Prompts is now a tile too (4 base tiles).
            // For jturner@5thline.co specifically, Niki's Daily Briefing is
            // pulled OUT of the top row and stacked under the Calendar tile
            // on its own row below. Other users keep the existing layout.
            const nikiInTopRow = canSeeNiki && !isJTurner;
            const tileCount = 4 + (isJTurner ? 1 : 0) + (nikiInTopRow ? 1 : 0) + (is5thLine ? 1 : 0);
            const gridColsClass =
              tileCount >= 7 ? 'grid-cols-4 sm:grid-cols-7'
              : tileCount === 6 ? 'grid-cols-3 sm:grid-cols-6'
              : tileCount === 5 ? 'grid-cols-3 sm:grid-cols-5'
              : tileCount === 4 ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-3';
            return (
          <>
          <div className={`grid gap-3 md:gap-4 ${gridColsClass}`}>
            <Card
              className={TILE_INTERACTIVE_CLASSES}
              onClick={(e) => openCarouselWidget('calendar', e.currentTarget as HTMLElement)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('calendar', e.currentTarget as HTMLElement),
                )
              }
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-12 w-12 rounded-xl border border-primary/30 bg-primary/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <CalendarIcon className="relative z-10 h-7 w-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Calendar</span>
              </div>
            </Card>
            <EmailTileWithIntelligence
              onOpen={(el) => openCarouselWidget('email', el)}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('email', e.currentTarget as HTMLElement),
                )
              }
            />
            <Card
              className={TILE_INTERACTIVE_CLASSES}
              onClick={(e) => openCarouselWidget('new-deal', e.currentTarget as HTMLElement)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                handleTileKeyDown(e, () =>
                  openCarouselWidget('new-deal', e.currentTarget as HTMLElement),
                )
              }
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-12 w-12 rounded-xl border border-accent/30 bg-accent/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                  <Briefcase className="relative z-10 h-7 w-7 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">New Deal</span>
              </div>
            </Card>
            {isJTurner && (
              <Card
                className={TILE_INTERACTIVE_CLASSES}
                onClick={(e) => openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement),
                  )
                }
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative h-12 w-12 rounded-xl border border-warning/30 bg-warning/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                    <Newspaper className="relative z-10 h-7 w-7 text-warning" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Daily Briefing</span>
                </div>
              </Card>
            )}
            {canSeeNiki && (
              <Card
                className={TILE_INTERACTIVE_CLASSES}
                onClick={(e) => openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement),
                  )
                }
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative h-12 w-12 rounded-xl border border-[hsl(190,90%,55%,0.4)] bg-[hsl(190,90%,45%,0.18)] backdrop-blur-sm flex items-center justify-center overflow-hidden">
                    <Newspaper className="relative z-10 h-7 w-7 text-[hsl(190,90%,70%)]" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing"}
                  </span>
                </div>
              </Card>
            )}
            {is5thLine && (
              <Card
                className={TILE_INTERACTIVE_CLASSES}
                onClick={(e) => openCarouselWidget('deal-rundown', e.currentTarget as HTMLElement)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  handleTileKeyDown(e, () =>
                    openCarouselWidget('deal-rundown', e.currentTarget as HTMLElement),
                  )
                }
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative h-12 w-12 rounded-xl border border-primary/30 bg-primary/15 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                    <Briefcase className="relative z-10 h-7 w-7 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Deal Rundown</span>
                </div>
              </Card>
            )}
          </div>
            );
          })()}
          </HintTooltip>

          {/* Dashboard Tabs */}
          <Tabs value={dashboardTab} onValueChange={handleDashboardTabChange}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="news-feed" className="gap-1.5">
                <Newspaper className="h-3.5 w-3.5" />
                News Feed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              {/* Header row: Edit button */}
              <div className="flex items-center justify-between">
                <div />
                <div className="flex items-center gap-2">
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
                </div>
              </div>

              {/* Preset tabs + Add Widget */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mt-4">
                <PresetManager
                  presets={presets}
                  activePreset={activePreset}
                  onSwitch={switchPreset}
                  onCreate={handleCreatePreset}
                  onDuplicate={duplicatePreset}
                  onDelete={deletePreset}
                  onRename={handleRenamePreset}
                />
                <div className="flex items-center gap-2 shrink-0">
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
            </TabsContent>

            <TabsContent value="news-feed">
              <NewsFeedPanel />
            </TabsContent>
          </Tabs>
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
    </>
  );
}
