import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
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
import { useWidgets } from '@/contexts/WidgetsContext';
import { PipelineSelector } from '@/components/deals/PipelineSelector';



import { EmailVerificationBanner } from '@/components/deals/EmailVerificationBanner';
import { DemoBanner } from '@/components/deals/DemoBanner';
import { NotificationConsentModal } from '@/components/notifications/NotificationConsentModal';

import { FlaggedDealsPanel } from '@/components/deals/FlaggedDealsPanel';

import { LatestUpdatesDropdown } from '@/components/deals/LatestUpdatesDropdown';
// NotificationsDropdown removed: notifications are merged into the Flag system.
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';
import { ShareReportDialog } from '@/components/deals/ShareReportDialog';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
import { usePipelineDealTasks } from '@/hooks/usePipelineDealTasks';
import { useAutoStaleFlags } from '@/hooks/useAutoStaleFlags';
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

  // Per-user last-used view state (filters/sort/view/grouping). Survives
  // page refreshes so users land back exactly where they left off, even
  // if they never explicitly saved a view. Loaded from localStorage
  // synchronously, then hydrated from the DB.
  const [lastViewState, persistLastViewState] = useDealsLastViewState(null);
  // Last-state wins over the org default view — it reflects the user's
  // most recent intent.
  const initialView = lastViewState ?? (defaultView?.config ?? null);

  // Grouping is optional and starts unset; we hydrate from the org default view
  // (or leave it null = ungrouped) once saved views finish loading. NEVER coerce
  // an empty/null grouping back to 'status' — that round-trips the user's choice.
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [showMilestones, setShowMilestones] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'pipeline' | 'timeline'>(() => {
    const fromInitial = initialView?.viewMode;
    if (fromInitial && (fromInitial === 'grid' || fromInitial === 'list' || fromInitial === 'pipeline' || fromInitial === 'timeline')) {
      if (fromInitial === 'timeline' && !companyFeatures.timeline_view_enabled) return 'grid';
      return fromInitial;
    }
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
  // Vertical offset (px) applied to the inline detail aside so its top
  // aligns with the clicked tile in the left list. Clamped so items near
  // the bottom of the list don't push the panel into excessive blank
  // space below the list.
  const detailAsideRef = useRef<HTMLElement | null>(null);
  const leftListColumnRef = useRef<HTMLDivElement | null>(null);
  const [detailOffset, setDetailOffset] = useState(0);
  const { isLoading: widgetsLoading } = useWidgets();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  const { isFirstTimeUser, dismissAllHints } = useFirstTimeHints();
  const { activePipelineId, pipelines, setActivePipelineId } = usePipelineContext();
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

  // Align the inline detail aside's top edge with the clicked deal tile.
  // We measure the tile's offset relative to the shared flex container
  // (which holds both the list and the aside) and translate the aside
  // downward by that amount. The offset is clamped so deals near the
  // bottom of the list don't push the panel into excessive blank space.
  const inlineSelectedDealId = overlaySearchParams.get('deal');
  // The inline detail aside is always anchored to the top of the shared
  // flex container so opening any deal — top, middle, or bottom of the
  // list — produces the exact same starting position. When switching
  // between deals we also reset the aside's internal scroll so each
  // newly opened deal starts from the same vertical origin.
  useLayoutEffect(() => {
    setDetailOffset(0);
    if (!inlineSelectedDealId) return;
    const aside = detailAsideRef.current;
    if (aside) {
      // Reset both the aside itself and any scrollable descendants so the
      // newly opened deal always renders from the top.
      aside.scrollTop = 0;
      aside.querySelectorAll<HTMLElement>('[data-scroll-root], .overflow-y-auto, .overflow-auto')
        .forEach((el) => { el.scrollTop = 0; });
    }
  }, [inlineSelectedDealId]);
  
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
  } = useDeals(initialView ? {
    initialFilters: initialView.filters,
    initialSortField: sanitizeSortField(initialView.sortField),
    initialSortDirection: initialView.sortDirection,
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
    // Prefer the user's last-used state over the org default view so a
    // refresh always lands the user back where they left off.
    const source = lastViewState ?? defaultView?.config ?? null;
    if (source) {
      defaultViewAppliedRef.current = true;
      setFilters(source.filters);
      setSortField(sanitizeSortField(source.sortField));
      setSortDirection(source.sortDirection);
      const m = source.viewMode;
      setViewMode(m === 'timeline' && !companyFeatures.timeline_view_enabled ? 'grid' : m);
      // Preserve null/undefined exactly — null means "ungrouped" by design.
      setGroupBy(source.groupBy ?? null);
      setCollapsedGroups(source.collapsedGroups ?? []);
    } else {
      defaultViewAppliedRef.current = true;
    }
  }, [savedViewsLoaded, defaultView, lastViewState, companyFeatures.timeline_view_enabled, setFilters, setSortField, setSortDirection]);

  // Persist current view state (debounced) so refresh restores it.
  // Only starts after initial hydration so we never clobber the saved
  // value with raw defaults during the first render pass.
  useEffect(() => {
    if (!defaultViewAppliedRef.current) return;
    const handle = window.setTimeout(() => {
      persistLastViewState({
        filters,
        sortField,
        sortDirection,
        viewMode,
        groupBy,
        collapsedGroups,
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [filters, sortField, sortDirection, viewMode, groupBy, collapsedGroups, persistLastViewState]);

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

  // Only auto-clear when a saved DEFAULT view is itself producing an empty
  // result — i.e. the current filter/sort state still matches what the saved
  // view applied. Manual toolbar toggles (e.g. clicking the Flag filter) must
  // never trigger a saved-view clear, even if they yield zero results.
  const savedViewLikelyHidingDeals = useMemo(() => {
    if (dealsInSelectedPipeline.length === 0 || pipelineFilteredDeals.length > 0) return false;
    if (!defaultView) return false;
    const cfg = defaultView.config;
    const sameFilters = JSON.stringify(filters) === JSON.stringify(cfg.filters);
    const sameSort = sortField === sanitizeSortField(cfg.sortField) && sortDirection === cfg.sortDirection;
    return sameFilters && sameSort;
  }, [dealsInSelectedPipeline.length, pipelineFilteredDeals.length, defaultView, filters, sortField, sortDirection]);

  useEffect(() => {
    if (!savedViewLikelyHidingDeals || isLoading || savedViewWarningDismissed) return;
    resetDealViewState({ clearSavedViews: true, showToast: true });
    toast({
      title: 'Saved view cleared',
      description: 'A saved view was hiding all deals in this pipeline, so it was removed.',
    });
  }, [isLoading, resetDealViewState, savedViewLikelyHidingDeals, savedViewWarningDismissed]);

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

  // Split open tasks into past-due vs current (non-overdue) so we can drive
  // the "Only past-due (no current)" tasks filter.
  const dealTaskBreakdown = useCallback((dealId: string) => {
    const arr = dealTasksMap?.get(dealId) || [];
    const now = Date.now();
    let pastDue = 0;
    let current = 0;
    for (const t of arr) {
      if (t.dueDate) {
        const due = new Date(t.dueDate).getTime();
        if (!Number.isNaN(due) && due < now) {
          pastDue++;
          continue;
        }
      }
      // No due date OR due today/future → treat as a "current" task.
      current++;
    }
    return { pastDue, current, total: arr.length };
  }, [dealTasksMap]);

  // Stale deals are now auto-flagged (see useAutoStaleFlags). We no longer
  // render a standalone "stale" toolbar filter — the standard Flag filter
  // surfaces them alongside manually flagged deals.
  useAutoStaleFlags(pipelineFilteredDeals, preferences.staleDealsDays);

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
        if (taskMode === 'overdue_only') {
          const { pastDue, current } = dealTaskBreakdown(deal.id);
          return pastDue > 0 && current === 0;
        }
        const has = dealHasTasks(deal.id);
        return taskMode === 'has' ? has : !has;
      });
    }

    return result;
  }, [pipelineFilteredDeals, filters.hasNotificationsOnly, filters.notificationsFilter, filters.tasksFilter, dealNotificationCount, dealHasTasks, dealTaskBreakdown]);

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
        mainClassName="flex min-h-0 flex-col pb-0"
        contentClassName="flex min-h-0 flex-1 flex-col space-y-0"
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
            <LatestUpdatesDropdown />
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md" aria-label="Actions">
                      <Settings2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Actions</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Actions</TooltipContent>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setShowMilestones(!showMilestones)}>
                  <Target className="h-4 w-4 mr-2" />
                  {showMilestones ? 'Hide milestones' : 'Show milestones'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.dispatchEvent(new Event('toggle-widgets-edit-mode'))}>
                  <Settings2 className="h-4 w-4 mr-2" />
                  Customize widgets
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Download className="h-4 w-4 mr-2" />
                    Export deals
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
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
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
              </DropdownMenu>
            </Tooltip>
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
                      afterSearchSlot={
                        (() => {
                          const isDefaultSort = sortField === 'updatedAt' && sortDirection === 'desc';
                          const viewIcon =
                            viewMode === 'grid' ? <LayoutGrid className="h-4 w-4" /> :
                            viewMode === 'list' ? <List className="h-4 w-4" /> :
                            viewMode === 'pipeline' ? <Kanban className="h-4 w-4" /> :
                            <ChartGantt className="h-4 w-4" />;
                          const sortOptions: Array<{ value: SortField; label: string }> = [
                            { value: 'updatedAt', label: 'Last Updated' },
                            { value: 'createdAt', label: 'Created Date' },
                            { value: 'value', label: 'Deal Value' },
                            { value: 'name', label: 'Name' },
                            { value: 'status', label: 'Status' },
                            { value: 'stage', label: 'Stage' },
                          ];
                          const groupOptions: Array<{ value: string; label: string }> = [
                            { value: 'status', label: 'Status' },
                            { value: 'stage', label: 'Stage' },
                            { value: 'engagementType', label: 'Engagement Type' },
                            { value: 'manager', label: 'Manager' },
                            { value: 'lender', label: 'Lender' },
                            { value: 'referredBy', label: 'Referred By' },
                          ];
                          const toggleGroup = (v: string) => setGroupBy(prev => (prev === v ? null : v));
                           const layoutOptions: Array<{ value: 'grid'|'list'|'pipeline'|'timeline'; label: string; icon: JSX.Element }> = [
                             { value: 'grid', label: 'Grid', icon: <LayoutGrid className="h-4 w-4 opacity-70" /> },
                             { value: 'list', label: 'List', icon: <List className="h-4 w-4 opacity-70" /> },
                             { value: 'pipeline', label: 'Pipeline', icon: <Kanban className="h-4 w-4 opacity-70" /> },
                             ...(companyFeatures.timeline_view_enabled ? [{ value: 'timeline' as const, label: 'Timeline', icon: <ChartGantt className="h-4 w-4 opacity-70" /> }] : []),
                           ];
                           const activeLayoutLabel = layoutOptions.find(o => o.value === viewMode)?.label;
                           const activeSortLabel = sortOptions.find(o => o.value === sortField)?.label;
                           const activeGroupLabel = groupBy ? (groupOptions.find(o => o.value === groupBy)?.label ?? 'None') : 'None';
                           return (
                             <DropdownMenu>
                               <Tooltip>
                                 <TooltipTrigger asChild>
                                   <DropdownMenuTrigger asChild>
                                     <Button
                                       variant="outline"
                                       size="sm"
                                       className="gap-1.5 h-9 px-2.5 shrink-0 transition-colors duration-200 hover:border-[hsl(292,46%,72%)]/60"
                                       aria-label="View options"
                                     >
                                       {viewIcon}
                                       <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                                     </Button>
                                   </DropdownMenuTrigger>
                                 </TooltipTrigger>
                                 <TooltipContent>Layout, sort & group</TooltipContent>
                               </Tooltip>
                               <DropdownMenuContent align="start" className="w-56">
                                 <DropdownMenuSub>
                                   <DropdownMenuSubTrigger className="flex items-center justify-between">
                                     <span className="inline-flex items-center gap-2">
                                       {viewIcon}
                                       <span>Layout</span>
                                     </span>
                                     {activeLayoutLabel && (
                                       <span className="ml-2 text-xs text-muted-foreground">{activeLayoutLabel}</span>
                                     )}
                                   </DropdownMenuSubTrigger>
                                   <DropdownMenuSubContent className="w-48" collisionPadding={8}>
                                     {layoutOptions.map(opt => (
                                       <DropdownMenuItem
                                         key={opt.value}
                                         onClick={() => setViewMode(opt.value)}
                                         className={cn(viewMode === opt.value && "bg-accent")}
                                       >
                                         {opt.icon}
                                         <span className="ml-2">{opt.label}</span>
                                       </DropdownMenuItem>
                                     ))}
                                   </DropdownMenuSubContent>
                                 </DropdownMenuSub>
                                 <DropdownMenuSub>
                                   <DropdownMenuSubTrigger className="flex items-center justify-between">
                                     <span className="inline-flex items-center gap-2">
                                       <ArrowUpDown className="h-4 w-4 opacity-70" />
                                       <span>Sort</span>
                                     </span>
                                     {activeSortLabel && (
                                       <span className="ml-2 text-xs text-muted-foreground">
                                         {activeSortLabel} {sortDirection === 'desc' ? '↓' : '↑'}
                                       </span>
                                     )}
                                   </DropdownMenuSubTrigger>
                                   <DropdownMenuSubContent className="w-56" collisionPadding={8}>
                                     {!isDefaultSort && (
                                       <>
                                         <DropdownMenuItem
                                           onClick={() => { setSortField('updatedAt'); setSortDirection('desc'); }}
                                         >
                                           <RotateCcw className="h-3.5 w-3.5 opacity-70" />
                                           <span className="ml-2">Reset to default</span>
                                         </DropdownMenuItem>
                                         <DropdownMenuSeparator />
                                       </>
                                     )}
                                     {sortOptions.map(opt => (
                                       <DropdownMenuItem
                                         key={opt.value}
                                         onClick={() => toggleSort(opt.value)}
                                         className={cn("justify-between", sortField === opt.value && "bg-accent")}
                                       >
                                         <span className="inline-flex items-center gap-2">
                                           <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
                                           {opt.label}
                                         </span>
                                         {sortField === opt.value && (
                                           <span className="text-xs text-muted-foreground">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                         )}
                                       </DropdownMenuItem>
                                     ))}
                                   </DropdownMenuSubContent>
                                 </DropdownMenuSub>
                                 {viewMode === 'grid' && (
                                   <DropdownMenuSub>
                                     <DropdownMenuSubTrigger className="flex items-center justify-between">
                                       <span className="inline-flex items-center gap-2">
                                         <Layers className="h-4 w-4 opacity-70" />
                                         <span>Group by</span>
                                       </span>
                                       <span className="ml-2 text-xs text-muted-foreground">{activeGroupLabel}</span>
                                     </DropdownMenuSubTrigger>
                                     <DropdownMenuSubContent className="w-48" collisionPadding={8}>
                                       <DropdownMenuItem
                                         onClick={() => setGroupBy(null)}
                                         className={cn(!groupBy && "bg-accent")}
                                       >
                                         <span>None</span>
                                       </DropdownMenuItem>
                                       {groupOptions.map(opt => (
                                         <DropdownMenuItem
                                           key={opt.value}
                                           onClick={() => toggleGroup(opt.value)}
                                           className={cn(groupBy === opt.value && "bg-accent")}
                                         >
                                           <Layers className="h-3.5 w-3.5 opacity-70" />
                                           <span className="ml-2">{opt.label}</span>
                                         </DropdownMenuItem>
                                       ))}
                                     </DropdownMenuSubContent>
                                   </DropdownMenuSub>
                                 )}
                               </DropdownMenuContent>
                             </DropdownMenu>
                           );
                        })()
                      }
                    />
                    <div className="mt-2">
                      <AIFilterChips />
                    </div>
                  </div>
                )}

                {/* Stale toggle removed — stale deals are auto-flagged and
                    surface via the Flag filter below (see useAutoStaleFlags). */}

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
                        className={`h-9 w-9 p-0 shrink-0 rounded-md backdrop-blur-md border transition-all duration-200 ${filters.flaggedOnly ? 'bg-gradient-to-br from-red-500/25 to-red-900/20 border-red-500/50 text-red-400 shadow-[0_0_12px_hsl(0,70%,45%,0.2)] hover:from-red-500/30 hover:to-red-900/25' : 'bg-gradient-to-br from-red-500/10 to-red-900/5 border-red-500/20 text-red-400/60 hover:from-red-500/15 hover:to-red-900/10 hover:border-red-500/35 hover:text-red-400'}`}
                      >
                        <Flag className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show only flagged deals</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Notifications tri-state removed: merged into the Flag toggle above. */}

                {is5thLine && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={showDuplicates}
                        onPressedChange={(pressed) => setShowDuplicates(pressed)}
                        variant="outline"
                        size="sm"
                        className={`h-9 w-9 p-0 shrink-0 rounded-md relative backdrop-blur-md border transition-all duration-200 ${showDuplicates ? 'bg-gradient-to-br from-violet-500/25 to-purple-600/20 border-violet-500/50 text-violet-400 shadow-[0_0_12px_hsl(270,70%,50%,0.2)] hover:from-violet-500/30 hover:to-purple-600/25' : 'bg-gradient-to-br from-violet-500/10 to-purple-600/5 border-violet-500/20 text-violet-400/60 hover:from-violet-500/15 hover:to-purple-600/10 hover:border-violet-500/35 hover:text-violet-400'}`}
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
                  'opacity-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain',
                  showInlineDetail && 'relative',
                )}
                style={{
                   animation: 'fadeInUp 0.4s ease-out 0.3s forwards',
                 }}
              >
              {showInlineDetail && selectedDeal ? (
                /*
                 * Unified workspace container: list + detail share one
                 * bordered surface so their top edges are inherently
                 * aligned beneath the page toolbar. The list column
                 * scrolls independently; the detail column hosts its
                 * own header / content / workbook-tab strip.
                 */
                <div
                  className="hidden lg:flex flex-1 min-h-0 rounded-2xl border border-white/[0.08] overflow-hidden bg-gradient-to-b from-white/[0.03] to-transparent"
                >
                  <div
                    ref={leftListColumnRef}
                    className="w-[288px] shrink-0 h-full overflow-y-auto overscroll-contain border-r border-white/[0.08]"
                  >
                    {filters.flaggedOnly && (() => {
                      const flagged = pipelineFilteredDeals.filter(d => d.isFlagged);
                      const total = flagged.length;
                      if (total === 0) return null;
                      const archived = flagged.filter(
                        d => d.status === 'archived' || d.stage === 'closed-lost'
                      ).length;
                      const active = total - archived;
                      return (
                        <div className="m-3 rounded-md border border-red-500/30 bg-gradient-to-r from-red-500/10 to-red-900/5 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                          <Flag className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Showing <strong className="font-semibold text-red-200">{total}</strong> flagged deal{total === 1 ? '' : 's'}.{' '}
                            <strong className="font-semibold text-red-200">{active}</strong> active,{' '}
                            <strong className="font-semibold text-red-200">{archived}</strong> archived.
                          </span>
                        </div>
                      );
                    })()}
                    {isLoading ? (
                      <DealsListSkeleton groupBy={groupBy} />
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
                        detailPanelOpen={showInlineDetail}
                      />
                    )}
                  </div>
                  <aside
                    ref={detailAsideRef}
                    className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-transparent"
                    aria-label="Selected deal summary"
                  >
                    <DealRundownMemoView
                      deal={selectedDeal as Deal}
                      onOpenDeal={(id) => setForceOverlayDealId(id)}
                      onClose={closeDetail}
                    />
                  </aside>
                  <style>{`
                    tr[data-deal-open-id="${selectedId}"] > td {
                      box-shadow: inset 0 0 0 1px rgba(155,111,212,.55), 0 8px 24px -12px rgba(155,111,212,.45) !important;
                    }
                    div[data-deal-open-id="${selectedId}"] {
                      box-shadow: inset 0 0 0 1px rgba(155,111,212,.55), 0 8px 24px -12px rgba(155,111,212,.45) !important;
                    }
                  `}</style>
                </div>
              ) : null}
              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col',
                  showInlineDetail && 'lg:hidden',
                )}
              >
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
                  detailPanelOpen={showInlineDetail}
                />
              )}
              </div>
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
