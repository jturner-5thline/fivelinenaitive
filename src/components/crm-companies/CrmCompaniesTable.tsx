import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, ArrowUpDown, Building2, ChevronDown } from 'lucide-react';
import { CrmCompany, CRM_COMPANY_LIFECYCLES, CRM_COMPANY_STATUSES } from '@/hooks/useCrmCompanies';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let result = [...companies];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q)
      );
    }
    if (lifecycleFilter !== 'all') result = result.filter(c => c.lifecycle_stage === lifecycleFilter);
    if (statusFilter !== 'all') result = result.filter(c => c.status === statusFilter);

    result.sort((a, b) => {
      const aVal = (a as any)[sortField] ?? '';
      const bVal = (b as any)[sortField] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [companies, search, lifecycleFilter, statusFilter, sortField, sortDir]);

  const toggleAll = () => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(c => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => handleSort(field)}>
      {children}<ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  const formatCurrency = (v: number | null) => v != null ? `$${v.toLocaleString()}` : '—';

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
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-10"><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
              <TableHead><SortHeader field="name">Company</SortHeader></TableHead>
              <TableHead><SortHeader field="domain">Domain</SortHeader></TableHead>
              <TableHead><SortHeader field="industry">Industry</SortHeader></TableHead>
              <TableHead><SortHeader field="lifecycle_stage">Stage</SortHeader></TableHead>
              <TableHead><SortHeader field="status">Status</SortHeader></TableHead>
              <TableHead><SortHeader field="segment">Segment</SortHeader></TableHead>
              <TableHead><SortHeader field="arr">ARR</SortHeader></TableHead>
              <TableHead><SortHeader field="employee_range">Size</SortHeader></TableHead>
              <TableHead><SortHeader field="hq_country">Location</SortHeader></TableHead>
              <TableHead><SortHeader field="last_activity_date">Last Activity</SortHeader></TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No companies found</p>
                </TableCell>
              </TableRow>
            ) : filtered.map(co => (
              <TableRow key={co.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/crm-companies/${co.id}`)}>
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
                <TableCell className="text-sm text-muted-foreground">{co.domain || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{co.industry || '—'}</TableCell>
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
                      <DropdownMenuItem>Add Contact</DropdownMenuItem>
                      <DropdownMenuItem>Create Deal</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} compan{filtered.length !== 1 ? 'ies' : 'y'}</p>
    </div>
  );
}
