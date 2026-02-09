import { useState, useMemo, useCallback, memo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BookOpen, Plus, Check, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useMasterLenders, MasterLender } from '@/hooks/useMasterLenders';
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
      {open && (
        <LenderDirectoryContent {...props} onClose={() => setOpen(false)} />
      )}
    </Dialog>
  );
}

// ── All heavy logic lives here, only mounted when dialog is open ──

type SortColumn = 'name' | 'lender_type' | 'min_deal' | 'max_deal' | 'tier';
type SortDir = 'asc' | 'desc';

const TIER_ORDER: Record<string, number> = { 'T1': 0, 'T2': 1, 'T3': 2 };
const TIER_COLORS: Record<string, string> = {
  'T1': 'bg-primary/10 text-primary border-primary/30',
  'T2': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  'T3': 'bg-muted text-muted-foreground border-border',
};

function formatDealSize(val?: number | null) {
  if (val == null) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

interface ContentProps extends LenderDirectoryDialogProps {
  onClose: () => void;
}

const LenderDirectoryContent = memo(function LenderDirectoryContent({
  existingLenderNames,
  onAddLender,
  onRemoveLender,
  dealLenders,
}: ContentProps) {
  const { lenders: masterLenders, loading } = useMasterLenders();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortCol, setSortCol] = useState<SortColumn>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [collapsedTiers, setCollapsedTiers] = useState<Set<string>>(new Set());
  const [removingLender, setRemovingLender] = useState<{ id: string; name: string } | null>(null);
  const [removeReason, setRemoveReason] = useState('');

  const existingSet = useMemo(() => new Set(existingLenderNames.map(n => n.toLowerCase())), [existingLenderNames]);

  const lenderTypes = useMemo(() => {
    const types = new Set<string>();
    masterLenders.forEach(l => { if (l.lender_type) types.add(l.lender_type); });
    return Array.from(types).sort();
  }, [masterLenders]);

  const handleSort = useCallback((col: SortColumn) => {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return col;
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

    const sorted = [...list];
    sorted.sort((a, b) => {
      const aTier = a.tier || 'None';
      const bTier = b.tier || 'None';
      const aTierOrder = TIER_ORDER[aTier] ?? 99;
      const bTierOrder = TIER_ORDER[bTier] ?? 99;
      if (aTierOrder !== bTierOrder) return aTierOrder - bTierOrder;

      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortCol) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'lender_type': return dir * (a.lender_type || '').localeCompare(b.lender_type || '');
        case 'min_deal': return dir * ((a.min_deal || 0) - (b.min_deal || 0));
        case 'max_deal': return dir * ((a.max_deal || 0) - (b.max_deal || 0));
        case 'tier': return dir * aTier.localeCompare(bTier);
        default: return 0;
      }
    });
    return sorted;
  }, [masterLenders, search, typeFilter, sortCol, sortDir]);

  const grouped = useMemo(() => {
    const tierMap = new Map<string, (MasterLender & { isOnDeal: boolean })[]>();
    for (const l of filtered) {
      const tier = l.tier || 'None';
      if (!tierMap.has(tier)) tierMap.set(tier, []);
      tierMap.get(tier)!.push({ ...l, isOnDeal: existingSet.has(l.name.toLowerCase()) });
    }
    const groups: { tier: string; lenders: (MasterLender & { isOnDeal: boolean })[] }[] = [];
    for (const tier of ['T1', 'T2', 'T3', 'None']) {
      if (tierMap.has(tier)) groups.push({ tier, lenders: tierMap.get(tier)! });
    }
    for (const [tier, lenders] of tierMap) {
      if (!['T1', 'T2', 'T3', 'None'].includes(tier)) groups.push({ tier, lenders });
    }
    return groups;
  }, [filtered, existingSet]);

  const toggleTier = useCallback((tier: string) => {
    setCollapsedTiers(prev => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
  }, []);

  const confirmRemove = useCallback(() => {
    if (!removingLender) return;
    const dealLender = dealLenders.find(dl => dl.name.toLowerCase() === removingLender.name.toLowerCase());
    if (dealLender) onRemoveLender(dealLender.id, removeReason.trim() || undefined);
    setRemovingLender(null);
    setRemoveReason('');
  }, [removingLender, removeReason, dealLenders, onRemoveLender]);

  const totalOnDeal = useMemo(() => filtered.filter(l => existingSet.has(l.name.toLowerCase())).length, [filtered, existingSet]);

  const SortHeader = ({ col, label }: { col: SortColumn; label: string }) => (
    <button
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => handleSort(col)}
    >
      {label}
      {sortCol === col && <span className="text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <DialogContent className="max-w-5xl h-[80vh] flex flex-col p-0">
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
            {filtered.length} lenders · {totalOnDeal} on deal
          </div>
        </div>
      </DialogHeader>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading lender directory...</div>
        ) : grouped.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">No lenders found matching your filters.</div>
        ) : (
          <div className="px-6 py-2">
            {grouped.map(group => {
              const isCollapsed = collapsedTiers.has(group.tier);
              return (
                <div key={group.tier} className="mb-4">
                  <button className="flex items-center gap-2 w-full py-2 text-left" onClick={() => toggleTier(group.tier)}>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <Badge variant="outline" className={cn('text-xs', TIER_COLORS[group.tier] || 'bg-muted text-muted-foreground border-border')}>
                      {group.tier === 'None' ? 'No Tier' : group.tier}
                    </Badge>
                    <span className="text-xs text-muted-foreground">({group.lenders.length} lender{group.lenders.length !== 1 ? 's' : ''})</span>
                  </button>

                  {!isCollapsed && (
                    <div className="border border-border rounded-md overflow-hidden">
                      <div className="grid grid-cols-[1fr_120px_100px_100px_140px_100px] gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                        <SortHeader col="name" label="Name" />
                        <SortHeader col="lender_type" label="Type" />
                        <SortHeader col="min_deal" label="Min Deal" />
                        <SortHeader col="max_deal" label="Max Deal" />
                        <span className="text-xs font-medium text-muted-foreground">Loan Types</span>
                        <span className="text-xs font-medium text-muted-foreground text-center">Action</span>
                      </div>
                      {group.lenders.map(lender => (
                        <div
                          key={lender.id}
                          className={cn(
                            'grid grid-cols-[1fr_120px_100px_100px_140px_100px] gap-2 px-4 py-2.5 border-b border-border last:border-b-0 items-center text-sm',
                            lender.isOnDeal && 'bg-primary/5'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-medium">{lender.name}</span>
                            {lender.isOnDeal && (
                              <Badge variant="secondary" className="text-xs shrink-0 gap-1">
                                <Check className="h-3 w-3" />On Deal
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground truncate">{lender.lender_type || '—'}</span>
                          <span className="text-muted-foreground">{formatDealSize(lender.min_deal)}</span>
                          <span className="text-muted-foreground">{formatDealSize(lender.max_deal)}</span>
                          <div className="flex flex-wrap gap-1">
                            {(lender.loan_types || []).slice(0, 2).map(lt => (
                              <Badge key={lt} variant="outline" className="text-[10px] px-1.5 py-0">{lt}</Badge>
                            ))}
                            {(lender.loan_types || []).length > 2 && (
                              <span className="text-[10px] text-muted-foreground">+{lender.loan_types!.length - 2}</span>
                            )}
                          </div>
                          <div className="flex justify-center">
                            {lender.isOnDeal ? (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                                onClick={() => { setRemovingLender({ id: lender.id, name: lender.name }); setRemoveReason(''); }}
                              >
                                <X className="h-3 w-3" />Remove
                              </Button>
                            ) : (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"
                                onClick={() => onAddLender(lender.name)}
                              >
                                <Plus className="h-3 w-3" />Add
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

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
