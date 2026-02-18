import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown, X, AlertTriangle, Flag, ArrowUpDown, Flame, LayoutGrid, List, ChevronRight, Kanban, Bell, Target, Settings2 } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { DealFilters } from '@/components/deals/DealFilters';
import { MilestoneManagerFilter } from '@/components/deals/MilestoneManagerFilter';
import { DealsList } from '@/components/deals/DealsList';
import { DealMilestonesView } from '@/components/deals/DealMilestonesView';
import { DealsPipelineView } from '@/components/deals/DealsPipelineView';
import { DealsListSkeleton } from '@/components/deals/DealsListSkeleton';
import { SortField, SortDirection } from '@/hooks/useDeals';
import { WidgetsSection } from '@/components/deals/WidgetsSection';
import { WidgetsSectionSkeleton } from '@/components/deals/WidgetsSectionSkeleton';
import { PipelineSelector } from '@/components/deals/PipelineSelector';



import { EmailVerificationBanner } from '@/components/deals/EmailVerificationBanner';
import { DemoBanner } from '@/components/deals/DemoBanner';
import { DemoTour } from '@/components/deals/DemoTour';
import { FlaggedDealsPanel } from '@/components/deals/FlaggedDealsPanel';

import { LatestUpdatesDropdown } from '@/components/deals/LatestUpdatesDropdown';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { FlaggedDealsCarousel } from '@/components/deals/FlaggedDealsCarousel';
import { CreateCompanyBanner } from '@/components/deals/CreateCompanyBanner';
import { FloatingDealsAssistant } from '@/components/deals/FloatingDealsAssistant';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { useDeals } from '@/hooks/useDeals';
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

