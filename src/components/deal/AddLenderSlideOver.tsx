import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, Check, Loader2, Sparkles, Info, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useMasterLenders, type MasterLender } from '@/hooks/useMasterLenders';
import { useLenderMatching, type DealCriteria, type LenderMatch } from '@/hooks/useLenderMatching';
import { useAiRecommendedLenders, type AiRecommendation, type AiRecommenderCriteriaOverride } from '@/hooks/useAiRecommendedLenders';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealName: string;
  criteria: DealCriteria;
  existingLenderNames: string[];
  configuredStages: { id: string; label: string; group: string }[];
  defaultStageId: string;
  onAddLender: (lenderName: string, stageId: string) => Promise<void> | void;
  dealId?: string;
  aiCriteriaOverride?: AiRecommenderCriteriaOverride;
}

const DEAL_TYPE_OPTIONS = [
  { id: 'abl', label: 'ABL', match: ['abl', 'asset-based', 'asset based'] },
  { id: 'growth-capital', label: 'Growth Capital', match: ['growth', 'venture', 'mezz'] },
  { id: 'capex', label: 'CapEx', match: ['capex', 'equipment'] },
  { id: 'acquisition', label: 'Acquisition', match: ['acquisition', 'buyout', 'lbo'] },
];

const SIZE_RANGES = [
  { id: 'lt5', label: '< $5MM', min: 0, max: 5_000_000 },
  { id: '5to25', label: '$5–25MM', min: 5_000_000, max: 25_000_000 },
  { id: '25to100', label: '$25–100MM', min: 25_000_000, max: 100_000_000 },
  { id: 'gt100', label: '> $100MM', min: 100_000_000, max: Number.MAX_SAFE_INTEGER },
];

