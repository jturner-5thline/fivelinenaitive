import { useState, useEffect, useMemo, useCallback } from 'react';
import { DealSizeConfirmDialog } from '@/components/deals/DealSizeConfirmDialog';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown, X, AlertTriangle, Flag, ArrowUpDown, Flame, LayoutGrid, List, ChevronRight, Kanban, Bell, Target, Settings2, Layers, ChartGantt } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { DealFilters } from '@/components/deals/DealFilters';
import { MilestoneManagerFilter } from '@/components/deals/MilestoneManagerFilter';
import { DealsList } from '@/components/deals/DealsList';
import { DealMilestonesView } from '@/components/deals/DealMilestonesView';
import { DealsPipelineView } from '@/components/deals/DealsPipelineView';
import { DealsTimelineView } from '@/components/deals/DealsTimelineView';
import { DealsListSkeleton } from '@/components/deals/DealsListSkeleton';
import { SortField, SortDirection } from '@/hooks/useDeals';
import { WidgetsSection } from '@/components/deals/WidgetsSection';
import { WidgetsSectionSkeleton } from '@/components/deals/WidgetsSectionSkeleton';
import { PipelineSelector } from '@/components/deals/PipelineSelector';



import { EmailVerificationBanner } from '@/components/deals/EmailVerificationBanner';
import { DemoBanner } from '@/components/deals/DemoBanner';

import { FlaggedDealsPanel } from '@/components/deals/FlaggedDealsPanel';

