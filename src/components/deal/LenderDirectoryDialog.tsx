import { useState, useMemo, useCallback, useRef, memo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { BookOpen, Plus, Check, X, Search, ArrowUp, ArrowDown, ArrowUpDown, Building2 } from 'lucide-react';
import { useMasterLenders, MasterLender } from '@/hooks/useMasterLenders';
import { Virtuoso } from 'react-virtuoso';
import { cn } from '@/lib/utils';

interface LenderDirectoryDialogProps {
  existingLenderNames: string[];
  onAddLender: (name: string) => void;
  onRemoveLender: (lenderId: string, reason?: string) => void;
  dealLenders: { id: string; name: string }[];
}

export function LenderDirectoryDialog(props: LenderDirectoryDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Directory</span>
        </Button>
      </DialogTrigger>
      {open && <LenderDirectoryContent {...props} />}
    </Dialog>
  );
}

// ── Column definitions identical to LenderSpreadsheetView, with "Status" + "Action" appended ──

const COLUMNS = [
  { key: 'name', label: 'Name', width: 180, sortable: true },
  { key: 'status', label: 'Status', width: 90, sortable: true },
  { key: 'active', label: 'Active', width: 70, sortable: true },
  { key: 'tier', label: 'Tier', width: 60, sortable: true },
  { key: 'email', label: 'E-mail', width: 200, sortable: true },
  { key: 'lender_type', label: 'Lender Type', width: 120, sortable: true },
  { key: 'loan_types', label: 'Loan Type', width: 150, sortable: true },
  { key: 'sub_debt', label: 'Sub Debt', width: 80, sortable: true },
  { key: 'cash_burn', label: 'Cash Burn', width: 90, sortable: true },
  { key: 'sponsorship', label: 'Sponsorship', width: 100, sortable: true },
  { key: 'min_revenue', label: 'Min Rev', width: 100, sortable: true },
  { key: 'ebitda_min', label: 'EBITDA Min', width: 100, sortable: true },
  { key: 'min_deal', label: 'Min', width: 100, sortable: true },
  { key: 'max_deal', label: 'Max', width: 100, sortable: true },
  { key: 'industries', label: 'Deal Industries', width: 200, sortable: true },
  { key: 'industries_to_avoid', label: 'Industries to Avoid', width: 180, sortable: true },
  { key: 'b2b_b2c', label: 'B2B / B2C', width: 90, sortable: true },
  { key: 'refinancing', label: 'Refinancing', width: 100, sortable: true },
  { key: 'company_requirements', label: 'Company Requirements', width: 200, sortable: true },
  { key: 'deal_structure_notes', label: 'Deal Structure(s)', width: 180, sortable: true },
  { key: 'geo', label: 'Geo', width: 150, sortable: true },
  { key: 'contact_name', label: 'Contact Name', width: 150, sortable: true },
  { key: 'contact_title', label: 'Contact Title', width: 130, sortable: true },
  { key: 'relationship_owners', label: 'Relationship Owner(s)', width: 160, sortable: true },
  { key: 'action', label: 'Action', width: 100, sortable: false },
] as const;

type ColumnKey = typeof COLUMNS[number]['key'];

const TOTAL_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, 0) + 50; // +50 for row number

