import { useState, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TableVirtuoso } from 'react-virtuoso';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Building2, ChevronDown, Trash2, Users, Briefcase, ExternalLink, Filter, ArrowUp, ArrowDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CrmCompany, CRM_COMPANY_LIFECYCLES, CRM_COMPANY_STATUSES, CRM_COMPANY_TYPES, useDeleteCrmCompany } from '@/hooks/useCrmCompanies';
import { useContacts } from '@/hooks/useContacts';
import { useLinkContactToCompany } from '@/hooks/useCrmLinks';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { EntitySearchModal, EntityOption } from '@/components/crm/EntitySearchModal';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { MultiSelectFilter } from '@/components/deals/MultiSelectFilter';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useTriStateSort } from '@/hooks/useTriStateSort';
import { SortableHeader } from '@/components/ui/sortable-header';

interface CrmCompaniesTableProps {
  companies: CrmCompany[];
  onBulkAction?: (action: string, ids: string[]) => void;
  leadingFilterSlot?: React.ReactNode;
}

const lifecycleColors: Record<string, string> = {
  target: 'bg-muted text-muted-foreground',
  engaged: 'bg-blue-500/10 text-blue-500',
  opportunity: 'bg-amber-500/10 text-amber-500',
  customer: 'bg-green-500/10 text-green-500',
  expansion: 'bg-purple-500/10 text-purple-500',
  churn_risk: 'bg-red-500/10 text-red-500',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500',
  inactive: 'bg-muted text-muted-foreground',
  target: 'bg-blue-500/10 text-blue-500',
  churned: 'bg-red-500/10 text-red-500',
};