import { LatestUpdatesDropdown } from '@/components/deals/LatestUpdatesDropdown';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { FlaggedDealsCarousel } from '@/components/deals/FlaggedDealsCarousel';
import { CreateCompanyBanner } from '@/components/deals/CreateCompanyBanner';
import { FloatingDealsAssistant } from '@/components/deals/FloatingDealsAssistant';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { useDeals, DEFAULT_DEAL_FILTERS } from '@/hooks/useDeals';
import { useDealSavedViews, DealViewConfig } from '@/hooks/useDealSavedViews';
import { DealSavedViewsMenu } from '@/components/deals/DealSavedViewsMenu';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { usePipelineContext } from '@/contexts/PipelineContext';
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
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;

  // Deal size confirmation — match stage labels (case-insensitive) for 5th Line only
  const DEAL_SIZE_CONFIRM_STAGE_LABELS = ['proposal issued', 'terms issued', 'in diligence', 'in due diligence'];
  const [sizeConfirm, setSizeConfirm] = useState<{
    dealId: string;
    dealName: string;
    currentValue: number;
    newStage: string;
    newStageLabel: string;
  } | null>(null);

  const { views: savedViews, saveView, deleteView, setDefault, getDefaultView } = useDealSavedViews();
  const defaultView = getDefaultView();

  const [groupBy, setGroupBy] = useState<string | null>(defaultView?.config.groupBy ?? 'status');
  const [showMilestones, setShowMilestones] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'pipeline' | 'timeline'>(() => {
    if (defaultView) {
      const m = defaultView.config.viewMode;
      if (m === 'timeline' && !is5thLine) return 'grid';
      return m;
    }
    const stored = localStorage.getItem('deals-view-mode');
    if (stored === 'timeline' && !is5thLine) return 'grid';
    return (stored === 'grid' || stored === 'list' || stored === 'pipeline' || stored === 'timeline') ? stored : 'grid';
  });
  const [flaggedCarouselOpen, setFlaggedCarouselOpen] = useState(false);
  const { deals: allDeals, isLoading, refreshDeals, updateDeal } = useDealsContext();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  const { isFirstTimeUser, dismissAllHints } = useFirstTimeHints();
  const { activePipelineId, pipelines } = usePipelineContext();
  const { company } = useCompany();
  
  const { preferences } = usePreferences();
  const { visibleColumns, toggleColumnVisibility } = useDealListColumnOrder();

  useEffect(() => {
    localStorage.setItem('deals-view-mode', viewMode);
  }, [viewMode]);
  
  
  const showOnboarding = !profileLoading && profile && !profile.onboarding_completed;
  
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
    initialSortField: defaultView.config.sortField,
    initialSortDirection: defaultView.config.sortDirection,
  } : undefined);

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
    };
    saveView(name, config);
  };

  const handleRestoreView = (view: typeof savedViews[0]) => {
    setFilters(view.config.filters);
    setSortField(view.config.sortField);
    setSortDirection(view.config.sortDirection);
    setViewMode(view.config.viewMode);
    setGroupBy(view.config.groupBy);
  };

  // Filter deals by active pipeline (include unassigned deals in the default pipeline)
  const activePipelineIsDefault = activePipelineId && pipelines.find(p => p.id === activePipelineId)?.isDefault;
  const pipelineFilteredDeals = useMemo(() => {
    if (!activePipelineId) return allFilteredDeals;
    return allFilteredDeals.filter(deal => 
      deal.pipelineId === activePipelineId || (!deal.pipelineId && activePipelineIsDefault)
    );
  }, [allFilteredDeals, activePipelineId, activePipelineIsDefault]);

  // Get notification counts for filtering
  const allDealIds = useMemo(() => pipelineFilteredDeals.map(d => d.id), [pipelineFilteredDeals]);
  const notificationCounts = useDealNotificationCounts(allDealIds);

  // Count stale deals
  const staleDealCount = useMemo(() => {
    return pipelineFilteredDeals.filter(deal => {
      if (deal.status === 'archived') return false;
      const days = Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      return days >= preferences.staleDealsDays;
    }).length;
  }, [pipelineFilteredDeals, preferences.staleDealsDays]);

  // Apply hasNotificationsOnly filter - must match DealCard notification logic
  const deals = useMemo(() => {
    if (!filters.hasNotificationsOnly) return pipelineFilteredDeals;
    return pipelineFilteredDeals.filter(deal => {
      let count = notificationCounts[deal.id] || 0;
      // Count stale lenders (same logic as DealCard)
      deal.lenders?.forEach(lender => {
        if (lender.trackingStatus === 'active' && lender.updatedAt) {
          const days = Math.floor((Date.now() - new Date(lender.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
          if (days >= preferences.staleDealsDays) count++;
        }
      });
      // Count overdue milestones (same logic as DealCard)
      deal.milestones?.forEach(m => {
        if (!m.completed && m.dueDate && new Date(m.dueDate) < new Date()) count++;
      });
      return count > 0;
    });
  }, [pipelineFilteredDeals, filters.hasNotificationsOnly, notificationCounts, preferences.staleDealsDays]);

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
  }, [updateDeal, toast]);

  const handleStageChange = async (dealId: string, newStage: string) => {
    // For 5th Line users, prompt deal size confirmation on specific stages
    if (is5thLine) {
      // Normalize stage ID to label-like format for matching
      const normalizedStage = newStage.replace(/[-_]/g, ' ').toLowerCase();
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
            newStage,
            newStageLabel: newStage.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
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
      await updateDeal(dealId, { isFlagged, flagNotes: flagNotes ?? '' });
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

      <div className="bg-transparent">
        <DealsHeader />

        <main className="container mx-auto max-w-7xl px-4 pt-4 pb-3 sm:px-6 lg:px-8">
          <OnboardingModal open={showOnboarding} onComplete={completeOnboarding} />
          
          <EmailVerificationBanner />
          <DemoBanner onDataCleared={refreshDeals} />
          <CreateCompanyBanner />
          <div className="space-y-6">
            {/* Page Header & Widgets */}
            <div className="space-y-2">
              <div 
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 opacity-0"
                style={{ animation: 'fadeInUp 0.4s ease-out forwards' }}
              >
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">{company?.name || ''}</h1>
                  <PipelineSelector />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <NotificationsDropdown />
                  <LatestUpdatesDropdown />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export
                        <ChevronDown className="h-3 w-3" />
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {isLoading ? (
                <WidgetsSectionSkeleton />
              ) : (
                <div 
                  className="opacity-0"
                  style={{ animation: 'fadeInUp 0.4s ease-out 0.1s forwards' }}
                >
                  <WidgetsSection deals={deals} />
                </div>
              )}
            </div>
            
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
                    />
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

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={filters.hasNotificationsOnly}
                        onPressedChange={(pressed) => {
                          if (pressed) {
                            updateFilters({ hasNotificationsOnly: true, staleOnly: false, flaggedOnly: false });
                          } else {
                            updateFilters({ hasNotificationsOnly: false });
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 backdrop-blur-md border transition-all duration-200 ${filters.hasNotificationsOnly ? 'bg-gradient-to-br from-cyan-500/25 to-teal-600/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_hsl(185,70%,50%,0.2)] hover:from-cyan-500/30 hover:to-teal-600/25' : 'bg-gradient-to-br from-cyan-500/10 to-teal-600/5 border-cyan-500/20 text-cyan-400/60 hover:from-cyan-500/15 hover:to-teal-600/10 hover:border-cyan-500/35 hover:text-cyan-400'}`}
                      >
                        <Bell className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show only deals with notifications</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Sort Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 h-8 shrink-0">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Sort</span>
                      {sortField === 'flexEngagement' && (
                        <Flame className="h-3 w-3 text-orange-500" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
                    <DropdownMenuItem onClick={() => toggleSort('flexEngagement')} className={`gap-2 ${sortField === 'flexEngagement' ? 'bg-accent' : ''}`}>
                      <Flame className="h-3.5 w-3.5 text-orange-500" />
                      FLEx Engagement {sortField === 'flexEngagement' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {viewMode === 'grid' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                        <Layers className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setGroupBy(null)} className={!groupBy ? 'bg-accent' : ''}>
                        None
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy('status')} className={groupBy === 'status' ? 'bg-accent' : ''}>
                        Status
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy('stage')} className={groupBy === 'stage' ? 'bg-accent' : ''}>
                        Stage
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy('engagementType')} className={groupBy === 'engagementType' ? 'bg-accent' : ''}>
                        Engagement Type
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy('manager')} className={groupBy === 'manager' ? 'bg-accent' : ''}>
                        Manager
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy('lender')} className={groupBy === 'lender' ? 'bg-accent' : ''}>
                        Lender
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setGroupBy('referredBy')} className={groupBy === 'referredBy' ? 'bg-accent' : ''}>
                        Referred By
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* View Mode Dropdown */}
                <Select value={viewMode} onValueChange={(val: 'grid' | 'list' | 'pipeline' | 'timeline') => setViewMode(val)}>
                  <SelectTrigger className="h-8 w-10 px-0 justify-center [&>svg:last-child]:hidden shrink-0">
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
                    {is5thLine && (
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
                  className="gap-2 h-9 shrink-0"
                  onClick={() => setShowMilestones(!showMilestones)}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                  <span className="hidden sm:inline">Milestones</span>
                </Button>
                <DealSavedViewsMenu
                  views={savedViews}
                  onSave={handleSaveView}
                  onRestore={handleRestoreView}
                  onDelete={deleteView}
                  onSetDefault={setDefault}
                  hasActiveFilters={hasActiveFilters}
                />
              </div>
            </div>


            {/* Deals Grid/List/Pipeline or Milestones */}
            <div 
              className="opacity-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 0.3s forwards' }}
            >
              {showMilestones ? (
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
                />
              )}
            </div>
          </div>
        </main>

        {/* Dismiss all hints floating button */}
        {isFirstTimeUser && (
          <button
            onClick={() => {
              dismissAllHints();
              toast({ title: "Hints dismissed", description: "All hints have been hidden." });
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

        {/* Floating AI Assistant */}
        <FloatingDealsAssistant />

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
      </div>
    </>
  );
}
