import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Plus, Upload, RefreshCw, Loader2, Link2, Download, Tags, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContacts } from '@/hooks/useContacts';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { ImportContactsModal } from '@/components/contacts/ImportContactsModal';
import { ContactTaggingRulesDialog } from '@/components/contacts/ContactTaggingRulesDialog';
import { TablePagination } from '@/components/shared/TablePagination';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AdvancedFilterBuilder } from '@/components/filters/AdvancedFilterBuilder';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTACT_CORE_FIELDS } from '@/lib/filterFieldDefinitions';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CrmUpdateQueueButton } from '@/components/crm/CrmUpdateQueueButton';
import { exportContactsToXlsx } from '@/lib/contactsXlsxExport';
import { useCompany } from '@/hooks/useCompany';

export default function Contacts() {
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTaggingRules, setShowTaggingRules] = useState(false);
  const [quickFilter, setQuickFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchPreview, setMatchPreview] = useState<
    { would_match: number; unmatched_total: number; samples: Array<{ contact: string; email: string; company: string }> } | null
  >(null);
  const [isPreviewingMatch, setIsPreviewingMatch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState<FilterRule[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const normalizedSearch = search.trim();
  const searchableTerm = normalizedSearch;
  const debouncedSearch = useDebouncedValue(searchableTerm, 80);
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

  const handlePreviewMatchCompanies = async () => {
    setIsPreviewingMatch(true);
    try {
      const { data, error } = await supabase.functions.invoke('match-contacts-companies', {
        body: { dry_run: true },
      });
      if (error) throw error;
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      setMatchPreview({
        would_match: r.would_match ?? 0,
        unmatched_total: r.unmatched_total ?? 0,
        samples: r.samples ?? [],
      });
    } catch (error: any) {
      toast.error('Failed to preview matches', { description: error.message });
    } finally {
      setIsPreviewingMatch(false);
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
      setMatchPreview(null);
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
    search: debouncedSearch,
    quickFilter,
    advancedFilters: debouncedFilters,
    matchMode,
  });

  const contacts = result?.data ?? [];
  const totalCount = result?.totalCount ?? 0;
  const totalPages = result?.totalPages ?? 0;
  const isSearchPending = searchableTerm.length > 0 && isFetching;

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

  const handleSearchChange = (value: string) => {
    setSearch(value);
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {isMatching || isExporting || isPreviewingMatch ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : null}
                    Actions
                    <ChevronDown className="h-4 w-4 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onSelect={() => setShowTaggingRules(true)}>
                    <Tags className="h-4 w-4 mr-2" /> Tagging Rules
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => handlePreviewMatchCompanies()}
                    disabled={isMatching || isPreviewingMatch}
                  >
                    <Link2 className="h-4 w-4 mr-2" /> Match Companies
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleExport()} disabled={isExporting}>
                    <Download className="h-4 w-4 mr-2" /> Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowImport(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Import
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Contact
              </Button>
            </div>
          </div>

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
              {/* Never block pointer events during background fetches —
                  doing so freezes the search input mid-keystroke. */}
              <div>
                <ContactsTable
                  contacts={contacts}
                  search={search}
                  onSearchChange={handleSearchChange}
                  isFetching={isSearchPending}
                  toolbarExtras={
                    <div className="flex items-center gap-2">
                      <Select value={quickFilter} onValueChange={handleQuickFilterChange}>
                        <SelectTrigger className="h-9 w-[170px]">
                          <SelectValue placeholder="Quick filter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All contacts</SelectItem>
                          <SelectItem value="no_email">Missing email</SelectItem>
                          <SelectItem value="no_company">Missing company</SelectItem>
                          <SelectItem value="new_leads">New leads</SelectItem>
                          <SelectItem value="meeting_scheduled">Meeting scheduled</SelectItem>
                          <SelectItem value="high_score">High score (70+)</SelectItem>
                          <SelectItem value="no_activity_7d">No activity 7d+</SelectItem>
                        </SelectContent>
                      </Select>
                      <AdvancedFilterBuilder
                        availableFields={CONTACT_CORE_FIELDS}
                        filters={advancedFilters}
                        onFiltersChange={handleFiltersChange}
                        matchMode={matchMode}
                        onMatchModeChange={setMatchMode}
                      />
                    </div>
                  }
                />
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
      <ImportContactsModal open={showImport} onClose={() => setShowImport(false)} />
      <ContactTaggingRulesDialog open={showTaggingRules} onOpenChange={setShowTaggingRules} />
    </>
  );
}
