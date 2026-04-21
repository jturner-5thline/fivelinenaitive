import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { Settings2, Pencil, Check, Calendar as CalendarIcon, Mail, Briefcase, LayoutTemplate, Newspaper, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';
import { InboxDialog } from '@/components/dashboard/InboxDialog';
import { QuickPromptsDialog } from '@/components/dashboard/QuickPromptsDialog';
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
      { id: 'quick-prompts', label: 'Quick Prompts' },
    ];
    if (isJTurner) entries.push({ id: 'daily-briefing', label: 'Daily Briefing' });
    if (canSeeNiki) {
      entries.push({
        id: 'niki-briefing',
        label: isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing",
      });
    }
    return entries;
  }, [isJTurner, canSeeNiki, isNikiViewingHerself]);

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
            const tileCount = 4 + (isJTurner ? 1 : 0) + (canSeeNiki ? 1 : 0);
            const gridColsClass =
              tileCount >= 6 ? 'grid-cols-3 sm:grid-cols-6'
              : tileCount === 5 ? 'grid-cols-3 sm:grid-cols-5'
              : tileCount === 4 ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-3';
            return (
          <div className={`grid gap-3 md:gap-4 ${gridColsClass}`}>
            <Card
              className="p-4 cursor-pointer transition-all duration-150 hover:bg-muted/10 hover:scale-[1.02] hover:border-border/40 active:scale-[0.98]"
              onClick={(e) => openCarouselWidget('calendar', e.currentTarget as HTMLElement)}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-12 w-12 rounded-xl border border-primary/30 bg-primary/15 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[0_0_12px_hsl(var(--primary)/0.2),inset_0_1px_1px_hsl(var(--primary)/0.15)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-primary/20 before:to-transparent before:rounded-xl">
                  <CalendarIcon className="relative z-10 h-7 w-7 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Calendar</span>
              </div>
            </Card>
            <Card
              className="p-4 cursor-pointer transition-all duration-150 hover:bg-muted/10 hover:scale-[1.02] hover:border-border/40 active:scale-[0.98]"
              onClick={(e) => openCarouselWidget('email', e.currentTarget as HTMLElement)}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-12 w-12 rounded-xl border border-[hsl(280,85%,65%,0.55)] bg-[hsl(275,80%,40%,0.3)] backdrop-blur-xl flex items-center justify-center overflow-hidden shadow-[inset_0_1px_1px_hsl(280,85%,75%,0.35),0_4px_24px_hsl(275,80%,45%,0.4)] before:absolute before:inset-0 before:bg-[linear-gradient(135deg,hsl(280,85%,75%,0.3)_0%,transparent_50%,hsl(275,80%,40%,0.15)_100%)] before:rounded-xl">
                  <Mail className="relative z-10 h-7 w-7 text-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Email</span>
              </div>
            </Card>
            <Card
              className="p-4 cursor-pointer transition-all duration-150 hover:bg-muted/10 hover:scale-[1.02] hover:border-border/40 active:scale-[0.98]"
              onClick={(e) => openCarouselWidget('new-deal', e.currentTarget as HTMLElement)}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-12 w-12 rounded-xl border border-accent/30 bg-accent/15 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[0_0_12px_hsl(var(--accent)/0.2),inset_0_1px_1px_hsl(var(--accent)/0.15)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-accent/20 before:to-transparent before:rounded-xl">
                  <Briefcase className="relative z-10 h-7 w-7 text-accent-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">New Deal</span>
              </div>
            </Card>
            <Card
              className="p-4 cursor-pointer transition-all duration-150 hover:bg-muted/10 hover:scale-[1.02] hover:border-border/40 active:scale-[0.98]"
              onClick={(e) => openCarouselWidget('quick-prompts', e.currentTarget as HTMLElement)}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative h-12 w-12 rounded-xl border border-success/30 bg-success/15 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[0_0_12px_hsl(var(--success)/0.2),inset_0_1px_1px_hsl(var(--success)/0.15)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-success/20 before:to-transparent before:rounded-xl">
                  <Zap className="relative z-10 h-7 w-7 text-success" />
                </div>
                <span className="text-sm font-medium text-foreground">Quick Prompts</span>
              </div>
            </Card>
            {isJTurner && (
              <Card
                className="p-4 cursor-pointer transition-all duration-150 hover:bg-muted/10 hover:scale-[1.02] hover:border-border/40 active:scale-[0.98]"
                onClick={(e) => openCarouselWidget('daily-briefing', e.currentTarget as HTMLElement)}
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative h-12 w-12 rounded-xl border border-warning/30 bg-warning/15 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[0_0_12px_hsl(var(--warning)/0.2),inset_0_1px_1px_hsl(var(--warning)/0.15)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-warning/20 before:to-transparent before:rounded-xl">
                    <Newspaper className="relative z-10 h-7 w-7 text-warning" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Daily Briefing</span>
                </div>
              </Card>
            )}
            {canSeeNiki && (
              <Card
                className="p-4 cursor-pointer transition-all duration-150 hover:bg-muted/10 hover:scale-[1.02] hover:border-border/40 active:scale-[0.98]"
                onClick={(e) => openCarouselWidget('niki-briefing', e.currentTarget as HTMLElement)}
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="relative h-12 w-12 rounded-xl border border-[hsl(190,90%,55%,0.4)] bg-[hsl(190,90%,45%,0.18)] backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[0_0_12px_hsl(190,90%,50%,0.25),inset_0_1px_1px_hsl(190,90%,70%,0.2)] before:absolute before:inset-0 before:bg-gradient-to-b before:from-[hsl(190,90%,60%,0.25)] before:to-transparent before:rounded-xl">
                    <Newspaper className="relative z-10 h-7 w-7 text-[hsl(190,90%,70%)]" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing"}
                  </span>
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
      <FullCalendarView
        open={isWidgetActive('calendar')}
        onOpenChange={handleCarouselDialogOpenChange}
      />
      <InboxDialog
        open={isWidgetActive('email')}
        onOpenChange={handleCarouselDialogOpenChange}
      />
      <CreateDealDialog
        open={isWidgetActive('new-deal')}
        onOpenChange={handleCarouselDialogOpenChange}
      />
      <QuickPromptsDialog
        open={isWidgetActive('quick-prompts')}
        onOpenChange={handleCarouselDialogOpenChange}
      />
      {isJTurner && (
        <DailyBriefingModal
          open={isWidgetActive('daily-briefing')}
          onOpenChange={handleCarouselDialogOpenChange}
        />
      )}
      {canSeeNiki && (
        <DailyBriefingModal
          open={isWidgetActive('niki-briefing')}
          onOpenChange={handleCarouselDialogOpenChange}
          title={isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing"}
          targetUserId={NIKI_USER_ID}
          targetAssigneeName={NIKI_ASSIGNEE_NAME}
          excludeTabs={['financial']}
        />
      )}
      <WidgetCarouselChrome />
    </>
  );
}
