import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload, RefreshCw, Loader2, Link2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContacts } from '@/hooks/useContacts';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { TablePagination } from '@/components/shared/TablePagination';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdvancedFilterBuilder } from '@/components/filters/AdvancedFilterBuilder';
import { CONTACT_CORE_FIELDS } from '@/lib/filterFieldDefinitions';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CrmUpdateQueueButton } from '@/components/crm/CrmUpdateQueueButton';
import { exportContactsToXlsx } from '@/lib/contactsXlsxExport';
import { useCompany } from '@/hooks/useCompany';
import { applyFiltersToQuery } from '@/lib/filterUtils';

export default function Contacts() {
  const [showCreate, setShowCreate] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const debouncedFilters = useDebouncedValue(advancedFilters, 500);
  const queryClient = useQueryClient();
  const { company } = useCompany();

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true);
    try {
      let afterCursor: string | undefined;
      let columnMap: Record<string, string> | undefined;
      let totalSynced = 0;
      let columnsCreated: string[] = [];

      do {
        const body: any = {};
        if (afterCursor) { body.after = afterCursor; body.columnMap = columnMap; }
        const { data, error } = await supabase.functions.invoke('sync-hubspot-contacts', { body });
        if (error) throw error;
        const result = data as any;
        if (result.error) throw new Error(result.error);

        totalSynced += result.count || 0;
        if (result.columns_created?.length) columnsCreated = [...columnsCreated, ...result.columns_created];
        afterCursor = result.timed_out ? result.resume_after : undefined;
        columnMap = result.column_map;

        if (result.timed_out) {
          toast.info(`Synced ${totalSynced} contacts so far, continuing...`);
        }
      } while (afterCursor);

      toast.success(`Synced ${totalSynced} contacts from HubSpot${columnsCreated.length ? ` (${columnsCreated.length} new fields)` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (error: any) {
      toast.error('Failed to sync contacts', { description: error.message });
    } finally {
      setIsSyncingContacts(false);
    }
  };

  const handleMatchCompanies = async () => {
    setIsMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke('match-contacts-companies');
      if (error) throw error;
      const r = data as { matched?: number; unmatched?: number; total?: number; error?: string };
      if (r.error) throw new Error(r.error);
      toast.success(`Matched ${r.matched} of ${r.total} contacts to companies`);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (error: any) {
      toast.error('Failed to match contacts', { description: error.message });
    } finally {
      setIsMatching(false);
    }
  };

  const handleExport = async () => {
    if (!company?.id) return;
    setIsExporting(true);
    try {
      const count = await exportContactsToXlsx({
        orgCompanyId: company.id,
        quickFilter,
        advancedFilters: debouncedFilters,
        matchMode,
      });
      toast.success(`Exported ${count} contacts`);
    } catch (e: any) {
      toast.error('Export failed', { description: e.message });
    } finally {
      setIsExporting(false);
    }
  };

  const { data: result, isLoading, isFetching } = useContacts({
    page,
    pageSize,
    quickFilter,
    advancedFilters: debouncedFilters,
    matchMode,
  });

  const contacts = result?.data ?? [];
  const totalCount = result?.totalCount ?? 0;
  const totalPages = result?.totalPages ?? 0;

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
        <title>Contacts | naitive</title>
        <meta name="description" content="Manage your sales contacts, leads, and prospects." />
      </Helmet>

      <div className="bg-transparent">
        <main className="w-full px-4 pt-4 pb-3 sm:px-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
            <div className="flex items-center gap-2">
              <CrmUpdateQueueButton />
              <Button variant="outline" size="sm" onClick={handleSyncContacts} disabled={isSyncingContacts}>
                {isSyncingContacts ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Sync HubSpot
              </Button>
              <Button variant="outline" size="sm" onClick={handleMatchCompanies} disabled={isMatching}>
                {isMatching ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />}
                Match Companies
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                {isExporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                Export
              </Button>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1.5" /> Import
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Contact
              </Button>
            </div>
          </div>

          {/* Advanced Filters */}
          <AdvancedFilterBuilder
            availableFields={CONTACT_CORE_FIELDS}
            filters={advancedFilters}
            onFiltersChange={handleFiltersChange}
            matchMode={matchMode}
            onMatchModeChange={setMatchMode}
          />

          {/* Quick filters */}
          <Tabs value={quickFilter} onValueChange={handleQuickFilterChange}>
            <TabsList>
              <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
              <TabsTrigger value="new_leads">New Leads</TabsTrigger>
              <TabsTrigger value="meeting_scheduled">Meeting Scheduled</TabsTrigger>
              <TabsTrigger value="high_score">High Score</TabsTrigger>
              <TabsTrigger value="no_activity_7d">No Activity 7d</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 max-w-sm" />
                <Skeleton className="h-9 w-[150px]" />
                <Skeleton className="h-9 w-[150px]" />
              </div>
              <div className="border rounded-lg overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 border-b last:border-b-0">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className={isFetching ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
                <ContactsTable contacts={contacts} />
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

      <CreateContactModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
