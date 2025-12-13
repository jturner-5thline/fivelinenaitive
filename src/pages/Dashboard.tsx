import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DealFilters } from '@/components/dashboard/DealFilters';
import { DealsList } from '@/components/dashboard/DealsList';
import { WidgetsSection } from '@/components/dashboard/WidgetsSection';
import { useDeals } from '@/hooks/useDeals';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { mockDeals } from '@/data/mockDeals';

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

        <main className="container mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Page Header & Widgets */}
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold text-foreground">5th Line</h1>
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
