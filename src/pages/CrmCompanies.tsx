import { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload, Building2, Loader2, RefreshCw, Download, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCrmCompaniesInfinite } from '@/hooks/useCrmCompanies';
import { CrmCompaniesTable } from '@/components/crm-companies/CrmCompaniesTable';
import { CreateCrmCompanyModal } from '@/components/crm-companies/CreateCrmCompanyModal';
import { ImportCrmCompaniesModal } from '@/components/crm-companies/ImportCrmCompaniesModal';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdvancedFilterBuilder } from '@/components/filters/AdvancedFilterBuilder';
import { COMPANY_CORE_FIELDS } from '@/lib/filterFieldDefinitions';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { exportCrmCompaniesToXlsx } from '@/lib/crmCompaniesXlsxExport';
import { useCompany } from '@/hooks/useCompany';

export default function CrmCompanies() {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const debouncedFilters = useDebouncedValue(advancedFilters, 500);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();
  const { company } = useCompany();

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useCrmCompaniesInfinite({
    quickFilter,
    advancedFilters: debouncedFilters,
    matchMode,
    search: debouncedSearch,
    firstPageSize: 100,
    pageSize: 50,
  });

  const companies = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);
  const totalCount = data?.pages[0]?.totalCount ?? companies.length;

  // Infinite-scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '1800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, companies.length]);

  // Always keep one page pre-fetched ahead of the user. As soon as the
  // current page settles, schedule the next one during idle time so the
  // sentinel never has to wait — scrolling feels seamless.
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isFetching || companies.length === 0) return;
    const idleWindow = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(() => void fetchNextPage(), { timeout: 1500 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = globalThis.setTimeout(() => void fetchNextPage(), 200);
    return () => globalThis.clearTimeout(id);
  }, [companies.length, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage]);

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
      queryClient.invalidateQueries({ queryKey: ['crm-companies-infinite'] });
    } catch (error: any) {
      toast.error('Failed to sync companies', { description: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExport = async () => {
    if (!company?.id) return;
    setIsExporting(true);
    try {
      const count = await exportCrmCompaniesToXlsx({
        orgCompanyId: company.id,
        quickFilter,
        advancedFilters: debouncedFilters,
        matchMode,
      });
      toast.success(`Exported ${count} companies`);
    } catch (e: any) {
      toast.error('Export failed', { description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFiltersChange = (filters: FilterRule[]) => {
    setAdvancedFilters(filters);
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {isExporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                    Actions
                    <ChevronDown className="h-4 w-4 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => handleExport()} disabled={isExporting}>
                    <Download className="h-4 w-4 mr-2" /> Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowImport(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Import
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
              <div>
                <CrmCompaniesTable
                  companies={companies}
                  leadingFilterSlot={
                    <>
                    <div className="relative w-[260px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search companies..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 pr-8 h-9"
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted"
                          aria-label="Clear search"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <AdvancedFilterBuilder
                      availableFields={COMPANY_CORE_FIELDS}
                      filters={advancedFilters}
                      onFiltersChange={handleFiltersChange}
                      matchMode={matchMode}
                      onMatchModeChange={setMatchMode}
                    />
                    </>
                  }
                />
              </div>
              <div ref={sentinelRef} className="py-6 flex items-center justify-center text-sm text-muted-foreground">
                {isFetchingNextPage ? (
                  <span className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    More companies loading…
                  </span>
                ) : hasNextPage ? (
                  <span className="text-xs">Scroll to load more</span>
                ) : companies.length > 0 ? (
                  <span className="text-xs">Showing all {companies.length.toLocaleString()} companies</span>
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>

      <CreateCrmCompanyModal open={showCreate} onClose={() => setShowCreate(false)} />
      <ImportCrmCompaniesModal open={showImport} onClose={() => setShowImport(false)} />
    </>
  );
}
