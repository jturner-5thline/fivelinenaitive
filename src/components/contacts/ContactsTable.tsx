import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { contactTypeBadgeClass } from './contactTypeBadge';
import { splitContactTypes } from './ContactTypeMultiSelect';
import { TableVirtuoso } from 'react-virtuoso';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, UserPlus, ChevronDown, Building2, Briefcase, Trash2, Linkedin } from 'lucide-react';
import { Contact, LIFECYCLE_STAGES, CONTACT_STATUSES, normalizeContactStatus, useDeleteContact } from '@/hooks/useContacts';
import { useUpdateContact } from '@/hooks/useContacts';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useContactTypes } from '@/hooks/useContactTypes';
import { useCrmCompanies } from '@/hooks/useCrmCompanies';
import { useLinkContactToCompany, useLinkContactToDeal, useAllDeals } from '@/hooks/useCrmLinks';
import { EntitySearchModal, EntityOption } from '@/components/crm/EntitySearchModal';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';
import { BulkAssignOwnerDialog } from '@/components/crm/BulkAssignOwnerDialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useTriStateSort } from '@/hooks/useTriStateSort';
import { SortableHeader } from '@/components/ui/sortable-header';
import { TOOLBAR_CONTROL_CLASS } from '@/lib/toolbarControlClass';
import { useCrmTableColumns, type CrmColumnDef } from '@/hooks/useCrmTableColumns';
import { ColumnSettingsButton, SortableHeaderContext, SortableTh } from '@/components/crm/CrmColumnControls';

interface ContactsTableProps {
  contacts: Contact[];
  onBulkAction?: (action: string, contactIds: string[]) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  toolbarExtras?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  footer?: React.ReactNode;
  isFetching?: boolean;
}

const lifecycleColors: Record<string, string> = {
  subscriber: 'bg-muted text-muted-foreground',
  lead: 'bg-blue-500/10 text-blue-500',
  mql: 'bg-purple-500/10 text-purple-500',
  sql: 'bg-indigo-500/10 text-indigo-500',
  opportunity: 'bg-amber-500/10 text-amber-500',
  customer: 'bg-green-500/10 text-green-500',
  evangelist: 'bg-pink-500/10 text-pink-500',
  other: 'bg-muted text-muted-foreground',
};

const statusColors: Record<string, string> = Object.fromEntries(
  CONTACT_STATUSES.map((s) => [s.value, s.badge]),
);

const CONTACT_HEADERS: Record<string, { label: string; field?: string }> = {
  first_name: { label: 'First Name', field: 'first_name' },
  last_name: { label: 'Last Name', field: 'last_name' },
  email: { label: 'Email', field: 'email' },
  city: { label: 'City', field: 'hs_city' },
  lead_status: { label: 'Lead Status', field: 'hs_contact_status' },
  contact_type: { label: 'Contact Type', field: 'hs_contact_type' },
  created_at: { label: 'Create Date', field: 'created_at' },
  last_contact: { label: 'Last Contact', field: 'last_contact_at' },
  hs_last_contacted: { label: 'HubSpot Last Contacted', field: 'hs_notes_last_contacted' },
  industry: { label: 'Industry', field: 'hs_industry' },
  job_title: { label: 'Job Title', field: 'job_title' },
  opt_out: { label: 'Opted out: One to One', field: 'hs_hs_email_optout' },
  email_domain: { label: 'Email Domain', field: 'email_domain_normalized' },
  state: { label: 'State/Region', field: 'hs_state' },
  company: { label: 'Company Name' },
  linkedin: { label: 'LinkedIn' },
  phone: { label: 'Phone', field: 'phone_work' },
  mobile: { label: 'Mobile', field: 'phone_mobile' },
};
const CONTACT_COLUMNS: CrmColumnDef[] = Object.entries(CONTACT_HEADERS).map(([id, h]) => ({ id, label: h.label }));

