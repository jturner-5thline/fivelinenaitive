import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown, X, AlertTriangle, Flag, ArrowUpDown, Flame, LayoutGrid, List } from 'lucide-react';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { DealFilters } from '@/components/deals/DealFilters';
import { DealsList } from '@/components/deals/DealsList';
import { DealsListSkeleton } from '@/components/deals/DealsListSkeleton';
import { SortField, SortDirection } from '@/hooks/useDeals';
import { WidgetsSection } from '@/components/deals/WidgetsSection';
import { WidgetsSectionSkeleton } from '@/components/deals/WidgetsSectionSkeleton';
import { StaleDealsWidget } from '@/components/deals/StaleDealsWidget';
import { MilestonesWidget } from '@/components/deals/MilestonesWidget';
import { NotificationsBar } from '@/components/deals/NotificationsBar';
import { FlexLeaderboardWidget } from '@/components/deals/FlexLeaderboardWidget';
import { EmailVerificationBanner } from '@/components/deals/EmailVerificationBanner';
import { DemoBanner } from '@/components/deals/DemoBanner';
import { DemoTour } from '@/components/deals/DemoTour';
import { FlaggedDealsPanel } from '@/components/deals/FlaggedDealsPanel';
import { AllSuggestionsWidget } from '@/components/deals/AllSuggestionsWidget';
import { CreateCompanyBanner } from '@/components/deals/CreateCompanyBanner';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { useDeals } from '@/hooks/useDeals';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';
import { useWidgets } from '@/contexts/WidgetsContext';

export default function Dashboard() {
  const [groupByStatus, setGroupByStatus] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { deals: allDeals, isLoading, refreshDeals, updateDeal } = useDealsContext();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  const { isFirstTimeUser, dismissAllHints } = useFirstTimeHints();
  const { specialWidgets } = useWidgets();
  const { preferences } = usePreferences();
  
  const showOnboarding = !profileLoading && profile && !profile.onboarding_completed;
  
  const {
    deals,
    filters,
    sortField,
    sortDirection,
    updateDealStatus,
    updateFilters,
    toggleSort,
  } = useDeals();

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

  const handleToggleFlag = async (dealId: string, isFlagged: boolean) => {
    try {
      await updateDeal(dealId, { isFlagged });
      toast({ 
        title: isFlagged ? "Deal flagged" : "Flag removed", 
        description: isFlagged ? "Deal marked for discussion." : "Flag has been removed from the deal." 
      });
    } catch (error) {
      toast({ 
        title: "Failed to update flag", 
        description: "Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Deals - nAItive</title>
        <meta
          name="description"
          content="Manage your deal pipeline with advanced filtering, sorting, and status tracking."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DealsHeader />

        <main className="container mx-auto max-w-7xl px-4 pt-4 pb-3 sm:px-6 lg:px-8">
          <OnboardingModal open={showOnboarding} onComplete={completeOnboarding} />
          <DemoTour />
          <EmailVerificationBanner />
          <DemoBanner onDataCleared={refreshDeals} />
          <CreateCompanyBanner />
          <div className="space-y-6">
            {/* Page Header & Widgets */}
            <div className="space-y-3">
              <div 
                className="flex items-center justify-between opacity-0"
                style={{ animation: 'fadeInUp 0.4s ease-out forwards' }}
              >
                <h1 className="text-3xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">5th Line</h1>
                <div className="flex items-center gap-2">
                  <FlaggedDealsPanel deals={allDeals} />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    {specialWidgets['stale-deals'] && <StaleDealsWidget deals={allDeals} />}
                    {specialWidgets['milestones'] && <MilestonesWidget />}
                    {specialWidgets['flex-leaderboard'] && <FlexLeaderboardWidget deals={allDeals} />}
                  </div>
                  
                  {/* Smart Suggestions Widget - spans full width */}
                  <div className="mt-4">
                    <AllSuggestionsWidget deals={allDeals} />
                  </div>
                </div>
              )}
              <div 
                className="opacity-0"
                style={{ animation: 'fadeInUp 0.4s ease-out 0.15s forwards' }}
              >
                <NotificationsBar deals={allDeals} />
              </div>
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
              <DealFilters
                filters={filters}
                onFilterChange={updateFilters}
              />
            </div>

            {/* Results Count & Group Toggle */}
            <div 
              className="flex items-center justify-between opacity-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 0.25s forwards' }}
            >
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{deals.length}</span>{' '}
                {deals.length === 1 ? 'deal' : 'deals'}
              </p>
              <div className="flex items-center gap-3">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={filters.staleOnly}
                        onPressedChange={(pressed) => updateFilters({ staleOnly: pressed })}
                        variant="outline"
                        size="sm"
                        className={`h-8 w-8 p-0 ${filters.staleOnly ? 'bg-warning/20 border-warning text-warning hover:bg-warning/30' : ''}`}
                      >
                        <AlertTriangle className="h-4 w-4" />
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
                        onPressedChange={(pressed) => updateFilters({ flaggedOnly: pressed })}
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
                    className="h-8 px-2.5 rounded-l-none"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
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
            </div>

            {/* Deals Grid/List */}
            <div 
              className="opacity-0"
              style={{ animation: 'fadeInUp 0.4s ease-out 0.3s forwards' }}
            >
              {isLoading ? (
                <DealsListSkeleton groupByStatus={groupByStatus} />
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
      </div>
    </>
  );
}