export default function Dashboard() {
  const [groupByStatus, setGroupByStatus] = useState(true);
  const [showMilestones, setShowMilestones] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'pipeline'>(() => {
    const stored = localStorage.getItem('deals-view-mode');
    return (stored === 'grid' || stored === 'list' || stored === 'pipeline') ? stored : 'grid';
  });
  const [flaggedCarouselOpen, setFlaggedCarouselOpen] = useState(false);
  const { deals: allDeals, isLoading, refreshDeals, updateDeal } = useDealsContext();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  const { isFirstTimeUser, dismissAllHints } = useFirstTimeHints();
  const { activePipelineId, pipelines } = usePipelineContext();
  
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
  } = useDeals();

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

  // Apply hasNotificationsOnly filter
  const deals = useMemo(() => {
    if (!filters.hasNotificationsOnly) return pipelineFilteredDeals;
    return pipelineFilteredDeals.filter(deal => (notificationCounts[deal.id] || 0) > 0);
  }, [pipelineFilteredDeals, filters.hasNotificationsOnly, notificationCounts]);

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

  const handleStageChange = async (dealId: string, newStage: string) => {
    try {
      await updateDeal(dealId, { stage: newStage });
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
          <DemoTour />
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
                  <h1 className="text-2xl sm:text-3xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">5th Line</h1>
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
                  <WidgetsSection deals={allDeals} />
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
              <div className="flex items-center gap-2">
                {showMilestones ? (
                  <MilestoneManagerFilter
                    selected={filters.manager}
                    onChange={(manager) => updateFilters({ manager })}
                  />
                ) : (
                  <div className="flex-1">
                    <DealFilters
                      filters={filters}
                      onFilterChange={updateFilters}
                    />
                  </div>
                )}
                <Button
                  variant={showMilestones ? 'secondary' : 'outline'}
                  size="sm"
                  className="gap-2 h-9 shrink-0 border-transparent bg-gradient-to-r from-[#2563EB]/20 to-[#38BDF8]/20 hover:from-[#2563EB]/30 hover:to-[#38BDF8]/30 transition-all"
                  style={{ border: '1px solid transparent', backgroundClip: 'padding-box', boxShadow: '0 0 0 1px #2563EB66, inset 0 0 0 0 transparent' }}
                  onClick={() => setShowMilestones(!showMilestones)}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="url(#milestones-icon-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <defs>
                      <linearGradient id="milestones-icon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2563EB" />
                        <stop offset="100%" stopColor="#38BDF8" />
                      </linearGradient>
                    </defs>
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                  Milestones
                </Button>
              </div>
            </div>

            {/* Results Count & Group Toggle */}
            {!showMilestones && <div 
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 opacity-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 0.25s forwards' }}
            >
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{deals.length}</span>{' '}
                {deals.length === 1 ? 'deal' : 'deals'}
              </p>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
                        className={`h-8 w-8 p-0 relative ${filters.staleOnly ? 'bg-warning/20 border-warning text-warning hover:bg-warning/30' : ''}`}
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
                        className={`h-8 w-8 p-0 ${filters.flaggedOnly ? 'bg-destructive/20 border-destructive text-destructive hover:bg-destructive/30' : ''}`}
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
                        className={`h-8 w-8 p-0 ${filters.hasNotificationsOnly ? 'bg-destructive/20 border-destructive text-destructive hover:bg-destructive/30' : ''}`}
                      >
                        <Bell className="h-4 w-4" />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Show only deals with notifications</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="h-4 w-px bg-border" />

                {/* Sort Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 h-8">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      Sort
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
                    <DropdownMenuItem onClick={() => toggleSort('flexEngagement')} className={`gap-2 ${sortField === 'flexEngagement' ? 'bg-accent' : ''}`}>
                      <Flame className="h-3.5 w-3.5 text-orange-500" />
                      FLEx Engagement {sortField === 'flexEngagement' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Columns Config */}
                {viewMode === 'list' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-52 p-3">
                      <p className="text-sm font-medium text-foreground mb-2">Toggle columns</p>
                      <div className="space-y-2">
                        {ALL_COLUMNS.map(colId => (
                          <div key={colId} className="flex items-center gap-2">
                            <Checkbox
                              id={`col-${colId}`}
                              checked={visibleColumns.has(colId)}
                              disabled={colId === 'company'}
                              onCheckedChange={() => toggleColumnVisibility(colId)}
                            />
                            <Label htmlFor={`col-${colId}`} className="text-sm font-normal cursor-pointer">
                              {COLUMN_LABELS[colId]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <div className="h-4 w-px bg-border" />

                {/* View Mode Toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 px-2.5 rounded-r-none"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 px-2.5 rounded-none border-x"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'pipeline' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 px-2.5 rounded-l-none"
                    onClick={() => setViewMode('pipeline')}
                  >
                    <Kanban className="h-4 w-4" />
                  </Button>
                </div>

                {viewMode === 'grid' && (
                  <>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <Switch
                        id="group-by-status"
                        checked={groupByStatus}
                        onCheckedChange={setGroupByStatus}
                      />
                      <Label htmlFor="group-by-status" className="text-sm text-muted-foreground cursor-pointer">
                        Group by Status
                      </Label>
                    </div>
                  </>
                )}
              </div>
            </div>}

            {/* Deals Grid/List/Pipeline or Milestones */}
            <div 
              className="opacity-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 0.3s forwards' }}
            >
              {showMilestones ? (
                <DealMilestonesView onBack={() => setShowMilestones(false)} managerFilter={filters.manager} />
              ) : isLoading ? (
                <DealsListSkeleton groupByStatus={groupByStatus} />
              ) : viewMode === 'pipeline' ? (
                <DealsPipelineView
                  deals={deals}
                  onStatusChange={updateDealStatus}
                  onStageChange={handleStageChange}
                  onMarkReviewed={handleMarkReviewed}
                  onToggleFlag={handleToggleFlag}
                />
              ) : (
                <DealsList 
                  deals={deals} 
                  onStatusChange={updateDealStatus} 
                  onMarkReviewed={handleMarkReviewed} 
                  onToggleFlag={handleToggleFlag} 
                  groupByStatus={groupByStatus}
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
      </div>
    </>
  );
}