export function ContactsTable({ contacts, onBulkAction, search: controlledSearch, onSearchChange, toolbarExtras, toolbarActions, footer, isFetching }: ContactsTableProps) {
  const navigate = useNavigate();
  const cols = useCrmTableColumns('contacts', CONTACT_COLUMNS);
  const [localSearch, setLocalSearch] = useState('');
  const search = controlledSearch ?? localSearch;
  const setSearch = onSearchChange ?? setLocalSearch;
  const isServerSearch = controlledSearch !== undefined;
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [contactTypeFilter, setContactTypeFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { sortField, sortDir, handleSort } = useTriStateSort({
    field: 'created_at',
    direction: 'desc',
  });

  // Link modals
  const [linkCompanyContactId, setLinkCompanyContactId] = useState<string | null>(null);
  const [linkDealContactId, setLinkDealContactId] = useState<string | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: companiesResult } = useCrmCompanies({ pageSize: 1000 });
  const companies = companiesResult?.data ?? [];
  const { data: deals = [] } = useAllDeals();
  const linkToCompany = useLinkContactToCompany();
  const linkToDeal = useLinkContactToDeal();
  const deleteContact = useDeleteContact();
  const updateContact = useUpdateContact();
  const teamMembers = useTeamMembers();
  const ownerNameById = useMemo(() => new Map(teamMembers.map(m => [m.id, m.display_name])), [teamMembers]);
  const { data: contactTypes = [] } = useContactTypes();

  const filtered = useMemo(() => {
    let result = [...contacts];

    if (search.trim() && !isServerSearch) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.job_title || '').toLowerCase().includes(q) ||
        (c.linkedin_url || '').toLowerCase().includes(q) ||
        ((c as any).contact_type || '').toLowerCase().includes(q)
      );
    }

    if (lifecycleFilter !== 'all') {
      result = result.filter(c => c.lifecycle_stage === lifecycleFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(c => normalizeContactStatus(c.status) === statusFilter);
    }
    if (contactTypeFilter !== 'all') {
      result = result.filter(c => ((c as any).contact_type || '') === contactTypeFilter);
    }
    if (ownerFilter !== 'all') {
      result = ownerFilter === 'unassigned'
        ? result.filter(c => !c.owner_user_id)
        : result.filter(c => c.owner_user_id === ownerFilter);
    }

    if (sortField && sortDir) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortField] || '';
        const bVal = (b as any)[sortField] || '';
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [contacts, search, isServerSearch, lifecycleFilter, statusFilter, contactTypeFilter, ownerFilter, sortField, sortDir]);

  // Stable ref so the virtualized row component can navigate without forcing remounts.
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  const ClickableTableRow = useMemo(() => {
    const Row = (props: any) => {
      const idx = props['data-item-index'];
      const contact = typeof idx === 'number' ? filteredRef.current[idx] : undefined;
      const activate = () => { if (contact) navigate(`/contacts/${contact.id}`); };
      return (
        <TableRow
          {...props}
          role="button"
          tabIndex={0}
          className={cn(props.className, 'cursor-pointer border-0 hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.03] transition-colors [&>td]:py-1 [&>td]:h-[31px]')}
          onClick={activate}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate();
            }
          }}
        />
      );
    };
    Row.displayName = 'ClickableContactRow';
    return Row;
  }, [navigate]);

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

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

  const companyOptions: EntityOption[] = companies.map(c => ({
    id: c.id,
    label: c.name,
    sublabel: c.domain || c.industry || undefined,
  }));

  const dealOptions: EntityOption[] = deals.map(d => ({
    id: d.id,
    label: d.company,
    sublabel: `${d.stage} · $${Number(d.value || 0).toLocaleString()}`,
  }));

  const deleteTarget = contacts.find(c => c.id === deleteContactId);

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 crm-companies-surface">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 flex-nowrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        {toolbarExtras}
        <Select value={contactTypeFilter} onValueChange={setContactTypeFilter}>
          <SelectTrigger className={cn('w-[120px]', TOOLBAR_CONTROL_CLASS)}>
            <SelectValue placeholder="Contact Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {contactTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className={cn('w-[125px]', TOOLBAR_CONTROL_CLASS)}>
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 shrink-0">
                Bulk Actions ({selectedIds.size}) <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setBulkAssignOpen(true)}>Assign Owner</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onBulkAction?.('assign_sdr', Array.from(selectedIds))}>Assign SDR Owner</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('assign_ae', Array.from(selectedIds))}>Assign AE Owner</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('update_status', Array.from(selectedIds))}>Update Status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('update_lifecycle', Array.from(selectedIds))}>Update Lifecycle Stage</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <ColumnSettingsButton
            columns={CONTACT_COLUMNS}
            order={cols.order}
            hidden={cols.hidden}
            onReorder={cols.setColumnOrder}
            onToggle={cols.toggleColumn}
            onShowAll={cols.showAll}
            onReset={cols.reset}
          />
          {toolbarActions}
        </div>
      </div>

      {/* Table — fixed height to always show ~25 rows */}
      <div
        className={cn(
          'crm-companies-table flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden',
          'ring-1 ring-border/40 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
          '[&_table]:border-separate [&_table]:border-spacing-0',
          '[&_th]:h-10 [&_th]:px-3 [&_th]:py-0 [&_th]:bg-transparent [&_th]:font-medium [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground/80 [&_th]:whitespace-nowrap',
          '[&_thead_tr]:bg-transparent [&_thead_th]:border-b [&_thead_th]:border-border/40',
          '[&_td]:px-3 [&_td]:align-middle [&_td]:border-b [&_td]:border-border/25 [&_td]:whitespace-nowrap',
          '[&_tbody_tr:last-child_td]:border-b-0',
        )}
      >
        <div className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            {isFetching && search.trim() ? (
              <p className="text-sm">Searching…</p>
            ) : (
              <>
                <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No contacts found</p>
              </>
            )}
          </div>
        ) : (
          <TableVirtuoso
            // Virtualizes the contacts list so the DOM never carries more than the
            // visible window worth of rows. Fixed height keeps the module stable
            // at ~25 visible rows regardless of result count.
            style={{ height: '100%' }}
            data={filtered}
            components={{
              Table: (props) => <Table {...props} style={{ ...props.style, width: '100%' }} />,
              TableHead: TableHeader as any,
              TableRow: ClickableTableRow as any,
              TableBody: TableBody as any,
            }}
            fixedHeaderContent={() => (
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                </TableHead>
                <SortableHeaderContext visibleIds={cols.visibleOrder} fullOrder={cols.order} onReorder={cols.setColumnOrder}>
                  {cols.visibleOrder.map(id => {
                    const h = CONTACT_HEADERS[id];
                    return (
                      <SortableTh key={id} id={id}>
                        {h.field ? <SortHeader field={h.field}>{h.label}</SortHeader> : <span>{h.label}</span>}
                      </SortableTh>
                    );
                  })}
                </SortableHeaderContext>
                <TableHead className="w-10" />
              </TableRow>
            )}
            itemContent={(_index, contact) => {
              const crmCompany = (contact as any).crm_company;
              const c: any = contact as any;
              const companyName = crmCompany?.name || c.hs_company_name || null;
              const companyId = (contact as any).crm_company_id;
              const optOut = c.hs_hs_email_optout;
              const optOutLabel = optOut === true || optOut === 'true' || optOut === 1 || optOut === '1'
                ? 'Yes'
                : optOut === false || optOut === 'false' || optOut === 0 || optOut === '0'
                  ? 'No'
                  : '—';
              const cells: Record<string, React.ReactNode> = {
                first_name: <TableCell key="first_name" className="text-sm font-medium">{contact.first_name || '—'}</TableCell>,
                last_name: <TableCell key="last_name" className="text-sm font-medium">{contact.last_name || '—'}</TableCell>,
                email: (
                  <TableCell key="email" className="text-sm text-muted-foreground">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()} className="hover:underline">{contact.email}</a>
                    ) : '—'}
                  </TableCell>
                ),
                city: <TableCell key="city" className="text-sm text-muted-foreground">{c.hs_city || '—'}</TableCell>,
                lead_status: (
                  <TableCell key="lead_status" className="text-sm">
                    {c.hs_contact_status ? (
                      <Badge variant="outline" className="text-[10px]">{c.hs_contact_status}</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ),
                contact_type: (
                  <TableCell key="contact_type" className="text-sm">
                    {(() => {
                      const tags = splitContactTypes((c.hs_contact_type || c.contact_type) as string | null);
                      if (!tags.length) return <span className="text-muted-foreground">—</span>;
                      return (
                        <div className="flex flex-nowrap gap-1 overflow-hidden max-w-[220px]">
                          {tags.map(t => (
                            <span key={t} className={cn(contactTypeBadgeClass(t), 'truncate')}>{t}</span>
                          ))}
                        </div>
                      );
                    })()}
                  </TableCell>
                ),
                created_at: (
                  <TableCell key="created_at" className="text-sm text-muted-foreground whitespace-nowrap">
                    {contact.created_at ? format(new Date(contact.created_at), 'MMM d, yyyy') : '—'}
                  </TableCell>
                ),
                last_contact: (
                  <TableCell key="last_contact" className="text-sm text-muted-foreground whitespace-nowrap">
                    {c.last_contact_at
                      ? (
                          <span title={format(new Date(c.last_contact_at), 'PPpp')}>
                            {format(new Date(c.last_contact_at), 'MMM d, yyyy')}
                          </span>
                        )
                      : <span className="italic text-muted-foreground/70">No activity</span>}
                  </TableCell>
                ),
                hs_last_contacted: (
                  <TableCell key="hs_last_contacted" className="text-sm text-muted-foreground whitespace-nowrap">
                    {c.hs_notes_last_contacted ? format(new Date(c.hs_notes_last_contacted), 'MMM d, yyyy') : '—'}
                  </TableCell>
                ),
                industry: <TableCell key="industry" className="text-sm text-muted-foreground max-w-[160px] truncate" title={c.hs_industry || ''}>{c.hs_industry || '—'}</TableCell>,
                job_title: <TableCell key="job_title" className="text-sm text-muted-foreground max-w-[200px] truncate" title={contact.job_title || ''}>{contact.job_title || '—'}</TableCell>,
                opt_out: <TableCell key="opt_out" className="text-sm text-muted-foreground">{optOutLabel}</TableCell>,
                email_domain: <TableCell key="email_domain" className="text-sm text-muted-foreground">{c.email_domain_normalized || '—'}</TableCell>,
                state: <TableCell key="state" className="text-sm text-muted-foreground">{c.hs_state || '—'}</TableCell>,
                company: (
                  <TableCell key="company" className="text-sm text-muted-foreground">
                    {companyName ? (
                      companyId ? (
                        <span
                          className="text-primary hover:underline cursor-pointer"
                          onClick={e => { e.stopPropagation(); navigate(`/crm-companies/${companyId}`); }}
                        >{companyName}</span>
                      ) : (
                        <span>{companyName}</span>
                      )
                    ) : '—'}
                  </TableCell>
                ),
                linkedin: (
                  <TableCell key="linkedin" onClick={e => e.stopPropagation()}>
                    {contact.linkedin_url ? (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={contact.linkedin_url}
                        className="inline-flex items-center text-primary hover:underline"
                      >
                        <Linkedin className="h-4 w-4" />
                      </a>
                    ) : <span className="text-muted-foreground text-sm">—</span>}
                  </TableCell>
                ),
                phone: <TableCell key="phone" className="text-sm text-muted-foreground whitespace-nowrap">{contact.phone_work || '—'}</TableCell>,
                mobile: <TableCell key="mobile" className="text-sm text-muted-foreground whitespace-nowrap">{contact.phone_mobile || '—'}</TableCell>,
              };
              return (
                <>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(contact.id)} onCheckedChange={() => toggleOne(contact.id)} />
                  </TableCell>
                  {cols.visibleOrder.map(id => cells[id])}
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/contacts/${contact.id}`)}>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Send Email</DropdownMenuItem>
                        <DropdownMenuItem>Log Call</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setLinkCompanyContactId(contact.id)}>
                          <Building2 className="h-3.5 w-3.5 mr-1.5" /> Link to Company
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLinkDealContactId(contact.id)}>
                          <Briefcase className="h-3.5 w-3.5 mr-1.5" /> Link to Deal
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteContactId(contact.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </>
              );
            }}
          />
        )}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border/40 bg-muted/20 px-3 py-2">{footer}</div>
        )}
      </div>


      {/* Link to Company Modal */}
      <EntitySearchModal
        open={!!linkCompanyContactId}
        onClose={() => setLinkCompanyContactId(null)}
        title="Link Contact to Company"
        placeholder="Search companies..."
        options={companyOptions}
        onConfirm={(ids) => {
          if (linkCompanyContactId && ids[0]) {
            linkToCompany.mutate({ contactId: linkCompanyContactId, companyId: ids[0] }, {
              onSuccess: () => setLinkCompanyContactId(null),
            });
          }
        }}
        confirming={linkToCompany.isPending}
      />

      {/* Link to Deal Modal */}
      <EntitySearchModal
        open={!!linkDealContactId}
        onClose={() => setLinkDealContactId(null)}
        title="Link Contact to Deal"
        placeholder="Search deals..."
        options={dealOptions}
        multiSelect
        onConfirm={(ids) => {
          if (linkDealContactId) {
            Promise.all(ids.map(dealId => linkToDeal.mutateAsync({ contactId: linkDealContactId, dealId })))
              .then(() => setLinkDealContactId(null));
          }
        }}
        confirming={linkToDeal.isPending}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteContactId}
        onClose={() => setDeleteContactId(null)}
        title="Delete Contact"
        description={`Are you sure you want to delete "${deleteTarget?.full_name || 'this contact'}"? This will unlink all associated deals and companies.`}
        isDeleting={deleteContact.isPending}
        onConfirm={() => {
          if (deleteContactId) {
            deleteContact.mutate(deleteContactId, {
              onSuccess: () => setDeleteContactId(null),
            });
          }
        }}
      />

      <BulkAssignOwnerDialog
        open={bulkAssignOpen}
        onClose={() => setBulkAssignOpen(false)}
        count={selectedIds.size}
        teamMembers={teamMembers}
        isSaving={bulkBusy}
        onConfirm={async (ownerId) => {
          setBulkBusy(true);
          try {
            await Promise.all(
              Array.from(selectedIds).map(id => updateContact.mutateAsync({ id, owner_user_id: ownerId } as any))
            );
            setBulkAssignOpen(false);
            setSelectedIds(new Set());
          } finally {
            setBulkBusy(false);
          }
        }}
      />

      <DeleteConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title={`Delete ${selectedIds.size} contact${selectedIds.size === 1 ? '' : 's'}`}
        description={`Are you sure you want to delete ${selectedIds.size} selected contact${selectedIds.size === 1 ? '' : 's'}? This will unlink all associated deals and companies.`}
        isDeleting={bulkBusy}
        onConfirm={async () => {
          setBulkBusy(true);
          try {
            const ids = Array.from(selectedIds);
            const results = await Promise.allSettled(ids.map(id => deleteContact.mutateAsync(id)));
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed === 0) {
              setBulkDeleteOpen(false);
              setSelectedIds(new Set());
            }
          } finally {
            setBulkBusy(false);
          }
        }}
      />
    </div>
  );
}