export function CrmCompaniesTable({ companies, onBulkAction, leadingFilterSlot }: CrmCompaniesTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyTypeFilter, setCompanyTypeFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [missingDataFilter, setMissingDataFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { sortField, sortDir, handleSort } = useTriStateSort({
    field: 'created_at',
    direction: 'desc',
  });

  type ColFilterMode = 'all' | 'not_empty' | 'empty' | 'contains';
  type ColFilter = { mode: ColFilterMode; value?: string };
  const [columnFilters, setColumnFilters] = useState<Record<string, ColFilter>>({});
  const setColFilter = (field: string, f: ColFilter) =>
    setColumnFilters(prev => {
      const next = { ...prev };
      if (f.mode === 'all') delete next[field];
      else next[field] = f;
      return next;
    });

  // Modal states
  const [linkContactCompanyId, setLinkContactCompanyId] = useState<string | null>(null);
  const [createContactCompanyId, setCreateContactCompanyId] = useState<string | null>(null);
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null);

  const { data: allContactsResult } = useContacts({ pageSize: 1000, enabled: !!linkContactCompanyId });
  const allContacts = allContactsResult?.data ?? [];
  const linkContact = useLinkContactToCompany();
  const deleteCompany = useDeleteCrmCompany();
  const teamMembers = useTeamMembers();
  const ownerNameById = useMemo(() => {
    const m = new Map<string, string>();
    teamMembers.forEach(t => m.set(t.id, t.display_name));
    return m;
  }, [teamMembers]);
  const industryOptions = useMemo(
    () => Array.from(new Set(companies.map(c => c.industry).filter(Boolean) as string[])).sort(),
    [companies]
  );

  // Fetch the set of CRM company IDs that have at least one linked contact
  // for this org. Powers the "No contacts" Missing Data filter and its count.
  // Runs in the background with a localStorage-cached fallback so opening the
  // filter menu is always instant — the count is shown from cache first and
  // then refreshed silently.
  const { company } = useCompany();
  const cacheKey = company?.id ? `crm-missing-data-cache:${company.id}` : null;
  const cachedIds = useMemo<string[] | null>(() => {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }, [cacheKey]);
  const { data: companyIdsWithContacts, isFetching: isFetchingContactsSet } = useQuery({
    queryKey: ['crm-companies-with-contacts', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60_000,
    initialData: cachedIds ? new Set(cachedIds) : undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('crm_company_id')
        .eq('org_company_id', company!.id)
        .not('crm_company_id', 'is', null);
      if (error) throw error;
      const ids = (data ?? []).map((r: any) => r.crm_company_id as string);
      if (cacheKey) {
        try { localStorage.setItem(cacheKey, JSON.stringify(Array.from(new Set(ids)))); } catch {}
      }
      return new Set(ids);
    },
  });

  const missingDataCounts = useMemo(() => {
    const noDomain = companies.filter(c => !((c.domain || '').trim())).length;
    const noContacts = companyIdsWithContacts
      ? companies.filter(c => !companyIdsWithContacts.has(c.id)).length
      : null;
    return { no_domain: noDomain, no_contacts: noContacts };
  }, [companies, companyIdsWithContacts]);
  const contactsCountLabel = missingDataCounts.no_contacts === null
    ? (isFetchingContactsSet ? '…' : '—')
    : String(missingDataCounts.no_contacts);

  const deferredCompanies = useDeferredValue(companies);

  const filtered = useMemo(() => {
    let result = [...deferredCompanies];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.linkedin_url || '').toLowerCase().includes(q)
      );
    }
    if (lifecycleFilter !== 'all') result = result.filter(c => c.lifecycle_stage === lifecycleFilter);
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);
    if (companyTypeFilter !== 'all') result = result.filter(c => c.company_type === companyTypeFilter);
    if (ownerFilter !== 'all') {
      result = result.filter(c =>
        ownerFilter === 'unassigned' ? !c.owner_user_id : c.owner_user_id === ownerFilter
      );
    }
    if (industryFilter !== 'all') result = result.filter(c => c.industry === industryFilter);

    if (missingDataFilter.length > 0) {
      result = result.filter(c => {
        if (missingDataFilter.includes('no_contacts')) {
          if (companyIdsWithContacts && companyIdsWithContacts.has(c.id)) return false;
        }
        if (missingDataFilter.includes('no_domain')) {
          const d = (c.domain || '').trim();
          if (d) return false;
        }
        return true;
      });
    }

    // Per-column header filters
    for (const [field, f] of Object.entries(columnFilters)) {
      result = result.filter(c => {
        const raw = (c as any)[field];
        const isEmpty = raw == null || raw === '' || (typeof raw === 'string' && raw.trim() === '');
        if (f.mode === 'not_empty') return !isEmpty;
        if (f.mode === 'empty') return isEmpty;
        if (f.mode === 'contains') {
          if (!f.value) return true;
          return String(raw ?? '').toLowerCase().includes(f.value.toLowerCase());
        }
        return true;
      });
    }

    if (sortField && sortDir) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortField] ?? '';
        const bVal = (b as any)[sortField] ?? '';
        if (typeof aVal === 'number' && typeof bVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [deferredCompanies, search, lifecycleFilter, statusFilter, companyTypeFilter, ownerFilter, industryFilter, missingDataFilter, companyIdsWithContacts, sortField, sortDir, columnFilters]);

  const toggleAll = () => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)));
  const toggleOne = (id: string) => { const next = new Set(selectedIds); next.has(id) ? next.delete(id) : next.add(id); setSelectedIds(next); };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <SortableHeader
      asButton
      field={field}
      activeField={sortField}
      direction={sortDir}
      onSort={handleSort}
    >
      {children}
    </SortableHeader>
  );

  const ColHeader = ({
    field,
    filterField,
    sortable = true,
    children,
  }: {
    field: string;
    filterField?: string;
    sortable?: boolean;
    children: React.ReactNode;
  }) => {
    const ff = filterField ?? field;
    const current = columnFilters[ff];
    const active = !!current;
    const [draft, setDraft] = useState<ColFilter>(current ?? { mode: 'all', value: '' });
    return (
      <div className="flex items-center gap-1">
        {sortable ? (
          <SortableHeader asButton field={field} activeField={sortField} direction={sortDir} onSort={handleSort}>
            {children}
          </SortableHeader>
        ) : (
          <span className="text-xs font-medium">{children}</span>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-5 w-5', active && 'text-primary')}
              aria-label={`Filter ${typeof children === 'string' ? children : ff}`}
              data-no-row-nav
            >
              <Filter className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 space-y-2" align="start">
            <div className="text-xs font-medium text-muted-foreground">Filter</div>
            <Select
              value={draft.mode}
              onValueChange={(v) => setDraft(d => ({ ...d, mode: v as ColFilterMode }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All values</SelectItem>
                <SelectItem value="not_empty">Not empty</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
                <SelectItem value="contains">Contains…</SelectItem>
              </SelectContent>
            </Select>
            {draft.mode === 'contains' && (
              <Input
                value={draft.value ?? ''}
                onChange={e => setDraft(d => ({ ...d, value: e.target.value }))}
                placeholder="Text to match"
                className="h-8 text-xs"
              />
            )}
            <div className="flex gap-1 pt-1">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={() => setColFilter(ff, draft)}>Apply</Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setDraft({ mode: 'all', value: '' }); setColFilter(ff, { mode: 'all' }); }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            {sortable && (
              <div className="flex gap-1 border-t pt-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => handleSort(field)}>
                  <ArrowUp className="h-3 w-3 mr-1" /> Sort
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  const formatCurrency = (v: number | null) => v != null ? `$${v.toLocaleString()}` : '—';

  const contactOptions: EntityOption[] = allContacts.map(c => ({
    id: c.id,
    label: c.full_name || `${c.first_name} ${c.last_name}`,
    sublabel: c.email || c.job_title || undefined,
  }));

  const deleteTarget = companies.find(c => c.id === deleteCompanyId);

  const Truncated = ({ text, className }: { text: string | null | undefined; className?: string }) => (
    text ? (
      <span title={text} className={cn('block max-w-[180px] truncate', className)}>{text}</span>
    ) : <span className="text-muted-foreground">—</span>
  );

  const LinkCell = ({ href, label }: { href: string | null | undefined; label: string }) => (
    href ? (
      <a
        href={href.startsWith('http') ? href : `https://${href}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={href}
        className="inline-flex items-center gap-1 text-primary hover:underline max-w-[160px] truncate"
      >
        {label} <ExternalLink className="h-3 w-3 flex-shrink-0" />
      </a>
    ) : <span className="text-muted-foreground">—</span>
  );

  return (
    <div className="space-y-3 crm-companies-surface">
      <div className="flex items-center gap-2 flex-wrap">
        {leadingFilterSlot}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CRM_COMPANY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={companyTypeFilter} onValueChange={setCompanyTypeFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CRM_COMPANY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Industry" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            {industryOptions.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>
        <MultiSelectFilter
          label="Missing Data"
          className="h-9"
          options={[
            { value: 'no_contacts', label: `No contacts (${contactsCountLabel})` },
            { value: 'no_domain', label: `No domain (${missingDataCounts.no_domain})` },
          ]}
          selected={missingDataFilter}
          onChange={setMissingDataFilter}
        />
        {selectedIds.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Bulk ({selectedIds.size}) <ChevronDown className="ml-1 h-3 w-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onBulkAction?.('assign_owner', Array.from(selectedIds))}>Assign Owner</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('update_status', Array.from(selectedIds))}>Update Status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('update_lifecycle', Array.from(selectedIds))}>Update Lifecycle</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('archive', Array.from(selectedIds))}>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div
        className={cn(
          'crm-companies-table rounded-xl overflow-hidden',
          'ring-1 ring-border/40 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
          // Lighter, more refined table internals
          '[&_table]:border-separate [&_table]:border-spacing-0',
          '[&_th]:h-10 [&_th]:px-3 [&_th]:py-0 [&_th]:bg-transparent [&_th]:font-medium [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground/80 [&_th]:whitespace-nowrap',
          '[&_thead_tr]:bg-transparent [&_thead_th]:border-b [&_thead_th]:border-border/40',
          '[&_td]:px-3 [&_td]:py-0 [&_td]:h-11 [&_td]:align-middle [&_td]:border-b [&_td]:border-border/25 [&_td]:whitespace-nowrap',
          '[&_tbody_tr:last-child_td]:border-b-0',
        )}
      >
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No companies found</p>
          </div>
        ) : (
          <TableVirtuoso
            // Virtualizes the CRM companies grid so the DOM only carries the
            // visible window worth of rows regardless of tenant size.
            // Use window scrolling so the page itself scrolls (no nested scroll
            // inside the companies box) and the full row list expands naturally.
            useWindowScroll
            data={filtered}
            computeItemKey={(_index, co) => co.id}
            increaseViewportBy={{ top: 600, bottom: 1400 }}
            components={{
              Table: (props) => <Table {...props} style={{ ...props.style, width: '100%' }} />,
              TableHead: TableHeader as any,
              TableRow: (rowProps: any) => {
                const idx = rowProps['data-index'];
                const row = typeof idx === 'number' ? filtered[idx] : null;
                if (!row) return <TableRow {...rowProps} />;
                const go = () => navigate(`/crm-companies/${row.id}`);
                return (
                  <TableRow
                    {...rowProps}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${row.name}`}
                    onClick={(e: React.MouseEvent) => {
                      // Ignore clicks on intentionally interactive children.
                      const t = e.target as HTMLElement;
                      if (t.closest('a,button,input,[role="menuitem"],[role="checkbox"],[data-radix-collection-item],[data-no-row-nav]')) {
                        return;
                      }
                      go();
                    }}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        const t = e.target as HTMLElement;
                        if (t.closest('a,button,input,[role="menuitem"],[role="checkbox"]')) return;
                        e.preventDefault();
                        go();
                      }
                    }}
                    className={cn(rowProps.className, 'cursor-pointer border-0 hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors')}
                  />
                );
              },
              TableBody: TableBody as any,
            }}
            fixedHeaderContent={() => (
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="w-10"><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                <TableHead><ColHeader field="name">Company</ColHeader></TableHead>
                <TableHead><ColHeader field="domain">Domain</ColHeader></TableHead>
                <TableHead><ColHeader field="industry">Industry</ColHeader></TableHead>
                <TableHead><ColHeader field="company_type">Type</ColHeader></TableHead>
                <TableHead><ColHeader field="owner_user_id">Owner</ColHeader></TableHead>
                <TableHead><ColHeader field="linkedin_url" sortable={false}>LinkedIn</ColHeader></TableHead>
                <TableHead><ColHeader field="phone">Phone</ColHeader></TableHead>
                <TableHead><ColHeader field="lifecycle_stage">Stage</ColHeader></TableHead>
                <TableHead><ColHeader field="status">Status</ColHeader></TableHead>
                <TableHead><ColHeader field="segment">Segment</ColHeader></TableHead>
                <TableHead><ColHeader field="arr">ARR</ColHeader></TableHead>
                <TableHead><ColHeader field="employee_range">Size</ColHeader></TableHead>
                <TableHead><ColHeader field="hq_country">Location</ColHeader></TableHead>
                <TableHead><ColHeader field="last_activity_date">Last Activity</ColHeader></TableHead>
                <TableHead className="w-10" />
              </TableRow>
            )}
            itemContent={(_i, co) => (
              <>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selectedIds.has(co.id)} onCheckedChange={() => toggleOne(co.id)} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {co.logo_url ? (
                      <img src={co.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                    ) : (
                      <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{co.name[0]}</div>
                    )}
                    <span className="font-medium text-sm">{co.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                  {co.domain ? (
                    <a
                      href={co.domain.startsWith('http') ? co.domain : `https://${co.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={co.domain}
                      className="text-primary hover:underline"
                    >
                      {co.domain}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {co.industry ? (
                    <span title={co.industry} className="block max-w-[160px] truncate">{co.industry}</span>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{CRM_COMPANY_TYPES.find(t => t.value === co.company_type)?.label || co.company_type || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.owner_user_id ? (ownerNameById.get(co.owner_user_id) || 'Unknown') : '—'}</TableCell>
                <TableCell className="text-sm" onClick={e => e.stopPropagation()}><LinkCell href={co.linkedin_url} label="Profile" /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.phone || '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn('text-[10px]', lifecycleColors[co.lifecycle_stage] || '')}>{CRM_COMPANY_LIFECYCLES.find(l => l.value === co.lifecycle_stage)?.label || co.lifecycle_stage}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn('text-[10px]', statusColors[co.status] || '')}>{CRM_COMPANY_STATUSES.find(s => s.value === co.status)?.label || co.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.segment || '—'}</TableCell>
                <TableCell className="text-sm">{formatCurrency(co.arr)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.employee_range || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{[co.hq_city, co.hq_country].filter(Boolean).join(', ') || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.last_activity_date ? format(new Date(co.last_activity_date), 'MMM d') : '—'}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/crm-companies/${co.id}`)}>View Details</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setLinkContactCompanyId(co.id)}>
                        <Users className="h-3.5 w-3.5 mr-1.5" /> Link Contact
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCreateContactCompanyId(co.id)}>
                        <Users className="h-3.5 w-3.5 mr-1.5" /> Create Contact
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/crm-companies/${co.id}`)}>
                        <Briefcase className="h-3.5 w-3.5 mr-1.5" /> Link Deal
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteCompanyId(co.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </>
            )}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} compan{filtered.length !== 1 ? 'ies' : 'y'}</p>

      {/* Link Contact Modal */}
      <EntitySearchModal
        open={!!linkContactCompanyId}
        onClose={() => setLinkContactCompanyId(null)}
        title="Link Contact to Company"
        placeholder="Search contacts..."
        options={contactOptions}
        multiSelect
        onConfirm={(ids) => {
          if (linkContactCompanyId) {
            Promise.all(ids.map(contactId => linkContact.mutateAsync({ contactId, companyId: linkContactCompanyId })))
              .then(() => setLinkContactCompanyId(null));
          }
        }}
        confirming={linkContact.isPending}
      />

      {/* Create Contact Modal pre-linked to company */}
      <CreateContactModal
        open={!!createContactCompanyId}
        onClose={() => setCreateContactCompanyId(null)}
        defaultCompanyId={createContactCompanyId || undefined}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteCompanyId}
        onClose={() => setDeleteCompanyId(null)}
        title="Delete Company"
        description={`Are you sure you want to delete "${deleteTarget?.name || 'this company'}"? Contacts and deals will be unlinked but not deleted.`}
        isDeleting={deleteCompany.isPending}
        onConfirm={() => {
          if (deleteCompanyId) {
            deleteCompany.mutate(deleteCompanyId, {
              onSuccess: () => setDeleteCompanyId(null),
            });
          }
        }}
      />
    </div>
  );
}
