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
import { BookOpen, Plus, Check, X, Search, ArrowUp, ArrowDown, ArrowUpDown, Building2, Layers } from 'lucide-react';
import { useMasterLenders, MasterLender, MasterLenderInsert } from '@/hooks/useMasterLenders';
import { Virtuoso } from 'react-virtuoso';
import { cn } from '@/lib/utils';
import { LenderDetailDialog, LenderEditData } from '@/components/lenders/LenderDetailDialog';
import { toast } from 'sonner';
import { MultiSelectFilter } from '@/components/deals/MultiSelectFilter';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Parse a raw lender_type string into a list of normalized atomic tags.
// - splits on commas
// - trims whitespace, collapses repeated whitespace
// - filters out emails, urls, phone-like strings, and obvious junk
function parseTypeTags(value: string | null | undefined): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => {
      if (!s) return false;
      if (s.length > 60) return false;
      if (/[@]/.test(s)) return false; // emails
      if (/^https?:\/\//i.test(s)) return false; // urls
      if (/^\+?\d[\d\s().-]{6,}$/.test(s)) return false; // phone numbers
      if (!/[a-zA-Z]/.test(s)) return false; // must contain letters
      return true;
    });
}

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
        <Button variant="outline" size="icon" className="h-8 w-8">
          <BookOpen className="h-3.5 w-3.5" />
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
  const { lenders: masterLenders, loading, updateLender } = useMasterLenders();
  const [search, setSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [groupByTier, setGroupByTier] = useState(true);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Multi-select state
  const [selectedLenders, setSelectedLenders] = useState<Set<string>>(new Set());

  const toggleLenderSelection = useCallback((name: string) => {
    setSelectedLenders(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleBulkAdd = useCallback(() => {
    selectedLenders.forEach(name => {
      onAddLender(name);
    });
    toast.success(`${selectedLenders.size} lender${selectedLenders.size !== 1 ? 's' : ''} added to deal`);
    setSelectedLenders(new Set());
  }, [selectedLenders, onAddLender]);

  // Remove reason state
  const [removingLender, setRemovingLender] = useState<{ id: string; name: string } | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  // Lender detail dialog state
  const [detailLender, setDetailLender] = useState<MasterLender | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const openLenderDetail = useCallback((lender: MasterLender) => {
    setDetailLender(lender);
    setIsDetailOpen(true);
  }, []);

  const detailLenderInfo = useMemo(() => {
    if (!detailLender) return null;
    return {
      id: detailLender.id,
      name: detailLender.name,
      contact: {
        name: detailLender.contact_name || '',
        title: detailLender.contact_title || '',
        email: detailLender.email || '',
        phone: detailLender.contact_phone || '',
      },
      preferences: [
        ...(detailLender.loan_types || []),
        ...(detailLender.industries || []),
        detailLender.geo,
      ].filter(Boolean) as string[],
      website: detailLender.lender_one_pager_url || undefined,
      description: detailLender.company_requirements || undefined,
      lenderType: detailLender.lender_type || undefined,
      minDeal: detailLender.min_deal,
      maxDeal: detailLender.max_deal,
      geo: detailLender.geo,
      industries: detailLender.industries,
      loanTypes: detailLender.loan_types,
      minRevenue: detailLender.min_revenue,
      ebitdaMin: detailLender.ebitda_min,
      companyRequirements: detailLender.company_requirements,
      upfrontChecklist: detailLender.upfront_checklist,
      postTermSheetChecklist: detailLender.post_term_sheet_checklist,
      b2bB2c: detailLender.b2b_b2c,
      lenderNotes: detailLender.deal_structure_notes,
      tier: detailLender.tier,
      relationshipOwners: detailLender.relationship_owners,
    };
  }, [detailLender]);

  const handleDetailSave = useCallback(async (lenderId: string, data: LenderEditData) => {
    const lenderData: MasterLenderInsert = {
      name: data.name.trim(),
      contact_name: data.contactName.trim() || null,
      contact_phone: data.contactPhone?.trim() || null,
      email: data.email.trim() || null,
      lender_type: data.lenderType.trim() || null,
      loan_types: data.loanTypes.split(',').map(p => p.trim()).filter(p => p) || null,
      min_deal: data.minDeal ? parseFloat(data.minDeal) : null,
      max_deal: data.maxDeal ? parseFloat(data.maxDeal) : null,
      industries: data.industries.split(',').map(p => p.trim()).filter(p => p) || null,
      geo: data.geo.trim() || null,
      company_requirements: data.description?.trim() || null,
      deal_structure_notes: data.lenderNotes?.trim() || null,
      min_revenue: data.minRevenue ? parseFloat(data.minRevenue) : null,
      ebitda_min: data.ebitdaMin ? parseFloat(data.ebitdaMin) : null,
      tier: data.tier ? `T${data.tier}` : null,
      relationship_owners: data.relationshipOwners?.trim() || null,
    };
    await updateLender(lenderId, lenderData);
    // Update detail lender in place
    const updated = masterLenders.find(l => l.id === lenderId);
    if (updated) setDetailLender({ ...updated, ...lenderData, id: lenderId } as MasterLender);
    toast.success(`${lenderData.name} updated`);
  }, [updateLender, masterLenders]);

  const existingSet = useMemo(() => new Set(existingLenderNames.map(n => n.toLowerCase())), [existingLenderNames]);

  const lenderTypes = useMemo(() => {
    const seen = new Map<string, string>(); // lower -> canonical
    masterLenders.forEach(l => {
      parseTypeTags(l.lender_type).forEach(tag => {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
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
    if (selectedTypes.length > 0) {
      const wanted = selectedTypes.map(t => t.toLowerCase());
      list = list.filter(l => {
        const tags = parseTypeTags(l.lender_type).map(t => t.toLowerCase());
        return wanted.some(w => tags.includes(w));
      });
    }
    if (tierFilter !== 'all') {
      list = list.filter(l => (l.tier || 'None') === tierFilter);
    }
    return list;
  }, [masterLenders, search, selectedTypes, tierFilter]);

  const sorted = useMemo(() => {
    const items = filtered.map(l => ({ ...l, isOnDeal: existingSet.has(l.name.toLowerCase()) }));
    const tierOrder: Record<string, number> = { 'T1': 0, 'T2': 1, 'T3': 2 };

    if (!sortColumn || !sortDirection) {
      // Default sort: tier order then alphabetical
      items.sort((a, b) => {
        if (groupByTier) {
          const at = tierOrder[a.tier || 'None'] ?? 99;
          const bt = tierOrder[b.tier || 'None'] ?? 99;
          if (at !== bt) return at - bt;
        }
        return a.name.localeCompare(b.name);
      });
      return items;
    }
    items.sort((a, b) => {
      // When grouping, always sort by tier first
      if (groupByTier) {
        const at = tierOrder[a.tier || 'None'] ?? 99;
        const bt = tierOrder[b.tier || 'None'] ?? 99;
        if (at !== bt) return at - bt;
      }
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
  }, [filtered, existingSet, sortColumn, sortDirection, groupByTier]);

  // Build flat list with tier separator rows when grouping
  type RowItem = { type: 'lender'; lender: typeof sorted[number] } | { type: 'tier-header'; tier: string; count: number };
  const rows = useMemo<RowItem[]>(() => {
    if (!groupByTier) {
      return sorted.map(l => ({ type: 'lender' as const, lender: l }));
    }
    const result: RowItem[] = [];
    let lastTier: string | null = null;
    const tierCounts: Record<string, number> = {};
    sorted.forEach(l => {
      const t = l.tier || 'None';
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    });
    for (const l of sorted) {
      const t = l.tier || 'None';
      if (t !== lastTier) {
        result.push({ type: 'tier-header', tier: t, count: tierCounts[t] });
        lastTier = t;
      }
      result.push({ type: 'lender', lender: l });
    }
    return result;
  }, [sorted, groupByTier]);

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
    <DialogContent className="max-w-[95vw] h-[85vh] flex flex-col p-0 gap-0 border-border/60 bg-background shadow-2xl overflow-hidden">
      <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0 space-y-0">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
              Lender Directory
            </DialogTitle>
            <span className="text-xs text-muted-foreground/80 tabular-nums">
              {sorted.length.toLocaleString()} lenders
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              <span className="text-foreground/70">{totalOnDeal} on deal</span>
            </span>
          </div>
        </div>
        <DialogDescription className="sr-only">Browse and manage lenders for this deal</DialogDescription>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              placeholder="Search lenders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm bg-muted/30 border-border/50 focus-visible:bg-background focus-visible:border-border focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:ring-offset-0"
            />
          </div>
          <MultiSelectFilter
            label="All Types"
            options={lenderTypes.map(t => ({ value: t, label: t }))}
            selected={selectedTypes}
            onChange={setSelectedTypes}
            className="h-9 w-[180px] text-sm bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-border"
          />
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="h-9 w-[130px] text-sm bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-border focus:ring-1 focus:ring-ring/40 focus:ring-offset-0">
              <SelectValue placeholder="All Tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="T1">T1</SelectItem>
              <SelectItem value="T2">T2</SelectItem>
              <SelectItem value="T3">T3</SelectItem>
              <SelectItem value="None">No Tier</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setGroupByTier(g => !g)}
            className={cn(
              'h-9 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium border transition-colors',
              groupByTier
                ? 'bg-foreground/[0.04] border-border text-foreground'
                : 'bg-transparent border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Group by Tier
          </button>
        </div>
        {selectedTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/30">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium mr-1">
              Filters
            </span>
            {selectedTypes.map(t => (
              <span
                key={t}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs rounded-md bg-foreground/[0.04] border border-border/60 text-foreground/90"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setSelectedTypes(prev => prev.filter(x => x !== t))}
                  className="rounded-sm hover:bg-foreground/10 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelectedTypes([])}
              className="text-xs text-muted-foreground hover:text-foreground ml-1 underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </DialogHeader>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading lender directory...</div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No lenders found matching your filters.</div>
        ) : (
          <div className="h-full overflow-hidden bg-background">
            <ScrollArea className="w-full h-full">
              <div style={{ minWidth: TOTAL_WIDTH }}>
                {/* Header Row - identical style to LenderSpreadsheetView */}
                <div className="flex sticky top-0 z-10 bg-muted/40 backdrop-blur-sm border-b border-border/50">
                  {/* Row number header */}
                  <div className="flex-shrink-0 w-[50px] px-2 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 bg-muted/40 sticky left-0 z-20">
                    #
                  </div>
                  {COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className={cn(
                        'flex-shrink-0 px-2 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80 bg-muted/40 flex items-center',
                        col.sortable && 'cursor-pointer hover:text-foreground select-none transition-colors',
                        col.key === 'name' && 'sticky left-[50px] z-20 bg-muted/40'
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
                  totalCount={rows.length}
                  itemContent={(index) => {
                    const row = rows[index];
                    if (row.type === 'tier-header') {
                      return (
                        <div
                          className="flex items-center gap-2 px-4 py-1.5 bg-muted/20 border-y border-border/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sticky z-[5]"
                          style={{ minWidth: TOTAL_WIDTH }}
                        >
                          <span className="text-foreground/80">{row.tier === 'None' ? 'No Tier' : row.tier}</span>
                          <span className="text-muted-foreground/60 normal-case tracking-normal">
                            {row.count} lender{row.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      );
                    }
                    const lender = row.lender;
                    const isSelected = selectedLenders.has(lender.name);
                    return (
                      <div
                        className={cn(
                          'group flex border-b border-border/30 hover:bg-muted/30 transition-colors',
                          lender.isOnDeal && 'bg-primary/[0.04]',
                          isSelected && !lender.isOnDeal && 'bg-primary/[0.07]'
                        )}
                      >
                        {/* Row number + checkbox */}
                        <div className="flex-shrink-0 w-[50px] px-2 py-2 text-xs text-muted-foreground/60 tabular-nums bg-background/60 sticky left-0 z-10 flex items-center justify-center group-hover:bg-muted/30 transition-colors">
                          {lender.isOnDeal ? (
                            <span>{index + 1}</span>
                          ) : (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleLenderSelection(lender.name)}
                              className="h-3.5 w-3.5"
                            />
                          )}
                        </div>
                        {COLUMNS.map((col) => {
                          // Status column
                          if (col.key === 'status') {
                            return (
                              <div
                                key={col.key}
                                className="flex-shrink-0 px-2 py-2 text-xs flex items-center"
                                style={{ width: col.width }}
                              >
                                {lender.isOnDeal ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                                    <Check className="h-2.5 w-2.5" />On Deal
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </div>
                            );
                          }
                          // Action column
                          if (col.key === 'action') {
                            return (
                              <div
                                key={col.key}
                                className="flex-shrink-0 px-2 py-1.5 flex items-center justify-center"
                                style={{ width: col.width }}
                              >
                                {lender.isOnDeal ? (
                                  <button
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
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
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
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
                          // Name column - clickable
                          if (col.key === 'name') {
                            return (
                              <div
                                key={col.key}
                                className={cn(
                                  "flex-shrink-0 px-2 py-2 text-xs text-foreground truncate cursor-pointer font-medium sticky left-[50px] z-10 bg-background group-hover:bg-muted/30 hover:text-primary transition-colors",
                                  lender.isOnDeal && "bg-primary/[0.04] group-hover:bg-muted/30"
                                )}
                                style={{ width: col.width }}
                                title={lender.name}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const original = masterLenders.find(ml => ml.id === lender.id);
                                  if (original) openLenderDetail(original);
                                }}
                              >
                                {lender.name}
                              </div>
                            );
                          }
                          // Regular columns
                          const rawValue = lender[col.key as keyof MasterLender];
                          const isArray = Array.isArray(rawValue) && rawValue.length > 0;
                          return (
                            <div
                              key={col.key}
                              className={cn(
                                'flex-shrink-0 px-2 py-2 text-xs text-foreground/80',
                                isArray ? 'flex items-center gap-1 overflow-hidden' : 'truncate'
                              )}
                              style={{ width: col.width }}
                              title={formatCellValue(lender, col.key)}
                            >
                              {isArray ? (
                                (rawValue as string[]).map((tag, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex shrink-0 items-center rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                                  >
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                formatCellValue(lender, col.key)
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                  components={{
                    Footer: () => (
                      <div className="py-6 px-4 text-center text-xs text-muted-foreground/60 border-t border-border/30">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3 w-3" />
                          {sorted.length.toLocaleString()} lenders
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

      {/* Floating bulk-add bar */}
      {selectedLenders.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-primary text-primary-foreground px-5 py-3 rounded-xl shadow-lg animate-in slide-in-from-bottom-4 fade-in">
          <span className="text-sm font-medium">
            {selectedLenders.size} lender{selectedLenders.size !== 1 ? 's' : ''} selected
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={handleBulkAdd}
          >
            <Plus className="h-3.5 w-3.5" />
            Add to Deal
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => setSelectedLenders(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

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

      {/* Lender Detail Dialog */}
      <LenderDetailDialog
        lender={detailLenderInfo}
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) setDetailLender(null);
        }}
        onSave={handleDetailSave}
      />
    </DialogContent>
  );
});
