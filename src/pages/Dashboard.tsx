import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download, FileText, ChevronDown } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DealFilters } from '@/components/dashboard/DealFilters';
import { DealsList } from '@/components/dashboard/DealsList';
import { WidgetsSection } from '@/components/dashboard/WidgetsSection';
import { useDeals } from '@/hooks/useDeals';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { mockDeals } from '@/data/mockDeals';
import { toast } from '@/hooks/use-toast';
import { exportPipelineToCSV, exportPipelineToPDF, exportPipelineToWord } from '@/utils/dealExport';

export default function Dashboard() {
  const [groupByStatus, setGroupByStatus] = useState(true);
  
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
          <div className="space-y-6">
            {/* Page Header & Widgets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold text-foreground">5th Line</h1>
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
                      toast({ title: "CSV exported", description: "Pipeline data exported to CSV file." });
                    }}>
                      <FileText className="h-4 w-4 mr-2" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      exportPipelineToPDF(deals);
                      toast({ title: "PDF exported", description: "Pipeline report exported to PDF." });
                    }}>
                      <FileText className="h-4 w-4 mr-2" />
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => {
                      await exportPipelineToWord(deals);
                      toast({ title: "Word document exported", description: "Pipeline report exported to Word document." });
                    }}>
                      <FileText className="h-4 w-4 mr-2" />
                      Export as Word
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <WidgetsSection deals={mockDeals} />
            </div>

            {/* Filters */}
            <DealFilters
              filters={filters}
              sortField={sortField}
              sortDirection={sortDirection}
              onFilterChange={updateFilters}
              onSortChange={toggleSort}
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
            <DealsList deals={deals} onStatusChange={updateDealStatus} groupByStatus={groupByStatus} />
          </div>
        </main>
      </div>
    </>
  );
}
