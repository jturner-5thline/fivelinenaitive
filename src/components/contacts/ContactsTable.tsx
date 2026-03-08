import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Filter, MoreHorizontal, ArrowUpDown, UserPlus, ChevronDown } from 'lucide-react';
import { Contact, LIFECYCLE_STAGES, CONTACT_STATUSES } from '@/hooks/useContacts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ContactsTableProps {
  contacts: Contact[];
  onBulkAction?: (action: string, contactIds: string[]) => void;
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

const statusColors: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-500',
  working: 'bg-amber-500/10 text-amber-500',
  meeting_scheduled: 'bg-green-500/10 text-green-500',
  no_show: 'bg-red-500/10 text-red-500',
  no_fit: 'bg-muted text-muted-foreground',
  nurture: 'bg-purple-500/10 text-purple-500',
  bad_data: 'bg-red-500/10 text-red-500',
  converted: 'bg-green-500/10 text-green-500',
  closed: 'bg-muted text-muted-foreground',
};

export function ContactsTable({ contacts, onBulkAction }: ContactsTableProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let result = [...contacts];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.job_title || '').toLowerCase().includes(q)
      );
    }

    if (lifecycleFilter !== 'all') {
      result = result.filter(c => c.lifecycle_stage === lifecycleFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    result.sort((a, b) => {
      const aVal = (a as any)[sortField] || '';
      const bVal = (b as any)[sortField] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [contacts, search, lifecycleFilter, statusFilter, sortField, sortDir]);

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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort(field)}>
      {children}
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {LIFECYCLE_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CONTACT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {selectedIds.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Bulk Actions ({selectedIds.size}) <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onBulkAction?.('assign_sdr', Array.from(selectedIds))}>Assign SDR Owner</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('assign_ae', Array.from(selectedIds))}>Assign AE Owner</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('update_status', Array.from(selectedIds))}>Update Status</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkAction?.('update_lifecycle', Array.from(selectedIds))}>Update Lifecycle Stage</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10">
                <Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead><SortHeader field="full_name">Name</SortHeader></TableHead>
              <TableHead><SortHeader field="job_title">Title</SortHeader></TableHead>
              <TableHead><SortHeader field="email">Email</SortHeader></TableHead>
              <TableHead><SortHeader field="lifecycle_stage">Stage</SortHeader></TableHead>
              <TableHead><SortHeader field="status">Status</SortHeader></TableHead>
              <TableHead><SortHeader field="contact_score">Score</SortHeader></TableHead>
              <TableHead><SortHeader field="lead_source">Source</SortHeader></TableHead>
              <TableHead><SortHeader field="last_activity_date">Last Activity</SortHeader></TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No contacts found</p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(contact => (
                <TableRow
                  key={contact.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                >
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(contact.id)} onCheckedChange={() => toggleOne(contact.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{contact.full_name || '—'}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{contact.job_title || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{contact.email || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-[10px]', lifecycleColors[contact.lifecycle_stage] || '')}>
                      {LIFECYCLE_STAGES.find(s => s.value === contact.lifecycle_stage)?.label || contact.lifecycle_stage}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-[10px]', statusColors[contact.status] || '')}>
                      {CONTACT_STATUSES.find(s => s.value === contact.status)?.label || contact.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{contact.contact_score || 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{contact.lead_source || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {contact.last_activity_date ? format(new Date(contact.last_activity_date), 'MMM d') : '—'}
                  </TableCell>
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