function formatSize(min?: number | null, max?: number | null) {
  const fmt = (n?: number | null) => {
    if (n === null || n === undefined) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}MM`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  };
  if (!min && !max) return '—';
  return `${fmt(min)} – ${fmt(max)}`;
}

function formatLastActive(lender: MasterLender): string {
  const candidate = lender.last_synced_from_flex || lender.external_last_modified || lender.updated_at;
  if (!candidate) return '—';
  const d = new Date(candidate);
  if (isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function primaryFocus(lender: MasterLender): string {
  const lt = lender.loan_types && lender.loan_types.length > 0 ? lender.loan_types[0] : null;
  const ind = lender.industries && lender.industries.length > 0 ? lender.industries[0] : null;
  if (ind && lt) return `${ind} ${lt}`;
  if (lt) return lt;
  if (lender.lender_type) return lender.lender_type;
  return '—';
}

function scoreColor(score: number) {
  if (score >= 70) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (score >= 50) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (score >= 30) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-muted/40 text-muted-foreground border-border';
}

export function AddLenderSlideOver({
  open,
  onOpenChange,
  dealName,
  criteria,
  existingLenderNames,
  configuredStages,
  defaultStageId,
  onAddLender,
  dealId,
  aiCriteriaOverride,
}: Props) {
  const { lenders: masterLenders, loading } = useMasterLenders({ eagerAll: true });
  const { matches } = useLenderMatching(masterLenders, criteria, {
    minScore: 0,
    maxResults: 1000,
    excludeNames: existingLenderNames,
  });

  const matchByName = useMemo(() => {
    const m = new Map<string, number>();
    matches.forEach((mt) => m.set(mt.lender.name.toLowerCase(), mt.combinedScore));
    return m;
  }, [matches]);

  const preferredDefault = useMemo(() => {
    const byLabel = configuredStages.find((s) => /nda|needs list/i.test(s.label));
    return byLabel?.id || defaultStageId || configuredStages[0]?.id || '';
  }, [configuredStages, defaultStageId]);

  const [search, setSearch] = useState('');
  const [dealTypeFilters, setDealTypeFilters] = useState<string[]>([]);
  const [sizeFilter, setSizeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<string>(preferredDefault);
  const [confirmingLender, setConfirmingLender] = useState<MasterLender | null>(null);
  const [singleStage, setSingleStage] = useState<string>(preferredDefault);
  const [adding, setAdding] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);

  // AI recommendations — only fetched once the user toggles the AI Recommended filter.
  const { data: aiData, loading: aiLoading } = useAiRecommendedLenders(dealId, /* autoRun */ aiOnly, {
    criteriaOverride: aiCriteriaOverride,
  });

  const aiByName = useMemo(() => {
    const m = new Map<string, AiRecommendation>();
    (aiData?.recommendations || []).forEach((r) => m.set(r.lenderName.toLowerCase(), r));
    return m;
  }, [aiData]);

  const matchByNameFull = useMemo(() => {
    const m = new Map<string, LenderMatch>();
    matches.forEach((mt) => m.set(mt.lender.name.toLowerCase(), mt));
    return m;
  }, [matches]);

  // Reset state when reopened
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setBulkStage(preferredDefault);
    setSingleStage(preferredDefault);
  }, [open, preferredDefault]);

  const existingSet = useMemo(
    () => new Set(existingLenderNames.map((n) => n.trim().toLowerCase())),
    [existingLenderNames],
  );

  const filteredLenders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return masterLenders
      .filter((l) => !existingSet.has(l.name.trim().toLowerCase()))
      .filter((l) => {
        if (statusFilter === 'active' && l.active === false) return false;
        if (statusFilter === 'inactive' && l.active !== false) return false;
        return true;
      })
      .filter((l) => {
        if (dealTypeFilters.length === 0) return true;
        const hay = [
          ...(l.loan_types || []),
          l.lender_type || '',
          l.deal_structure_notes || '',
        ]
          .join(' ')
          .toLowerCase();
        return dealTypeFilters.some((f) => {
          const opt = DEAL_TYPE_OPTIONS.find((o) => o.id === f);
          return opt?.match.some((m) => hay.includes(m));
        });
      })
      .filter((l) => {
        if (sizeFilter === 'all') return true;
        const r = SIZE_RANGES.find((s) => s.id === sizeFilter);
        if (!r) return true;
        const lmin = l.min_deal ?? 0;
        const lmax = l.max_deal ?? Number.MAX_SAFE_INTEGER;
        // Overlap test
        return lmax >= r.min && lmin <= r.max;
      })
      .filter((l) => {
        if (!q) return true;
        return (
          l.name.toLowerCase().includes(q) ||
          (l.lender_type || '').toLowerCase().includes(q) ||
          (l.loan_types || []).some((lt) => lt.toLowerCase().includes(q)) ||
          (l.industries || []).some((i) => i.toLowerCase().includes(q))
        );
      })
      .filter((l) => {
        if (!aiOnly) return true;
        return aiByName.has(l.name.trim().toLowerCase());
      })
      .map((l) => {
        const key = l.name.toLowerCase();
        const ai = aiByName.get(key);
        const ruleScore = matchByName.get(key) ?? 0;
        const score = ai ? Math.max(ruleScore, ai.matchScore) : ruleScore;
        return { lender: l, score, ai };
      })
      .sort((a, b) => b.score - a.score);
  }, [masterLenders, existingSet, statusFilter, dealTypeFilters, sizeFilter, search, matchByName, aiOnly, aiByName]);

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleBulkAdd = async () => {
    if (selected.size === 0 || !bulkStage) return;
    setAdding(true);
    try {
      const names = Array.from(selected);
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        await onAddLender(name, bulkStage);
      }
      toast.success(`Added ${names.length} lender${names.length === 1 ? '' : 's'} to ${dealName}`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add lenders');
    } finally {
      setAdding(false);
    }
  };

  const handleSingleAdd = async () => {
    if (!confirmingLender || !singleStage) return;
    setAdding(true);
    try {
      await onAddLender(confirmingLender.name, singleStage);
      setConfirmingLender(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add lender');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[640px] p-0 flex flex-col"
        >
          <SheetHeader className="px-6 pt-6 pb-3">
            <SheetTitle className="text-base font-semibold">Add Lender to {dealName}</SheetTitle>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'directory' | 'ai')} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pb-2">
              <TabsList className="h-9">
                <TabsTrigger value="directory" className="text-xs">Lender Directory</TabsTrigger>
                <TabsTrigger value="ai" className="text-xs gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
                  AI Recommended
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="directory" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <div className="px-6 pb-3 space-y-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search lender directory..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-background/40 border-white/10"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ToggleGroup
                type="multiple"
                value={dealTypeFilters}
                onValueChange={(v) => setDealTypeFilters(v as string[])}
                className="flex flex-wrap gap-1"
              >
                {DEAL_TYPE_OPTIONS.map((o) => (
                  <ToggleGroupItem
                    key={o.id}
                    value={o.id}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs rounded-md border-white/10 bg-background/40 hover:bg-muted/40 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                  >
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Select value={sizeFilter} onValueChange={setSizeFilter}>
                <SelectTrigger className="h-7 w-[130px] text-xs bg-background/40 border-white/10">
                  <SelectValue placeholder="Deal size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any size</SelectItem>
                  {SIZE_RANGES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 w-[110px] text-xs bg-background/40 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {loading ? 'Loading directory…' : `${filteredLenders.length} lenders`}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-3 py-2 space-y-1">
              {loading && filteredLenders.length === 0 && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading lender directory…
                </div>
              )}
              {!loading && filteredLenders.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No lenders match these filters.
                </div>
              )}
              {filteredLenders.map(({ lender, score }) => {
                const isChecked = selected.has(lender.name);
                return (
                  <div
                    key={lender.id}
                    className={cn(
                      'group flex items-start gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors border border-transparent',
                      'hover:bg-muted/30 hover:border-white/10',
                      isChecked && 'bg-primary/5 border-primary/20',
                    )}
                    onClick={() => setConfirmingLender(lender)}
                  >
                    <div
                      className="pt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(lender.name);
                      }}
                    >
                      <Checkbox checked={isChecked} aria-label={`Select ${lender.name}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm truncate">{lender.name}</div>
                        <Badge
                          variant="outline"
                          className={cn('h-5 px-1.5 text-[10px] font-medium border', scoreColor(score))}
                        >
                          {Math.round(score)}% match
                        </Badge>
                        {lender.active === false && (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-white/10 text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {primaryFocus(lender)}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>{formatSize(lender.min_deal, lender.max_deal)}</span>
                        <span className="opacity-60">•</span>
                        <span>Last active {formatLastActive(lender)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {selected.size > 0 && (
            <div className="border-t border-white/10 bg-background/60 backdrop-blur-xl px-4 py-3 flex items-center gap-2">
              <div className="text-sm font-medium flex-1">
                {selected.size} lender{selected.size === 1 ? '' : 's'} selected — Add to deal
              </div>
              <Select value={bulkStage} onValueChange={setBulkStage}>
                <SelectTrigger className="h-8 w-[180px] text-xs bg-background/40 border-white/10">
                  <SelectValue placeholder="Starting stage" />
                </SelectTrigger>
                <SelectContent>
                  {configuredStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="liquid-glass"
                size="sm"
                className="gap-1.5"
                disabled={adding || !bulkStage}
                onClick={handleBulkAdd}
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm
              </Button>
            </div>
          )}
            </TabsContent>

            <TabsContent value="ai" className="flex-1 min-h-0 overflow-y-auto mt-0 data-[state=inactive]:hidden">
              <div className="p-3">
                <AiRecommendedLendersSection
                  dealId={dealId}
                  configuredStages={configuredStages}
                  defaultStageId={defaultStageId}
                  existingLenderNames={existingLenderNames}
                  onAddLender={onAddLender}
                  criteriaOverride={aiCriteriaOverride}
                />
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmingLender}
        onOpenChange={(o) => {
          if (!o) setConfirmingLender(null);
        }}
      >
        <AlertDialogContent className="z-[1200]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Add {confirmingLender?.name} to {dealName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose the starting stage for this lender on the deal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={singleStage} onValueChange={setSingleStage}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Starting stage" />
              </SelectTrigger>
              <SelectContent>
                {configuredStages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              asChild
              onClick={(e) => {
                e.preventDefault();
                handleSingleAdd();
              }}
            >
              <Button type="button" variant="liquid-glass" size="sm" className="gap-1.5" disabled={adding || !singleStage}>
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Confirm
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