function formatCellValue(lender: MasterLender, key: string): string {
  if (key === 'status' || key === 'action') return '';
  const value = lender[key as keyof MasterLender];
  if (value === null || value === undefined) return '';
  if (key === 'active') return value ? 'Yes' : 'No';
  if (key === 'tier') return value ? String(value) : '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') {
    if (['min_deal', 'max_deal', 'min_revenue', 'ebitda_min'].includes(key)) {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value}`;
    }
    return value.toString();
  }
  if (key === 'created_at' || key === 'external_last_modified') {
    try { return new Date(value as string).toLocaleDateString(); } catch { return String(value); }
  }
  return String(value);
}

function getSortValue(lender: MasterLender, key: string, isOnDeal: boolean): string | number | null {
  if (key === 'status') return isOnDeal ? 1 : 0;
  if (key === 'action') return null;
  const value = lender[key as keyof MasterLender];
  if (value === null || value === undefined) return null;
  if (key === 'active') return value ? 1 : 0;
  if (Array.isArray(value)) return value.length > 0 ? value[0].toLowerCase() : '';
  if (typeof value === 'number') return value;
  if (key === 'created_at' || key === 'external_last_modified') {
    try { return new Date(value as string).getTime(); } catch { return String(value).toLowerCase(); }
  }
  if (typeof value === 'string') return value.toLowerCase();
  return String(value).toLowerCase();
}

type SortDirection = 'asc' | 'desc' | null;

const LenderDirectoryContent = memo(function LenderDirectoryContent({
  existingLenderNames,
  onAddLender,
  onRemoveLender,
  dealLenders,
}: LenderDirectoryDialogProps) {
  const { lenders: masterLenders, loading } = useMasterLenders();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Remove reason state
  const [removingLender, setRemovingLender] = useState<{ id: string; name: string } | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  const existingSet = useMemo(() => new Set(existingLenderNames.map(n => n.toLowerCase())), [existingLenderNames]);

  const lenderTypes = useMemo(() => {
    const types = new Set<string>();
    masterLenders.forEach(l => { if (l.lender_type) types.add(l.lender_type); });
    return Array.from(types).sort();
  }, [masterLenders]);

  const handleHeaderClick = useCallback((key: string, sortable: boolean) => {
    if (!sortable) return;
    setSortColumn(prev => {
      if (prev === key) {
        setSortDirection(d => {
          if (d === 'asc') return 'desc';
          if (d === 'desc') { setSortColumn(null); return null; }
          return 'asc';
        });
        return prev;
      }
      setSortDirection('asc');
      return key;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = masterLenders;
    if (search.trim().length >= 1) {
      const q = search.toLowerCase().replace(/\s+/g, '');
      list = list.filter(l => l.name.toLowerCase().replace(/\s+/g, '').includes(q));
    }
    if (typeFilter !== 'all') {
      list = list.filter(l => l.lender_type === typeFilter);
    }
    return list;
  }, [masterLenders, search, typeFilter]);

  const sorted = useMemo(() => {
    const items = filtered.map(l => ({ ...l, isOnDeal: existingSet.has(l.name.toLowerCase()) }));
    if (!sortColumn || !sortDirection) {
      // Default: group by tier T1→T2→T3→None, then alphabetical
      const tierOrder: Record<string, number> = { 'T1': 0, 'T2': 1, 'T3': 2 };
      items.sort((a, b) => {
        const at = tierOrder[a.tier || 'None'] ?? 99;
        const bt = tierOrder[b.tier || 'None'] ?? 99;
        if (at !== bt) return at - bt;
        return a.name.localeCompare(b.name);
      });
      return items;
    }
    items.sort((a, b) => {
      const aVal = getSortValue(a, sortColumn, a.isOnDeal);
      const bVal = getSortValue(b, sortColumn, b.isOnDeal);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
      else cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'desc' ? -cmp : cmp;
    });
    return items;
  }, [filtered, existingSet, sortColumn, sortDirection]);

  const confirmRemove = useCallback(() => {
    if (!removingLender) return;
    const dealLender = dealLenders.find(dl => dl.name.toLowerCase() === removingLender.name.toLowerCase());
    if (dealLender) onRemoveLender(dealLender.id, removeReason.trim() || undefined);
    setRemovingLender(null);
    setRemoveReason('');
  }, [removingLender, removeReason, dealLenders, onRemoveLender]);

  const renderSortIcon = (key: string, sortable: boolean) => {
    if (!sortable) return null;
    if (sortColumn === key) {
      if (sortDirection === 'asc') return <ArrowUp className="h-3 w-3 ml-1 text-primary" />;
      if (sortDirection === 'desc') return <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
    }
    return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
  };

  const totalOnDeal = useMemo(() => sorted.filter(l => l.isOnDeal).length, [sorted]);

  return (
    <DialogContent className="max-w-[95vw] h-[85vh] flex flex-col p-0">
      <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <DialogTitle className="text-lg">Lender Directory</DialogTitle>
        <DialogDescription className="sr-only">Browse and manage lenders for this deal</DialogDescription>
        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search lenders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All Types</option>
            {lenderTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="text-xs text-muted-foreground ml-auto">
            {sorted.length} lenders · {totalOnDeal} on deal
          </div>
        </div>
      </DialogHeader>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading lender directory...</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No lenders found matching your filters.</div>
        ) : (
          <div className="border-t border-border h-full overflow-hidden">
            <ScrollArea className="w-full h-full">
              <div style={{ minWidth: TOTAL_WIDTH }}>
                {/* Header Row - identical style to LenderSpreadsheetView */}
                <div className="flex sticky top-0 z-10 bg-muted border-b border-border">
                  {/* Row number header */}
                  <div className="flex-shrink-0 w-[50px] px-2 py-2 text-xs font-semibold text-muted-foreground border-r border-border bg-muted sticky left-0 z-20">
                    #
                  </div>
                  {COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className={cn(
                        'flex-shrink-0 px-2 py-2 text-xs font-semibold text-foreground border-r border-border bg-muted flex items-center',
                        col.sortable && 'cursor-pointer hover:bg-muted/80 select-none'
                      )}
                      style={{ width: col.width }}
                      title={col.sortable ? `Click to sort by ${col.label}` : col.label}
                      onClick={() => handleHeaderClick(col.key, col.sortable)}
                    >
                      <span className="truncate">{col.label}</span>
                      {renderSortIcon(col.key, col.sortable)}
                    </div>
                  ))}
                </div>

                {/* Data Rows - Virtualized */}
                <Virtuoso
                  style={{ height: 'calc(85vh - 180px)' }}
                  totalCount={sorted.length}
                  itemContent={(index) => {
                    const lender = sorted[index];
                    return (
                      <div
                        className={cn(
                          'flex border-b border-border/50 hover:bg-muted/50 transition-colors',
                          lender.isOnDeal && 'bg-primary/5'
                        )}
                      >
                        {/* Row number */}
                        <div className="flex-shrink-0 w-[50px] px-2 py-1.5 text-xs text-muted-foreground border-r border-border/50 bg-muted/30 sticky left-0 z-10">
                          {index + 1}
                        </div>
                        {COLUMNS.map((col) => {
                          // Status column
                          if (col.key === 'status') {
                            return (
                              <div
                                key={col.key}
                                className="flex-shrink-0 px-2 py-1.5 text-xs border-r border-border/50 flex items-center"
                                style={{ width: col.width }}
                              >
                                {lender.isOnDeal ? (
                                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                                    <Check className="h-3 w-3" />On Deal
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            );
                          }
                          // Action column
                          if (col.key === 'action') {
                            return (
                              <div
                                key={col.key}
                                className="flex-shrink-0 px-2 py-1 border-r border-border/50 flex items-center justify-center"
                                style={{ width: col.width }}
                              >
                                {lender.isOnDeal ? (
                                  <button
                                    className="inline-flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors px-2 py-0.5 rounded hover:bg-destructive/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRemovingLender({ id: lender.id, name: lender.name });
                                      setRemoveReason('');
                                    }}
                                  >
                                    <X className="h-3 w-3" />Remove
                                  </button>
                                ) : (
                                  <button
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-0.5 rounded hover:bg-primary/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onAddLender(lender.name);
                                    }}
                                  >
                                    <Plus className="h-3 w-3" />Add
                                  </button>
                                )}
                              </div>
                            );
                          }
                          // Regular columns
                          return (
                            <div
                              key={col.key}
                              className="flex-shrink-0 px-2 py-1.5 text-xs text-foreground border-r border-border/50 truncate"
                              style={{ width: col.width }}
                              title={formatCellValue(lender, col.key)}
                            >
                              {formatCellValue(lender, col.key)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                  components={{
                    Footer: () => (
                      <div className="py-4 px-4 text-center text-sm text-muted-foreground border-t border-border/50">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Showing all {sorted.length.toLocaleString()} lenders
                        </span>
                      </div>
                    ),
                  }}
                />
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Remove reason overlay */}
      {removingLender && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-base font-semibold mb-1">Remove {removingLender.name}?</h3>
            <p className="text-sm text-muted-foreground mb-4">This will remove the lender from this deal. You can optionally add a reason.</p>
            <Textarea placeholder="Reason for removal (optional)..." value={removeReason} onChange={e => setRemoveReason(e.target.value)} className="mb-4 resize-none" rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRemovingLender(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={confirmRemove}>Remove Lender</Button>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  );
});
