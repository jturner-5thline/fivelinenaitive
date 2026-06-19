import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DealSizeConfirmDialog } from '@/components/deals/DealSizeConfirmDialog';
import { computeTotalFee } from '@/lib/fees';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown, X, AlertTriangle, Flag, ArrowUpDown, Flame, LayoutGrid, List, ChevronRight, Kanban, Bell, Target, Settings2, Layers, ChartGantt, CopyCheck, Share2, RotateCcw } from 'lucide-react';
import { useDealDuplicates, DuplicateCluster } from '@/hooks/useDealDuplicates';
import { DuplicatesView } from '@/components/deals/duplicates/DuplicatesView';
import { DealMergeDrawer } from '@/components/deals/duplicates/DealMergeDrawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkspacePage } from '@/components/layout/WorkspacePage';
import { DealFilters } from '@/components/deals/DealFilters';
import { AIFilterChips } from '@/components/deals/AIFilterChips';
import { MilestoneManagerFilter } from '@/components/deals/MilestoneManagerFilter';
import { DealsList } from '@/components/deals/DealsList';
import { DealMilestonesView } from '@/components/deals/DealMilestonesView';
import { DealsPipelineView } from '@/components/deals/DealsPipelineView';
import { DealsTimelineView } from '@/components/deals/DealsTimelineView';
import { DealsListSkeleton } from '@/components/deals/DealsListSkeleton';
import { SortField, SortDirection } from '@/hooks/useDeals';
import type { Deal } from '@/types/deal';
import { useCompanyFeatures } from '@/hooks/useCompanyFeatures';
import { WidgetsSection } from '@/components/deals/WidgetsSection';
import { WidgetsSectionSkeleton } from '@/components/deals/WidgetsSectionSkeleton';
import { useWidgets } from '@/contexts/WidgetsContext';
import { PipelineSelector } from '@/components/deals/PipelineSelector';



import { EmailVerificationBanner } from '@/components/deals/EmailVerificationBanner';
import { DemoBanner } from '@/components/deals/DemoBanner';
import { NotificationConsentModal } from '@/components/notifications/NotificationConsentModal';

import { FlaggedDealsPanel } from '@/components/deals/FlaggedDealsPanel';

import { LatestUpdatesDropdown } from '@/components/deals/LatestUpdatesDropdown';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { FlaggedDealsCarousel } from '@/components/deals/FlaggedDealsCarousel';
import { CreateCompanyBanner } from '@/components/deals/CreateCompanyBanner';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { useDeals, DEFAULT_DEAL_FILTERS } from '@/hooks/useDeals';
import { useDealSavedViews, DealViewConfig } from '@/hooks/useDealSavedViews';
import { DealSavedViewsMenu } from '@/components/deals/DealSavedViewsMenu';
import { useDealsLastViewState } from '@/hooks/useDealsLastViewState';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { preloadDealDetail } from '@/lib/lazyDealDetail';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealListColumnOrder, COLUMN_LABELS, ALL_COLUMNS } from '@/hooks/useDealListColumnOrder';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';
import { ShareReportDialog } from '@/components/deals/ShareReportDialog';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CheckSquare } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePipelineScrollPersistence } from '@/hooks/usePipelineScrollPersistence';
import { useDealStages } from '@/contexts/DealStagesContext';
import { NaitiveDealOverlay } from '@/components/naitive-pipeline/NaitiveDealOverlay';
import { cn } from '@/lib/utils';

// Render only the canonical Deal Rundown detail card (MemoHeader +
// NextBestAction + Tasks/Milestones + Activity + Calendar + LendersPanel)
// inline — no nested master list / filter chips from PipelineMemoView.
// Imported eagerly so opening the inline detail pane is instant — the
// previous `lazy()` chunk fetch added a visible delay on first open.
import { DealInlineSummary as DealRundownMemoView } from '@/components/deals/DealInlineSummary';

