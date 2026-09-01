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
import { computeMatchScore, type DeterministicMatchResult } from '@/lib/lenderMatchScore';
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

function MatchExplanation({
  lender,
  score,
  match,
  ai,
  deterministic,
}: {
  lender: MasterLender;
  score: number;
  match?: LenderMatch;
  ai?: AiRecommendation;
  deterministic?: DeterministicMatchResult;
}) {
  const reasons = match?.matchReasons || [];
  const warnings = match?.warnings || [];
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">Why this match?</div>
        <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] border', scoreColor(score))}>
          {Math.round(score)}%
        </Badge>
      </div>

      {deterministic && (
        <div className="rounded-md border border-white/10 bg-background/40 p-2 space-y-1">
          <div className="text-[11px] font-medium text-muted-foreground">Score breakdown</div>
          <ul className="space-y-0.5">
            {deterministic.components.map((c) => (
              <li key={c.key} className="flex items-center justify-between text-[11px] gap-2">
                <span className="text-foreground/80 truncate">{c.label}</span>
                <span className={cn('tabular-nums shrink-0', c.available ? 'text-foreground/90' : 'text-muted-foreground italic')}>
                  {c.available ? `${c.earned}/${c.weight}` : 'n/a'}
                  <span className="ml-1 text-muted-foreground">· {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {deterministic.hardExcluded && (
            <div className="text-[10px] text-amber-300">Lender excludes this industry — score forced to 0.</div>
          )}
        </div>
      )}

      {ai && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" /> AI rationale
          </div>
          <div className="text-[11px] text-foreground/90 leading-snug">{ai.rationale}</div>
          {ai.components && (
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground pt-1">
              <div>Type fit: <span className="text-foreground/80">{ai.components.type}%</span></div>
              <div>Size fit: <span className="text-foreground/80">{ai.components.size}%</span></div>
              <div>Industry: <span className="text-foreground/80">{ai.components.industry}%</span></div>
              <div>Recency: <span className="text-foreground/80">{ai.components.recency}%</span></div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="text-[11px] font-medium text-muted-foreground mb-1">Fit factors</div>
        {reasons.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">No matching factors detected.</div>
        ) : (
          <ul className="space-y-0.5">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px]">
                <Check className="h-3 w-3 mt-0.5 text-emerald-400 shrink-0" />
                <span className="text-foreground/90">{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {warnings.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground mb-1">Mismatches</div>
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px]">
                <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-400 shrink-0" />
                <span className="text-foreground/90">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-1 border-t border-white/5 text-[10px] text-muted-foreground space-y-0.5">
        <div>Size range: {formatSize(lender.min_deal, lender.max_deal)}</div>
        {lender.industries && lender.industries.length > 0 && (
          <div className="truncate">Industries: {lender.industries.slice(0, 4).join(', ')}</div>
        )}
        {lender.loan_types && lender.loan_types.length > 0 && (
          <div className="truncate">Loan types: {lender.loan_types.slice(0, 4).join(', ')}</div>
        )}
      </div>
    </div>
  );
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
  const { matches, outcomeStats } = useLenderMatching(masterLenders, criteria, {
    minScore: 0,
    maxResults: 1000,
    excludeNames: existingLenderNames,
  });
  const outcomeStatsByLenderId = useMemo(
    () => new Map(outcomeStats.filter((stats) => stats.master_lender_id).map((stats) => [stats.master_lender_id as string, stats])),
    [outcomeStats],
  );

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
  const [sizeFilters, setSizeFilters] = useState<string[]>([]);
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
        if (sizeFilters.length === 0) return true;
        const lmin = l.min_deal ?? 0;
        const lmax = l.max_deal ?? Number.MAX_SAFE_INTEGER;
        // Overlap test against ANY selected bucket (OR logic)
        return sizeFilters.some((id) => {
          const r = SIZE_RANGES.find((s) => s.id === id);
          if (!r) return false;
          return lmax >= r.min && lmin <= r.max;
        });
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
        const det = computeMatchScore(l, criteria, outcomeStatsByLenderId.get(l.id));
        const ruleScore = matchByName.get(key) ?? 0;
        // Prefer deterministic score; let AI score win only if materially higher.
        const base = Math.max(det.score, ruleScore);
        const score = ai ? Math.max(base, ai.matchScore) : base;
        return { lender: l, score, ai, deterministic: det };
      })
      .sort((a, b) => b.score - a.score);
  }, [masterLenders, existingSet, statusFilter, dealTypeFilters, sizeFilters, search, matchByName, aiOnly, aiByName, criteria, outcomeStatsByLenderId]);

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
            <SheetTitle className="text-base font-semibold">Add Funding Source to {dealName}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pb-3 space-y-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search directory..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 bg-background/40 border-white/10"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAiOnly((v) => !v)}
                className={cn(
                  'h-7 px-2 text-xs rounded-md gap-1.5 border-white/10 bg-background/40 hover:bg-muted/40',
                  aiOnly && 'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Recommended
                {aiOnly && aiLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {aiOnly && !aiLoading && aiData && (
                  <span className="ml-0.5 opacity-80">({aiData.recommendations.length})</span>
                )}
              </Button>
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-[160px] justify-between text-xs bg-background/40 border-white/10 font-normal"
                  >
                    <span className="truncate">
                      {(() => {
                        if (sizeFilters.length === 0) return 'Any size';
                        const first = SIZE_RANGES.find((r) => r.id === sizeFilters[0])?.label ?? '';
                        if (sizeFilters.length === 1) return first;
                        return `${first} +${sizeFilters.length - 1} more`;
                      })()}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[200px] p-1">
                  <div role="listbox" aria-multiselectable="true" className="flex flex-col">
                    {SIZE_RANGES.map((r) => {
                      const checked = sizeFilters.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          role="option"
                          aria-selected={checked}
                          onClick={() =>
                            setSizeFilters((prev) =>
                              prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                            )
                          }
                          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Checkbox checked={checked} className="pointer-events-none" />
                          <span className="flex-1">{r.label}</span>
                        </button>
                      );
                    })}
                    {sizeFilters.length > 0 && (
                      <div className="mt-1 border-t border-border pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full h-7 text-xs"
                          onClick={() => setSizeFilters([])}
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
              {loading
                ? 'Loading directory…'
                : aiOnly && aiLoading
                  ? 'Loading AI recommendations…'
                  : `${filteredLenders.length} lender${filteredLenders.length === 1 ? '' : 's'}${aiOnly ? ' · AI recommended' : ''}`}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-3 py-2 space-y-1">
              {(loading || (aiOnly && aiLoading)) && filteredLenders.length === 0 && (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {aiOnly ? 'Loading AI recommendations…' : 'Loading directory…'}
                </div>
              )}
              {!loading && !(aiOnly && aiLoading) && filteredLenders.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {aiOnly ? 'No AI-recommended lenders match these filters.' : 'No funding sources match these filters.'}
                </div>
              )}
              {filteredLenders.map(({ lender, score, ai, deterministic }) => {
                const isChecked = selected.has(lender.name);
                const fullMatch = matchByNameFull.get(lender.name.toLowerCase());
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
                        <Popover>
                          <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-label="Why this match?"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="left"
                            align="start"
                            className="w-80 p-3 text-xs space-y-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MatchExplanation
                              lender={lender}
                              score={score}
                              match={fullMatch}
                              ai={ai}
                              deterministic={deterministic}
                            />
                          </PopoverContent>
                        </Popover>
                        {ai && (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] gap-1 border-primary/30 bg-primary/10 text-primary"
                          >
                            <Sparkles className="h-3 w-3" /> AI
                          </Badge>
                        )}
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
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!confirmingLender}
        onOpenChange={(o) => {
          if (!o) setConfirmingLender(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Add {confirmingLender?.name} to {dealName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose the starting stage for this funding source on the deal.
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
