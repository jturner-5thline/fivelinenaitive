import { Helmet } from 'react-helmet-async';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DealFilters } from '@/components/dashboard/DealFilters';
import { DealsList } from '@/components/dashboard/DealsList';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { useDeals } from '@/hooks/useDeals';

export default function Dashboard() {
  const {
    deals,
    filters,
    sortField,
    sortDirection,
    stats,
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

        <main className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-6">
            {/* Page Header */}
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Deal Pipeline</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Track and manage your active investment opportunities.
              </p>
            </div>

            {/* Stats */}
            <StatsCards stats={stats} />

            {/* Filters */}
            <DealFilters
              filters={filters}
              sortField={sortField}
              sortDirection={sortDirection}
              onFilterChange={updateFilters}
              onSortChange={toggleSort}
            />

            {/* Results Count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{deals.length}</span>{' '}
                {deals.length === 1 ? 'deal' : 'deals'}
              </p>
            </div>

            {/* Deals Grid */}
            <DealsList deals={deals} onStatusChange={updateDealStatus} />
          </div>
        </main>
      </div>
    </>
  );
}
