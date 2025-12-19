import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown, X } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DealFilters } from '@/components/dashboard/DealFilters';
import { DealsList } from '@/components/dashboard/DealsList';
import { DealsListSkeleton } from '@/components/dashboard/DealsListSkeleton';
import { WidgetsSection } from '@/components/dashboard/WidgetsSection';
import { WidgetsSectionSkeleton } from '@/components/dashboard/WidgetsSectionSkeleton';
import { NotificationsBar } from '@/components/dashboard/NotificationsBar';
import { EmailVerificationBanner } from '@/components/dashboard/EmailVerificationBanner';
import { DemoBanner } from '@/components/dashboard/DemoBanner';
import { DemoTour } from '@/components/dashboard/DemoTour';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { useDeals } from '@/hooks/useDeals';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';

export default function Dashboard() {
  const [groupByStatus, setGroupByStatus] = useState(true);
  const { deals: allDeals, isLoading, refreshDeals } = useDealsContext();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  const { isFirstTimeUser, dismissAllHints } = useFirstTimeHints();
  
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

  return (
    <>
      <Helmet>
        <title>Deal Pipeline - nAItive</title>
        <meta
          name="description"
          content="Manage your deal pipeline with advanced filtering, sorting, and status tracking."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <DashboardHeader />

        <main className="container mx-auto max-w-7xl px-4 pt-4 pb-3 sm:px-6 lg:px-8">
          <OnboardingModal open={showOnboarding} onComplete={completeOnboarding} />
          <DemoTour />
          <EmailVerificationBanner />
          <DemoBanner onDataCleared={refreshDeals} />
          <div className="space-y-6">
            {/* Page Header & Widgets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">5th Line</h1>
                <div className="flex items-center gap-2">
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
                <WidgetsSection deals={allDeals} />
              )}
              <NotificationsBar deals={allDeals} />
            </div>

            {/* Filters */}
            <DealFilters
              filters={filters}
              onFilterChange={updateFilters}
            />

            {/* Results Count & Group Toggle */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{deals.length}</span>{' '}
                {deals.length === 1 ? 'deal' : 'deals'}
              </p>
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
            </div>

            {/* Deals Grid */}
            {isLoading ? (
              <DealsListSkeleton groupByStatus={groupByStatus} />
            ) : (
              <DealsList deals={deals} onStatusChange={updateDealStatus} groupByStatus={groupByStatus} />
            )}
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
