import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, RefreshCw, Loader2, Link2, Download, Tags, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';
import { TOOLBAR_CONTROL_CLASS } from '@/lib/toolbarControlClass';

export default function Contacts() {
  const navigate = useNavigate();
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

  const handleExport = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    if (!company?.id) return;
    setIsExporting(true);
    try {
      const count = await exportContactsToXlsx({
        orgCompanyId: company.id,
        quickFilter,
        advancedFilters: debouncedFilters,
        matchMode,
        search: debouncedSearch,
        format,
      });
      toast.success(`Exported ${count} contacts (${format.toUpperCase()})`);
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
        <main className="w-full px-4 pt-2 pb-3 sm:px-6 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
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
                  toolbarActions={
                    <>
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
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={isExporting}>
                      <Download className="h-4 w-4 mr-2" /> Export
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-64">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          Uses current filters &amp; search
                          <div className="mt-1 text-[11px] leading-snug">
                            {[
                              quickFilter !== 'all' ? `Tab: ${quickFilter.replace(/_/g, ' ')}` : null,
                              normalizedSearch ? `Search: "${normalizedSearch}"` : null,
                              advancedFilters.length ? `${advancedFilters.length} filter${advancedFilters.length > 1 ? 's' : ''} (${matchMode})` : null,
                            ].filter(Boolean).join(' · ') || 'No filters applied'}
                          </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleExport('csv')} disabled={isExporting}>
                          CSV (.csv)
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleExport('xlsx')} disabled={isExporting}>
                          Excel (.xlsx)
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuItem onSelect={() => setShowImport(true)}>
                    <Upload className="h-4 w-4 mr-2" /> Import
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Contact
              </Button>
                    </>
                  }
                  toolbarExtras={
                    <div className="flex items-center gap-2 shrink-0">
                      <AdvancedFilterBuilder
                        availableFields={CONTACT_CORE_FIELDS}
                        filters={advancedFilters}
                        onFiltersChange={handleFiltersChange}
                        matchMode={matchMode}
                        onMatchModeChange={setMatchMode}
                      />
                      <Select value={quickFilter} onValueChange={handleQuickFilterChange}>
                        <SelectTrigger className={cn('w-[140px]', TOOLBAR_CONTROL_CLASS)}>
                          <SelectValue placeholder="Quick filter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All contacts</SelectItem>
                          <SelectItem value="no_email">Missing email</SelectItem>
                          <SelectItem value="missing_name">Missing name</SelectItem>
                          <SelectItem value="no_company">Missing company</SelectItem>
                          <SelectItem value="new_leads">New leads</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  }
                  footer={
                    <TablePagination
                      page={page}
                      pageSize={pageSize}
                      totalCount={totalCount}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      onPageSizeChange={handlePageSizeChange}
                      isLoading={isFetching}
                    />
                  }
                />
              </div>
            </>
          )}
        </main>
      </div>

      <CreateContactModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(contact) => {
          if (contact?.id) navigate(`/contacts/${contact.id}`);
        }}
      />
      <ImportContactsModal open={showImport} onClose={() => setShowImport(false)} />
      <ContactTaggingRulesDialog open={showTaggingRules} onOpenChange={setShowTaggingRules} />

      <AlertDialog open={!!matchPreview} onOpenChange={(o) => !o && setMatchPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Preview company matches</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  <span className="font-semibold text-foreground">{matchPreview?.would_match ?? 0}</span> of{' '}
                  {matchPreview?.unmatched_total ?? 0} unlinked contacts will be matched to a company by email
                  domain. Nothing has been changed yet.
                </p>
                {!!matchPreview?.samples.length && (
                  <div className="rounded-md border border-border/60 divide-y divide-border/50 text-xs">
                    {matchPreview.samples.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 px-2 py-1.5">
                        <span className="truncate text-foreground">{s.contact}</span>
                        <span className="truncate text-muted-foreground">{s.company}</span>
                      </div>
                    ))}
                    {matchPreview.would_match > matchPreview.samples.length && (
                      <div className="px-2 py-1.5 text-muted-foreground">
                        + {matchPreview.would_match - matchPreview.samples.length} more…
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMatching || !matchPreview?.would_match}
              onClick={(e) => {
                e.preventDefault();
                handleMatchCompanies();
              }}
            >
              {isMatching ? 'Applying…' : `Apply to ${matchPreview?.would_match ?? 0} contacts`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
