import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DealFilters } from '@/components/dashboard/DealFilters';
import { DealsList } from '@/components/dashboard/DealsList';
import { DealsListSkeleton } from '@/components/dashboard/DealsListSkeleton';
import { WidgetsSection } from '@/components/dashboard/WidgetsSection';
import { WidgetsSectionSkeleton } from '@/components/dashboard/WidgetsSectionSkeleton';
import { NotificationsBar } from '@/components/dashboard/NotificationsBar';
import { EmailVerificationBanner } from '@/components/dashboard/EmailVerificationBanner';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { useDeals } from '@/hooks/useDeals';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';

export default function Dashboard() {
  const [groupByStatus, setGroupByStatus] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const { deals: allDeals, isLoading } = useDealsContext();
  const { profile, isLoading: profileLoading, completeOnboarding } = useProfile();
  
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

  const dealsForExport = useMemo(() => {
    return deals.filter(deal => {
      const dealDate = new Date(deal.createdAt);
      if (dateFrom && dealDate < dateFrom) return false;
      if (dateTo && dealDate > dateTo) return false;
      return true;
    });
  }, [deals, dateFrom, dateTo]);

  const dateRangeLabel = dateFrom || dateTo
    ? `${dateFrom ? format(dateFrom, 'MMM d') : 'Start'} - ${dateTo ? format(dateTo, 'MMM d') : 'End'}`
    : 'All dates';

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
          <EmailVerificationBanner />
          <div className="space-y-6">
            {/* Page Header & Widgets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold bg-brand-gradient bg-clip-text text-transparent">5th Line</h1>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {dateRangeLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="end">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">From</Label>
                          <Calendar
                            mode="single"
                            selected={dateFrom}
                            onSelect={setDateFrom}
                            className={cn("p-0 pointer-events-auto")}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">To</Label>
                          <Calendar
                            mode="single"
                            selected={dateTo}
                            onSelect={setDateTo}
                            className={cn("p-0 pointer-events-auto")}
                          />
                        </div>
                        {(dateFrom || dateTo) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setDateFrom(undefined);
                              setDateTo(undefined);
                            }}
                          >
                            Clear dates
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
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
                        exportPipelineToCSV(dealsForExport);
                        toast({ title: "CSV exported", description: `${dealsForExport.length} deals exported to CSV.` });
                      }}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        exportPipelineToPDF(dealsForExport);
                        toast({ title: "PDF exported", description: `${dealsForExport.length} deals exported to PDF.` });
                      }}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        await exportPipelineToWord(dealsForExport);
                        toast({ title: "Word document exported", description: `${dealsForExport.length} deals exported to Word.` });
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
      </div>
    </>
  );
}