export default function Dashboard() {
  const { user } = useAuth();
  // Performance instrumentation — measure mount and first paint of /deals.
  // Niki reported ~2min loads; these markers let us confirm fixes server-side.
  if (typeof performance !== 'undefined' && !(globalThis as any).__dealsMountMarked) {
    (globalThis as any).__dealsMountMarked = true;
    // eslint-disable-next-line no-console
    console.time('deals:firstPaint');
    // eslint-disable-next-line no-console
    console.time('deals:mount');
  }
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const { features: companyFeatures } = useCompanyFeatures();
  const [overlaySearchParams, setOverlaySearchParams] = useSearchParams();
  const { stages: overlayStages } = useDealStages();

  // Deal size confirmation — match stage labels (case-insensitive) for 5th Line only
  const DEAL_SIZE_CONFIRM_STAGE_LABELS = ['proposal issued', 'terms issued', 'in diligence', 'in due diligence'];
  const [sizeConfirm, setSizeConfirm] = useState<{
    dealId: string;
    dealName: string;
    currentValue: number;
    newStage: string;
    newStageLabel: string;
  } | null>(null);

  const {
    views: savedViews,
    isLoaded: savedViewsLoaded,
    saveView,
    deleteView,
    setDefault,
    clearDefaultView,
    clearAllViews,
    getDefaultView,
  } = useDealSavedViews();
  const defaultView = getDefaultView();

  // Grouping is optional and starts unset; we hydrate from the org default view
  // (or leave it null = ungrouped) once saved views finish loading. NEVER coerce
  // an empty/null grouping back to 'status' — that round-trips the user's choice.
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [showMilestones, setShowMilestones] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'pipeline' | 'timeline'>(() => {
    const stored = localStorage.getItem('deals-view-mode');
    if (stored === 'timeline' && !companyFeatures.timeline_view_enabled) return 'grid';
    return (stored === 'grid' || stored === 'list' || stored === 'pipeline' || stored === 'timeline') ? stored : 'grid';
  });
  const [flaggedCarouselOpen, setFlaggedCarouselOpen] = useState(false);
  const [savedViewWarningDismissed, setSavedViewWarningDismissed] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [mergeCluster, setMergeCluster] = useState<DuplicateCluster | null>(null);
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [allExpanded, setAllExpanded] = useState(true);
  const [mergeDrawerOpen, setMergeDrawerOpen] = useState(false);
  const { deals: allDeals, isLoading, refreshDeals, updateDeal } = useDealsContext();

  // When the user clicks "Open details" from the inline right-pane summary
  // (list view), promote the same `?deal=<id>` selection to the rich
  // NaitiveDealOverlay popup (Deal Space, Deal Info, etc.) instead of
  // keeping just the side panel open.
  const [forceOverlayDealId, setForceOverlayDealId] = useState<string | null>(null);

  // Persist board scroll position when the deal overlay opens/closes.
  const boardScrollContainerRef = useRef<HTMLDivElement | null>(null);
  usePipelineScrollPersistence(boardScrollContainerRef, !!overlaySearchParams.get('deal'));
  const { isLoading: widgetsLoading } = useWidgets();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  const { isFirstTimeUser, dismissAllHints } = useFirstTimeHints();
  const { activePipelineId, pipelines } = usePipelineContext();
  const { company } = useCompany();
  const activePipelineName = pipelines.find(p => p.id === activePipelineId)?.name ?? null;
  const [shareReportOpen, setShareReportOpen] = useState(false);
  
  const { preferences } = usePreferences();
  const { visibleColumns, toggleColumnVisibility } = useDealListColumnOrder();

  useEffect(() => {
    localStorage.setItem('deals-view-mode', viewMode);
  }, [viewMode]);

  // Preload the (large) DealDetail chunk during idle time so the very
  // first deal click opens the overlay without paying the chunk-parse
  // cost on the critical path. Shared loader dedupes with the route's
  // own lazy import.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const schedule = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const handle = schedule(() => preloadDealDetail());
    return () => {
      const cancel = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback
        ?? ((h: number) => window.clearTimeout(h));
      cancel(handle as number);
    };
  }, []);

  // End mount/firstPaint timers once deals have actually loaded.
  useEffect(() => {
    if ((globalThis as any).__dealsMountMarked && !(globalThis as any).__dealsMountEnded) {
      (globalThis as any).__dealsMountEnded = true;
      // eslint-disable-next-line no-console
      console.timeEnd('deals:mount');
    }
  }, []);
  useEffect(() => {
    if (!isLoading && (globalThis as any).__dealsMountMarked && !(globalThis as any).__dealsFirstPaintEnded) {
      (globalThis as any).__dealsFirstPaintEnded = true;
      // eslint-disable-next-line no-console
      console.timeEnd('deals:firstPaint');
      // eslint-disable-next-line no-console
      console.info('[deals] deal count:', allDeals.length);
    }
  }, [isLoading, allDeals.length]);
  
  const showOnboarding = !profileLoading && profile && !profile.onboarding_completed;

  // Sanitize legacy sort fields (e.g. removed 'flexEngagement') from persisted views.
  const sanitizeSortField = (field: any): any => (field === 'flexEngagement' ? 'updatedAt' : field);

  const {
    deals: allFilteredDeals,
    filters,
    sortField,
    sortDirection,
    updateDealStatus,
    updateFilters,
    toggleSort,
    setFilters,
    setSortField,
    setSortDirection,
  } = useDeals(defaultView ? {
    initialFilters: defaultView.config.filters,
    initialSortField: sanitizeSortField(defaultView.config.sortField),
    initialSortDirection: defaultView.config.sortDirection,
  } : undefined);

  const resetDealViewState = useCallback((options?: { clearSavedViews?: boolean; clearDefaultOnly?: boolean; showToast?: boolean }) => {
    setFilters(DEFAULT_DEAL_FILTERS);
    setSortField('updatedAt');
    setSortDirection('desc');
    // Reset means "no grouping" — do not coerce to 'status'.
    setGroupBy(null);
    setCollapsedGroups([]);
    setSavedViewWarningDismissed(false);

    if (options?.clearSavedViews) {
      clearAllViews();
    } else if (options?.clearDefaultOnly) {
      clearDefaultView();
    }

    if (options?.showToast) {
      toast({ title: 'Filters reset', description: 'Showing all deals for the selected pipeline.' });
    }
  }, [clearAllViews, clearDefaultView, setFilters, setSortDirection, setSortField]);

  // Apply default saved view on mount (belt-and-suspenders with initial state)
  const defaultViewAppliedRef = useRef(false);
  useEffect(() => {
    if (!savedViewsLoaded || defaultViewAppliedRef.current) return;
    if (defaultView) {
      defaultViewAppliedRef.current = true;
      setFilters(defaultView.config.filters);
      setSortField(sanitizeSortField(defaultView.config.sortField));
      setSortDirection(defaultView.config.sortDirection);
      const m = defaultView.config.viewMode;
      setViewMode(m === 'timeline' && !companyFeatures.timeline_view_enabled ? 'grid' : m);
      // Preserve null/undefined exactly — null means "ungrouped" by design.
      setGroupBy(defaultView.config.groupBy ?? null);
      setCollapsedGroups(defaultView.config.collapsedGroups ?? []);
    } else {
      defaultViewAppliedRef.current = true;
    }
  }, [savedViewsLoaded, defaultView, companyFeatures.timeline_view_enabled, setFilters, setSortField, setSortDirection]);

  const previousPipelineIdRef = useRef<string | null>(activePipelineId);
  useEffect(() => {
    if (previousPipelineIdRef.current === activePipelineId) return;
    previousPipelineIdRef.current = activePipelineId;
    resetDealViewState({ clearDefaultOnly: true });
  }, [activePipelineId, resetDealViewState]);

  // Check if any filters are active (different from defaults)
  const hasActiveFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_DEAL_FILTERS) 
    || sortField !== 'updatedAt' || sortDirection !== 'desc';

  const handleSaveView = (name: string) => {
    const config: DealViewConfig = {
      filters,
      sortField,
      sortDirection,
      viewMode,
      groupBy,
      collapsedGroups,
    };
    saveView(name, config);
  };

  const handleRestoreView = (view: typeof savedViews[0]) => {
    setFilters(view.config.filters);
    setSortField(sanitizeSortField(view.config.sortField));
    setSortDirection(view.config.sortDirection);
    setViewMode(view.config.viewMode);
    setGroupBy(view.config.groupBy ?? null);
    setCollapsedGroups(view.config.collapsedGroups ?? []);
    setSavedViewWarningDismissed(false);
  };

  // Filter deals by active pipeline (include unassigned deals in the default pipeline)
  
  
  const dealsInSelectedPipeline = useMemo(() => {
    if (!activePipelineId) return allDeals;
    return allDeals.filter(deal => 
      deal.pipelineId === activePipelineId || !deal.pipelineId
    );
  }, [allDeals, activePipelineId]);

  const pipelineFilteredDeals = useMemo(() => {
    if (!activePipelineId) return allFilteredDeals;
    return allFilteredDeals.filter(deal => 
      deal.pipelineId === activePipelineId || !deal.pipelineId
    );
  }, [allFilteredDeals, activePipelineId]);

  const savedViewLikelyHidingDeals = dealsInSelectedPipeline.length > 0 && pipelineFilteredDeals.length === 0 && (hasActiveFilters || !!defaultView);

  useEffect(() => {
    if (!savedViewLikelyHidingDeals || isLoading) return;
    // Auto-clear broken saved views that hide all deals
    resetDealViewState({ clearSavedViews: true, showToast: true });
    toast({
      title: 'Saved view cleared',
      description: 'A saved view was hiding all deals in this pipeline, so it was removed.',
    });
  }, [isLoading, resetDealViewState, savedViewLikelyHidingDeals]);

  // Get notification counts for filtering
  const allDealIds = useMemo(() => pipelineFilteredDeals.map(d => d.id), [pipelineFilteredDeals]);
  const notificationCounts = useDealNotificationCounts(allDealIds);

  // Open tasks per deal — drives the 3-state Tasks filter (All / Has / None).
  // Reuses the batched hook already used by the Pipeline & Clients memo
  // cards so we never issue per-deal queries from this page.
  const { data: dealTasksMap } = usePipelineDealTasks(allDealIds, allDealIds.length > 0);
  const dealHasTasks = useCallback((dealId: string) => {
    const arr = dealTasksMap?.get(dealId);
    return !!(arr && arr.length > 0);
  }, [dealTasksMap]);

  // Count stale deals
  const staleDealCount = useMemo(() => {
    return pipelineFilteredDeals.filter(deal => {
      if (deal.status === 'archived') return false;
      const days = Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      return days >= preferences.staleDealsDays;
    }).length;
  }, [pipelineFilteredDeals, preferences.staleDealsDays]);

  // Per-deal notification count — must match DealCard notification logic so
  // the 3-state Notifications filter (All / Has / None) lines up with the
  // red dot/pill rendered on each tile.
  const dealNotificationCount = useCallback((deal: typeof pipelineFilteredDeals[number]) => {
    let count = notificationCounts[deal.id] || 0;
    deal.lenders?.forEach(lender => {
      if (lender.trackingStatus === 'active' && lender.updatedAt) {
        const days = Math.floor((Date.now() - new Date(lender.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
        if (days >= preferences.staleDealsDays) count++;
      }
    });
    deal.milestones?.forEach(m => {
      if (!m.completed && m.dueDate && new Date(m.dueDate) < new Date()) count++;
    });
    return count;
  }, [notificationCounts, preferences.staleDealsDays]);

  // Apply Notifications + Tasks filters on top of the base filtered set.
  // Existing role-based / pipeline / archived rules already ran upstream;
  // we only layer the new 3-state filters here so we can never reintroduce
  // excluded deals.
  const deals = useMemo(() => {
    let result = pipelineFilteredDeals;

    // Notifications: legacy `hasNotificationsOnly` toggle still wins when set
    // (kept for back-compat with saved views), otherwise use the new
    // tri-state `notificationsFilter`.
    const notifMode: 'all' | 'has' | 'none' =
      filters.hasNotificationsOnly ? 'has' : (filters.notificationsFilter ?? 'all');
    if (notifMode !== 'all') {
      result = result.filter(deal => {
        const count = dealNotificationCount(deal);
        return notifMode === 'has' ? count > 0 : count === 0;
      });
    }

    // Tasks tri-state filter.
    const taskMode = filters.tasksFilter ?? 'all';
    if (taskMode !== 'all') {
      result = result.filter(deal => {
        const has = dealHasTasks(deal.id);
        return taskMode === 'has' ? has : !has;
      });
    }

    return result;
  }, [pipelineFilteredDeals, filters.hasNotificationsOnly, filters.notificationsFilter, filters.tasksFilter, dealNotificationCount, dealHasTasks]);

  // Duplicate detection
  const { clusters: duplicateClusters, suppressCluster } = useDealDuplicates(deals, showDuplicates);

  const handleOpenMerge = (cluster: DuplicateCluster) => {
    setMergeCluster(cluster);
    setMergeDrawerOpen(true);
  };

  const handleMarkReviewed = async (dealId: string) => {
    try {
      await updateDeal(dealId, { updatedAt: new Date().toISOString() });
      toast({ 
        title: "Deal marked as reviewed", 
        description: "The deal's timestamp has been updated." 
      });
    } catch (error) {
      toast({ 
        title: "Failed to update deal", 
        description: "Please try again.",
        variant: "destructive"
      });
    }
  };

  const executeStageChange = useCallback(async (dealId: string, newStage: string, valueOverride?: number) => {
    try {
      const updates: Record<string, any> = { stage: newStage };
      if (valueOverride !== undefined) {
        updates.value = valueOverride;
        // Recalculate total fee based on new deal value and existing success fee percent
        const deal = allDeals.find(d => d.id === dealId);
        if (deal?.successFeePercent) {
          updates.totalFee = computeTotalFee(valueOverride, deal.successFeePercent);
        }
      }
      await updateDeal(dealId, updates);
      toast({ 
        title: "Deal stage updated", 
        description: "The deal has been moved to a new stage." 
      });
    } catch (error) {
      toast({ 
        title: "Failed to update deal stage", 
        description: "Please try again.",
        variant: "destructive"
      });
    }
  }, [updateDeal, toast, allDeals]);

  const handleStageChange = async (dealId: string, newStage: string) => {
    const safeStage = typeof newStage === 'string' ? newStage : '';
    // For 5th Line users, prompt deal size confirmation on specific stages
    if (is5thLine) {
      // Normalize stage ID to label-like format for matching
      const normalizedStage = safeStage.replace(/[-_]/g, ' ').toLowerCase();
      const matchesConfirmStage = DEAL_SIZE_CONFIRM_STAGE_LABELS.some(
        s => normalizedStage.includes(s)
      );

      if (matchesConfirmStage) {
        const deal = allDeals.find(d => d.id === dealId);
        if (deal) {
          setSizeConfirm({
            dealId,
            dealName: deal.company || deal.name || 'This deal',
            currentValue: deal.value || 0,
            newStage: safeStage,
            newStageLabel: safeStage.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          });
          return;
        }
      }
    }
    await executeStageChange(dealId, newStage);
  };

  const handleSizeConfirm = (updatedValue: number) => {
    if (sizeConfirm) {
      executeStageChange(sizeConfirm.dealId, sizeConfirm.newStage, updatedValue);
      setSizeConfirm(null);
    }
  };

  const handleToggleFlag = async (dealId: string, isFlagged: boolean, flagNotes?: string) => {
    try {
      const previous = allDeals.find(d => d.id === dealId);
      const previousFlagged = previous?.isFlagged === true;
      const previousNote = (previous?.flagNotes ?? '').trim();
      const nextNote = (flagNotes ?? '').trim();

      await updateDeal(dealId, { isFlagged, flagNotes: nextNote });

      // Notification rules:
      //  - Unflag (true → false): never notify.
      //  - Flag on (false → true): always notify.
      //  - Re-flag while already flagged: only notify if the flag note actually changed.
      const shouldNotify =
        isFlagged === true &&
        user?.id &&
        (!previousFlagged || nextNote !== previousNote);

      if (shouldNotify) {
        const { notifyDealFlagged } = await import('@/utils/notifyDealFlagged');
        await notifyDealFlagged({
          dealId,
          dealName: previous?.company || 'this deal',
          actorUserId: user!.id,
          flagNote: nextNote,
          companyId: (previous as any)?.companyId ?? null,
        });
      }
    } catch (error) {
      throw error;
    }
  };

  return (
    <>
      <Helmet>
        <title>Deals - naitive</title>
        <meta
          name="description"
          content="Manage your deal pipeline with advanced filtering, sorting, and status tracking."
        />
      </Helmet>
      <div className="deals-surface contents">
      {/*
        Page surface — routed through the shared `<WorkspacePage>` primitive
        so this page and the Directory can never drift apart on
        canvas tone, header chrome, or padding rhythm. Banners are passed as
        `beforeContent` so they keep their original sibling position
        OUTSIDE the `space-y-*` rhythm of the main page sections.
      */}
      <WorkspacePage
        beforeContent={
          <>
            <OnboardingModal open={showOnboarding} onComplete={completeOnboarding} />
            <EmailVerificationBanner />
            <DemoBanner onDataCleared={refreshDeals} />
            <CreateCompanyBanner />
            <NotificationConsentModal />
          </>
        }
        afterMain={
          <>
            {/* Dismiss all hints floating button */}
            {isFirstTimeUser && (
              <button
                onClick={() => {
                  dismissAllHints();
                  toast({ title: 'Hints dismissed', description: 'All hints have been hidden.' });
                }}
                className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1.5 text-xs text-primary-foreground shadow-lg hover:bg-primary transition-colors"
              >
                <X className="h-3 w-3" />
                Dismiss all hints
              </button>
            )}

            {/* Flagged Deals Carousel */}
            <FlaggedDealsCarousel
              deals={allDeals}
              isOpen={flaggedCarouselOpen}
              onClose={() => {
                setFlaggedCarouselOpen(false);
                updateFilters({ flaggedOnly: false });
              }}
            />

            {/* Deal Size Confirmation Dialog (5th Line only) */}
            {sizeConfirm && (
              <DealSizeConfirmDialog
                open={!!sizeConfirm}
                dealName={sizeConfirm.dealName}
                currentValue={sizeConfirm.currentValue}
                newStage={sizeConfirm.newStageLabel}
                onConfirm={handleSizeConfirm}
                onCancel={() => setSizeConfirm(null)}
              />
            )}

            <DealMergeDrawer
              cluster={mergeCluster}
              open={mergeDrawerOpen}
              onOpenChange={setMergeDrawerOpen}
            />
          </>
        }
        headerActions={
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-md"
                  aria-label="Customize widgets"
                  onClick={() => window.dispatchEvent(new Event('toggle-widgets-edit-mode'))}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Customize widgets</TooltipContent>
            </Tooltip>
            <NotificationsDropdown />
            <LatestUpdatesDropdown />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-md">
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  exportPipelineToCSV(deals);
                  toast({ title: "CSV exported", description: `${deals.length} deals exported to CSV.` });
                }}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  exportPipelineToPDF(deals);
                  toast({ title: "PDF exported", description: `${deals.length} deals exported to PDF.` });
                }}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  await exportPipelineToWord(deals);
                  toast({ title: "Word document exported", description: `${deals.length} deals exported to Word.` });
                }}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as Word
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShareReportOpen(true)}>
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <CreateDealDialog />
            <ShareReportDialog
              open={shareReportOpen}
              onOpenChange={setShareReportOpen}
              deals={allDeals}
              activePipelineId={activePipelineId}
              pipelineName={activePipelineName}
            />
          </div>
        }
      >
            {/* 2. Stats / widgets row */}
            {isLoading || widgetsLoading ? (
              <WidgetsSectionSkeleton />
            ) : (
              <div
                className="opacity-0"
                style={{ animation: 'fadeInUp 0.4s ease-out 0.1s forwards' }}
              >
                <WidgetsSection deals={deals} />
              </div>
            )}
            
            <style>{`
              @keyframes fadeInUp {
                from {
                  opacity: 0;
                  transform: translateY(12px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
            `}</style>

            {/* Filters */}
            <div 
              className="opacity-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 0.2s forwards' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                {showMilestones ? (
                  <MilestoneManagerFilter
                    selected={filters.manager}
                    onChange={(manager) => updateFilters({ manager })}
                  />
                ) : (
                  <div className="flex-1 min-w-[200px]">
                    <DealFilters
                      filters={filters}
                      onFilterChange={updateFilters}
                      hideStatusFilter={is5thLine}
                    />
                    <div className="mt-2">
                      <AIFilterChips />
                    </div>
                  </div>
                )}

                {/* Stale / Flag / Notification toggles */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={filters.staleOnly}
                        onPressedChange={(pressed) => {
                          if (pressed) {
                            updateFilters({ staleOnly: true, flaggedOnly: false, hasNotificationsOnly: false });
                          } else {
                            updateFilters({ staleOnly: false });
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 relative backdrop-blur-md border transition-all duration-200 ${filters.staleOnly ? 'bg-gradient-to-br from-amber-500/25 to-orange-600/20 border-amber-500/50 text-amber-400 shadow-[0_0_12px_hsl(38,90%,50%,0.2)] hover:from-amber-500/30 hover:to-orange-600/25' : 'bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/20 text-amber-400/60 hover:from-amber-500/15 hover:to-orange-600/10 hover:border-amber-500/35 hover:text-amber-400'}`}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        {staleDealCount > 0 && (
                          <Badge 
                            variant="destructive" 
                            className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 text-xs rounded-full"
                          >
                            {staleDealCount}
                          </Badge>
                        )}
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show only stale deals ({preferences.staleDealsDays}+ days)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={filters.flaggedOnly}
                        onPressedChange={(pressed) => {
                          if (pressed) {
                            updateFilters({ flaggedOnly: true, staleOnly: false, hasNotificationsOnly: false });
                          } else {
                            updateFilters({ flaggedOnly: false });
                          }
                          setSavedViewWarningDismissed(false);
                        }}
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 backdrop-blur-md border transition-all duration-200 ${filters.flaggedOnly ? 'bg-gradient-to-br from-red-500/25 to-red-900/20 border-red-500/50 text-red-400 shadow-[0_0_12px_hsl(0,70%,45%,0.2)] hover:from-red-500/30 hover:to-red-900/25' : 'bg-gradient-to-br from-red-500/10 to-red-900/5 border-red-500/20 text-red-400/60 hover:from-red-500/15 hover:to-red-900/10 hover:border-red-500/35 hover:text-red-400'}`}
                      >
                        <Flag className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show only flagged deals</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/*
                  Notifications & Tasks tri-state segmented controls.
                  Each pill group is All / Has / No, styled to match the
                  existing glassy cyan toolbar buttons (see Bell toggle
                  history). Combines with all other filters via AND logic
                  in the `deals` memo above.
                */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {(() => {
                        const notifActive =
                          filters.hasNotificationsOnly ||
                          (filters.notificationsFilter ?? 'all') === 'has';
                        return (
                          <button
                            type="button"
                            aria-pressed={notifActive}
                            onClick={() => {
                              const next: 'all' | 'has' = notifActive ? 'all' : 'has';
                              updateFilters({
                                notificationsFilter: next,
                                hasNotificationsOnly: false,
                                ...(next === 'has' ? { staleOnly: false, flaggedOnly: false } : {}),
                              });
                              setSavedViewWarningDismissed(false);
                            }}
                            className={`h-8 w-8 inline-flex items-center justify-center rounded-md border backdrop-blur-md transition-colors ${
                              notifActive
                                ? 'border-cyan-500/40 bg-cyan-500/25 text-cyan-300'
                                : 'border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-teal-600/5 text-cyan-400/70 hover:text-cyan-300'
                            }`}
                          >
                            <Bell className="h-3.5 w-3.5" />
                          </button>
                        );
                      })()}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show only deals with notifications</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {is5thLine && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={showDuplicates}
                        onPressedChange={(pressed) => setShowDuplicates(pressed)}
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 relative backdrop-blur-md border transition-all duration-200 ${showDuplicates ? 'bg-gradient-to-br from-violet-500/25 to-purple-600/20 border-violet-500/50 text-violet-400 shadow-[0_0_12px_hsl(270,70%,50%,0.2)] hover:from-violet-500/30 hover:to-purple-600/25' : 'bg-gradient-to-br from-violet-500/10 to-purple-600/5 border-violet-500/20 text-violet-400/60 hover:from-violet-500/15 hover:to-purple-600/10 hover:border-violet-500/35 hover:text-violet-400'}`}
                      >
                        <CopyCheck className="h-4 w-4" />
                        {showDuplicates && duplicateClusters.length > 0 && (
                          <Badge 
                            variant="destructive" 
                            className="absolute -top-2 -right-2 h-5 min-w-5 px-1.5 text-xs rounded-full"
                          >
                            {duplicateClusters.length}
                          </Badge>
                        )}
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Find duplicate deals</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Sort deals"
                      title="Sort deals"
                      className="relative h-9 w-9 shrink-0 rounded-md"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(() => {
                      const isDefaultSort = sortField === 'updatedAt' && sortDirection === 'desc';
                      return (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              if (isDefaultSort) return;
                              setSortField('updatedAt');
                              setSortDirection('desc');
                            }}
                            disabled={isDefaultSort}
                            className="gap-2"
                            title={isDefaultSort ? 'No active sort to clear' : undefined}
                            aria-disabled={isDefaultSort}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Clear sort
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      );
                    })()}
                    <DropdownMenuItem onClick={() => toggleSort('updatedAt')} className={sortField === 'updatedAt' ? 'bg-accent' : ''}>
                      Last Updated {sortField === 'updatedAt' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleSort('createdAt')} className={sortField === 'createdAt' ? 'bg-accent' : ''}>
                      Created Date {sortField === 'createdAt' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleSort('value')} className={sortField === 'value' ? 'bg-accent' : ''}>
                      Deal Value {sortField === 'value' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleSort('name')} className={sortField === 'name' ? 'bg-accent' : ''}>
                      Name {sortField === 'name' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleSort('status')} className={sortField === 'status' ? 'bg-accent' : ''}>
                      Status {sortField === 'status' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleSort('stage')} className={sortField === 'stage' ? 'bg-accent' : ''}>
                      Stage {sortField === 'stage' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {viewMode === 'grid' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-md">
                        <Layers className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(() => {
                        // Clicking the currently-active option toggles grouping off.
                        const toggle = (value: string) => setGroupBy(prev => (prev === value ? null : value));
                        const options: Array<{ value: string; label: string }> = [
                          { value: 'status', label: 'Status' },
                          { value: 'stage', label: 'Stage' },
                          { value: 'engagementType', label: 'Engagement Type' },
                          { value: 'manager', label: 'Manager' },
                          { value: 'lender', label: 'Lender' },
                          { value: 'referredBy', label: 'Referred By' },
                        ];
                        return (
                          <>
                            <DropdownMenuItem onClick={() => setGroupBy(null)} className={!groupBy ? 'bg-accent' : ''}>
                              None
                            </DropdownMenuItem>
                            {options.map(opt => (
                              <DropdownMenuItem
                                key={opt.value}
                                onClick={() => toggle(opt.value)}
                                className={groupBy === opt.value ? 'bg-accent' : ''}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                          </>
                        );
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* View Mode Dropdown */}
                <Select value={viewMode} onValueChange={(val: 'grid' | 'list' | 'pipeline' | 'timeline') => setViewMode(val)}>
                  <SelectTrigger className="h-9 w-10 px-0 justify-center [&>svg:last-child]:hidden shrink-0 rounded-md">
                    {viewMode === 'grid' && <LayoutGrid className="h-4 w-4" />}
                    {viewMode === 'list' && <List className="h-4 w-4" />}
                    {viewMode === 'pipeline' && <Kanban className="h-4 w-4" />}
                    {viewMode === 'timeline' && <ChartGantt className="h-4 w-4" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4" />
                        Grid
                      </div>
                    </SelectItem>
                    <SelectItem value="list">
                      <div className="flex items-center gap-2">
                        <List className="h-4 w-4" />
                        List
                      </div>
                    </SelectItem>
                    <SelectItem value="pipeline">
                      <div className="flex items-center gap-2">
                        <Kanban className="h-4 w-4" />
                        Pipeline
                      </div>
                    </SelectItem>
                    {companyFeatures.timeline_view_enabled && (
                      <SelectItem value="timeline">
                        <div className="flex items-center gap-2">
                          <ChartGantt className="h-4 w-4" />
                          Timeline
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="liquid-glass"
                  className="h-9 w-9 p-0 shrink-0 rounded-md"
                  onClick={() => setShowMilestones(!showMilestones)}
                  aria-label="Milestones"
                  title="Milestones"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round">
                    <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                  </svg>
                </Button>
                <div className="relative self-center">
                  <DealSavedViewsMenu
                    views={savedViews}
                    onSave={handleSaveView}
                    onRestore={handleRestoreView}
                    onDelete={deleteView}
                    onSetDefault={setDefault}
                    hasActiveFilters={hasActiveFilters}
                  />
                  {(viewMode === 'grid' || viewMode === 'list') && groupBy && (
                    <button
                      onClick={() => {
                        if (allExpanded) {
                          setCollapseAllSignal(s => s + 1);
                          setAllExpanded(false);
                        } else {
                          setExpandAllSignal(s => s + 1);
                          setAllExpanded(true);
                        }
                      }}
                      className="absolute left-1/2 -translate-x-1/2 top-full text-[10px] text-muted-foreground/70 hover:text-foreground/80 transition-colors cursor-pointer select-none whitespace-nowrap"
                      aria-label={allExpanded ? 'Collapse all groups' : 'Expand all groups'}
                    >
                      {allExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                  )}
                </div>
              </div>
            </div>

              {savedViewLikelyHidingDeals && !savedViewWarningDismissed && (
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Your saved view is filtering out all deals in this pipeline.</p>
                      <p className="text-xs text-muted-foreground">Reset filters to show all deals for this pipeline and clear the saved default view.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSavedViewWarningDismissed(true)}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => resetDealViewState({ clearSavedViews: true, showToast: true })}
                      >
                        Reset Filters
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Deals Grid/List/Pipeline or Milestones */}
              {(() => {
                // Inline split layout: when a deal is selected via `?deal=<id>`,
                // keep the list visible on the left and render the Deal Rundown
                // summary content (PipelineMemoView, single-deal) on the right.
                // We deliberately do NOT use a Sheet/overlay here — the list
                // must remain interactive while the detail updates in place.
                const selectedId = overlaySearchParams.get('deal');
                const selectedDeal = selectedId
                  ? (allDeals.find(d => d.id === selectedId)
                      ?? ({ id: selectedId, company: 'Deal' } as unknown as Deal))
                  : null;
                const closeDetail = () => {
                  const next = new URLSearchParams(overlaySearchParams);
                  next.delete('deal');
                  setOverlaySearchParams(next, { replace: false });
                  setForceOverlayDealId(null);
                };
                const showInlineDetail =
                  !!selectedDeal && viewMode === 'list' && !showMilestones && !showDuplicates
                  && forceOverlayDealId !== selectedId;
                // For grid + pipeline views, open the rich deal overlay
                // (Deal Space, Deal Info, etc.) instead of the inline
                // side-panel summary. List view keeps the inline split.
                const showOverlayDetail =
                  !!selectedDeal
                  && !showMilestones
                  && !showDuplicates
                  && (
                    viewMode === 'grid'
                    || viewMode === 'pipeline'
                    || forceOverlayDealId === selectedId
                  );
                return (
              <>
              <div
                ref={boardScrollContainerRef}
                className={cn(
                  'opacity-0',
                  showInlineDetail && 'flex gap-4 items-start',
                )}
                style={{ animation: 'fadeInUp 0.4s ease-out 0.3s forwards' }}
              >
              <div className={cn(showInlineDetail ? 'flex-1 min-w-0 pr-1 overflow-visible' : 'contents')}>
              {/*
                Flagged-filter context banner — renders ONLY when the
                flag filter is on. Computed from the unfiltered deal set
                so users can see how many flagged deals are currently
                hidden by their pipeline / archive scope. Filter logic
                itself is untouched.
              */}
              {filters.flaggedOnly && (() => {
                const flagged = pipelineFilteredDeals.filter(d => d.isFlagged);
                const total = flagged.length;
                if (total === 0) return null;
                const archived = flagged.filter(
                  d => d.status === 'archived' || d.stage === 'closed-lost'
                ).length;
                const active = total - archived;
                return (
                  <div className="mb-3 rounded-md border border-red-500/30 bg-gradient-to-r from-red-500/10 to-red-900/5 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                    <Flag className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Showing <strong className="font-semibold text-red-200">{total}</strong> flagged deal{total === 1 ? '' : 's'}.{' '}
                      <strong className="font-semibold text-red-200">{active}</strong> active,{' '}
                      <strong className="font-semibold text-red-200">{archived}</strong> archived.
                    </span>
                  </div>
                );
              })()}

              {showDuplicates && is5thLine ? (
                <DuplicatesView clusters={duplicateClusters} onMerge={handleOpenMerge} onDealDeleted={refreshDeals} onNotDuplicate={suppressCluster} />
              ) : showMilestones ? (
                <DealMilestonesView onBack={() => setShowMilestones(false)} managerFilter={filters.manager} />
              ) : isLoading ? (
                <DealsListSkeleton groupBy={groupBy} />
              ) : viewMode === 'pipeline' ? (
                <DealsPipelineView
                  deals={deals}
                  onStatusChange={updateDealStatus}
                  onStageChange={handleStageChange}
                  onMarkReviewed={handleMarkReviewed}
                  onToggleFlag={handleToggleFlag}
                />
              ) : viewMode === 'timeline' ? (
                <DealsTimelineView deals={deals} />
              ) : (
                <DealsList 
                  deals={deals} 
                  onStatusChange={updateDealStatus} 
                  onStageChange={handleStageChange}
                  onMarkReviewed={handleMarkReviewed} 
                  onToggleFlag={handleToggleFlag} 
                  groupBy={groupBy}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  viewMode={viewMode}
                  expandAllSignal={expandAllSignal}
                  collapseAllSignal={collapseAllSignal}
                  collapsedGroups={collapsedGroups}
                  onCollapsedGroupsChange={setCollapsedGroups}
                  onToggleSort={toggleSort}
                  filters={filters}
                  onFiltersChange={updateFilters}
                />
              )}
              </div>
              {showInlineDetail && selectedDeal && (
                <aside
                  className="hidden lg:flex flex-col w-[clamp(546px,49.4vw,832px)] shrink-0 sticky top-4 self-start max-h-[calc(100vh-6rem)] rounded-xl border border-white/10 bg-background/40 overflow-hidden animate-slide-in-right"
                  aria-label="Selected deal summary"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground truncate">
                      {selectedDeal.company || 'Deal summary'}
                    </div>
                    <Button variant="ghost" size="sm" onClick={closeDetail} aria-label="Close deal summary">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 min-w-0 overflow-auto p-3">
                    <DealRundownMemoView
                      deal={selectedDeal as any}
                      onOpenDeal={(id) => setForceOverlayDealId(id)}
                    />
                  </div>
                </aside>
              )}
              </div>
              {showOverlayDetail && (
                <NaitiveDealOverlay
                  deal={selectedDeal}
                  orderedDeals={deals}
                  stages={overlayStages}
                  onClose={closeDetail}
                  onNavigate={(d) => {
                    const next = new URLSearchParams(overlaySearchParams);
                    next.set('deal', d.id);
                    setOverlaySearchParams(next, { replace: false });
                  }}
                  onStageChange={handleStageChange}
                />
              )}
              </>
                );
              })()}
      </WorkspacePage>
      </div>
    </>
  );
}
