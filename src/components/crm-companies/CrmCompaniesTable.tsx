import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TableVirtuoso } from 'react-virtuoso';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Building2, ChevronDown, Trash2, Users, Briefcase, ExternalLink } from 'lucide-react';
import { CrmCompany, CRM_COMPANY_LIFECYCLES, CRM_COMPANY_STATUSES, CRM_COMPANY_TYPES, useDeleteCrmCompany } from '@/hooks/useCrmCompanies';
import { useContacts } from '@/hooks/useContacts';
import { useLinkContactToCompany } from '@/hooks/useCrmLinks';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { EntitySearchModal, EntityOption } from '@/components/crm/EntitySearchModal';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';
import { CreateContactModal } from '@/components/contacts/CreateContactModal';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useTriStateSort } from '@/hooks/useTriStateSort';
import { SortableHeader } from '@/components/ui/sortable-header';

interface CrmCompaniesTableProps {
  companies: CrmCompany[];
  onBulkAction?: (action: string, ids: string[]) => void;
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

export function CrmCompaniesTable({ companies, onBulkAction }: CrmCompaniesTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyTypeFilter, setCompanyTypeFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { sortField, sortDir, handleSort } = useTriStateSort({
    field: 'created_at',
    direction: 'desc',
  });

  // Modal states
  const [linkContactCompanyId, setLinkContactCompanyId] = useState<string | null>(null);
  const [createContactCompanyId, setCreateContactCompanyId] = useState<string | null>(null);
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null);

  const { data: allContactsResult } = useContacts({ pageSize: 1000 });
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

  const filtered = useMemo(() => {
    let result = [...companies];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.hq_address || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.website_url || '').toLowerCase().includes(q) ||
        (c.linkedin_url || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
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
  }, [companies, search, lifecycleFilter, statusFilter, companyTypeFilter, ownerFilter, industryFilter, sortField, sortDir]);

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
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Lifecycle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {CRM_COMPANY_LIFECYCLES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
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

      <div className="border rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No companies found</p>
          </div>
        ) : (
          <TableVirtuoso
            // Virtualizes the CRM companies grid so the DOM only carries the
            // visible window worth of rows regardless of tenant size.
            style={{ height: Math.min(680, 56 + filtered.length * 44) }}
            data={filtered}
            components={{
              Table: (props) => <Table {...props} style={{ ...props.style, width: '100%' }} />,
              TableHead: TableHeader as any,
              TableRow: TableRow as any,
              TableBody: TableBody as any,
            }}
            fixedHeaderContent={() => (
              <TableRow className="bg-muted/30">
                <TableHead className="w-10"><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                <TableHead><SortHeader field="name">Company</SortHeader></TableHead>
                <TableHead><SortHeader field="domain">Domain</SortHeader></TableHead>
                <TableHead><SortHeader field="industry">Industry</SortHeader></TableHead>
                <TableHead><SortHeader field="company_type">Type</SortHeader></TableHead>
                <TableHead><SortHeader field="owner_user_id">Owner</SortHeader></TableHead>
                <TableHead>Website</TableHead>
                <TableHead>LinkedIn</TableHead>
                <TableHead><SortHeader field="phone">Phone</SortHeader></TableHead>
                <TableHead><SortHeader field="address">Address</SortHeader></TableHead>
                <TableHead><SortHeader field="hq_address">HQ Address</SortHeader></TableHead>
                <TableHead>Notes</TableHead>
                <TableHead><SortHeader field="lifecycle_stage">Stage</SortHeader></TableHead>
                <TableHead><SortHeader field="status">Status</SortHeader></TableHead>
                <TableHead><SortHeader field="segment">Segment</SortHeader></TableHead>
                <TableHead><SortHeader field="arr">ARR</SortHeader></TableHead>
                <TableHead><SortHeader field="employee_range">Size</SortHeader></TableHead>
                <TableHead><SortHeader field="hq_country">Location</SortHeader></TableHead>
                <TableHead><SortHeader field="last_activity_date">Last Activity</SortHeader></TableHead>
                <TableHead className="w-10" />
              </TableRow>
            )}
            itemContent={(_i, co) => (
              <>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selectedIds.has(co.id)} onCheckedChange={() => toggleOne(co.id)} />
                </TableCell>
                <TableCell className="cursor-pointer" onClick={() => navigate(`/crm-companies/${co.id}`)}>
                  <div className="flex items-center gap-2">
                    {co.logo_url ? (
                      <img src={co.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                    ) : (
                      <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{co.name[0]}</div>
                    )}
                    <span className="font-medium text-sm">{co.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.domain || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.industry || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{CRM_COMPANY_TYPES.find(t => t.value === co.company_type)?.label || co.company_type || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.owner_user_id ? (ownerNameById.get(co.owner_user_id) || 'Unknown') : '—'}</TableCell>
                <TableCell className="text-sm" onClick={e => e.stopPropagation()}><LinkCell href={co.website_url} label="Visit" /></TableCell>
                <TableCell className="text-sm" onClick={e => e.stopPropagation()}><LinkCell href={co.linkedin_url} label="Profile" /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.phone || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground"><Truncated text={co.address} /></TableCell>
                <TableCell className="text-sm text-muted-foreground"><Truncated text={co.hq_address} /></TableCell>
                <TableCell className="text-sm text-muted-foreground"><Truncated text={co.notes} /></TableCell>
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
