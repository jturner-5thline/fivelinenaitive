import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload, Building2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrmCompanies } from '@/hooks/useCrmCompanies';
import { CrmCompaniesTable } from '@/components/crm-companies/CrmCompaniesTable';
import { CreateCrmCompanyModal } from '@/components/crm-companies/CreateCrmCompanyModal';
import { TablePagination } from '@/components/shared/TablePagination';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdvancedFilterBuilder } from '@/components/filters/AdvancedFilterBuilder';
import { COMPANY_CORE_FIELDS } from '@/lib/filterFieldDefinitions';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function CrmCompanies() {
  const [showCreate, setShowCreate] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [isSyncing, setIsSyncing] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const debouncedFilters = useDebouncedValue(advancedFilters, 500);
  const queryClient = useQueryClient();

  const { data: result, isLoading, isFetching } = useCrmCompanies({
    page,
    pageSize,
    quickFilter,
    advancedFilters: debouncedFilters,
    matchMode,
  });

  const companies = result?.data ?? [];
  const totalCount = result?.totalCount ?? 0;
  const totalPages = result?.totalPages ?? 0;

  const showSyncBanner = !isLoading && totalCount === 0;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      let afterCursor: string | undefined;
      let totalSynced = 0;

      do {
        const body = afterCursor ? { after: afterCursor } : {};
        const { data, error } = await supabase.functions.invoke('sync-hubspot-companies', { body });
        if (error) throw error;
        const r = data as { count?: number; error?: string; timed_out?: boolean; resume_after?: string };
        if (r.error) throw new Error(r.error);

        totalSynced += r.count || 0;
        afterCursor = r.timed_out ? r.resume_after : undefined;

        if (r.timed_out) {
          toast.info(`Synced ${totalSynced} companies so far, continuing...`);
        }
      } while (afterCursor);

      toast.success(`Synced ${totalSynced} companies from HubSpot`);
      queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
    } catch (error: any) {
      toast.error('Failed to sync companies', { description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickFilterChange = (value: string) => {
    setQuickFilter(value);
    setPage(0);
  };

  const handleFiltersChange = (filters: FilterRule[]) => {
    setAdvancedFilters(filters);
    setPage(0);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  return (
    <>
      <Helmet>
        <title>Companies | naitive</title>
        <meta name="description" content="Manage B2B accounts, customers, and prospects." />
      </Helmet>

      <div className="bg-transparent">
        <main className="w-full px-4 pt-4 pb-3 sm:px-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Companies</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Sync HubSpot
              </Button>
              <Button variant="outline" size="sm"><Upload className="h-4 w-4 mr-1.5" /> Import</Button>
              <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Company</Button>
            </div>
          </div>

          {showSyncBanner && (
            <div className="rounded-lg border border-border bg-muted/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">No companies yet</p>
                <p className="text-xs text-muted-foreground">Sync your HubSpot companies to populate this page.</p>
              </div>
              <Button size="sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Building2 className="h-4 w-4 mr-1.5" />}
                Sync from HubSpot
              </Button>
            </div>
          )}

          {/* Advanced Filters */}
          <AdvancedFilterBuilder
            availableFields={COMPANY_CORE_FIELDS}
            filters={advancedFilters}
            onFiltersChange={handleFiltersChange}
            matchMode={matchMode}
            onMatchModeChange={setMatchMode}
          />

          <Tabs value={quickFilter} onValueChange={handleQuickFilterChange}>
            <TabsList>
              <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
              <TabsTrigger value="prospects">Prospects</TabsTrigger>
              <TabsTrigger value="churn_risk">Churn Risk</TabsTrigger>
              <TabsTrigger value="renewal_90d">Renewals 90d</TabsTrigger>
              <TabsTrigger value="no_activity_30d">No Activity 30d</TabsTrigger>
            </TabsList>
          </Tabs>

          {isLoading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 max-w-sm" />
                <Skeleton className="h-9 w-[150px]" />
                <Skeleton className="h-9 w-[130px]" />
              </div>
              <div className="border rounded-lg overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 border-b last:border-b-0">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-6 w-6 rounded" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className={isFetching ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
                <CrmCompaniesTable companies={companies} />
              </div>
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                isLoading={isFetching}
              />
            </>
          )}
        </main>
      </div>

      <CreateCrmCompanyModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
