import { useMemo, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Plus, X, Sparkles, RotateCcw, Info, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAiRecommendedLenders, type AiRecommendation, type AiRecommenderCriteriaOverride } from '@/hooks/useAiRecommendedLenders';
import { useDealMatchingCriteria } from '@/hooks/useDealMatchingCriteria';

interface Props {
  dealId: string | undefined;
  configuredStages: { id: string; label: string; group: string }[];
  defaultStageId: string;
  existingLenderNames: string[];
  onAddLender: (lenderName: string, stageId: string) => Promise<void> | void;
  criteriaOverride?: AiRecommenderCriteriaOverride;
}

function scoreColor(score: number) {
  if (score >= 85) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (score >= 70) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const COLLAPSE_KEY = (dealId: string) => `ai-rec-lenders-collapsed:${dealId}`;
const FILTERS_KEY = (dealId: string) => `ai-rec-lenders-filters:${dealId}`;

interface RecFilters {
  loanType: string; // 'any' or specific
  industry: string; // 'any' or substring match
  status: 'any' | 'active';
  minMatch: number; // 0-100
  recency: 'any' | '30' | '90' | '180'; // days
  sizeMinM: string; // millions, string for input
  sizeMaxM: string; // millions
}

const DEFAULT_FILTERS: RecFilters = {
  loanType: 'any',
  industry: '',
  status: 'any',
  minMatch: 0,
  recency: 'any',
  sizeMinM: '',
  sizeMaxM: '',
};

export function AiRecommendedLendersSection({
  dealId,
  configuredStages,
  defaultStageId,
  existingLenderNames,
  onAddLender,
  criteriaOverride,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (!dealId) return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY(dealId)) === '1';
    } catch {
      return false;
    }
  });

  const [filters, setFilters] = useState<RecFilters>(() => {
    if (!dealId) return DEFAULT_FILTERS;
    try {
      const raw = localStorage.getItem(FILTERS_KEY(dealId));
      if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
    } catch {/* noop */}
    return DEFAULT_FILTERS;
  });

  useEffect(() => {
    if (!dealId) return;
    try {
      localStorage.setItem(FILTERS_KEY(dealId), JSON.stringify(filters));
    } catch {/* noop */}
  }, [filters, dealId]);

  useEffect(() => {
    if (!dealId) return;
    try {
      localStorage.setItem(COLLAPSE_KEY(dealId), collapsed ? '1' : '0');
    } catch {
      /* noop */
    }
  }, [collapsed, dealId]);

  // Watch saved matching criteria so the AI list refreshes when the Refine Criteria
  // survey saves new values (industry / cash-burn / sponsorship live in deal_writeups,
  // which the recommend-lenders edge function already reads).
  const { criteria: savedCriteria } = useDealMatchingCriteria(dealId);

  const criteriaSignature = useMemo(
    () => JSON.stringify({
      saved: savedCriteria,
      override: criteriaOverride ?? null,
    }),
    [savedCriteria, criteriaOverride],
  );

  const { data, loading, error, refresh, skip, markAdded, resetExclusions, skippedNames, addedNames } =
    useAiRecommendedLenders(dealId, /* autoRun */ true, {
      criteriaSignature,
      criteriaOverride,
    });

  // Allow external triggers (e.g. the Deal Data Updated banner) to refresh.
  useEffect(() => {
    if (!dealId) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.dealId === dealId) refresh();
    };
    window.addEventListener('ai-lenders-refresh', handler as EventListener);
    return () => window.removeEventListener('ai-lenders-refresh', handler as EventListener);
  }, [dealId, refresh]);

  const existingLowercase = useMemo(
    () => new Set(existingLenderNames.map((n) => n.trim().toLowerCase())),
    [existingLenderNames],
  );

  const visibleRecs = useMemo(() => {
    const recs = data?.recommendations ?? [];
    const sizeMin = filters.sizeMinM ? Number(filters.sizeMinM) * 1_000_000 : null;
    const sizeMax = filters.sizeMaxM ? Number(filters.sizeMaxM) * 1_000_000 : null;
    const loanLc = filters.loanType.toLowerCase();
    const industryLc = filters.industry.trim().toLowerCase();
    return recs.filter((r) => {
      if (skippedNames.has(r.lenderName.toLowerCase())) return false;
      if (existingLowercase.has(r.lenderName.toLowerCase())) return false;
      if (r.matchScore < filters.minMatch) return false;
      if (filters.status === 'active' && r.active === false) return false;
      if (filters.recency !== 'any' && !r.recentActivity) {
        // recentActivity is computed in backend over last 90d; for tighter windows
        // we conservatively require recentActivity to be true. 180d treats as any-recent.
        if (filters.recency === '30' || filters.recency === '90' || filters.recency === '180') return false;
      }
      if (loanLc !== 'any' && loanLc) {
        const lts = (r.loanTypes ?? []).map((s) => String(s).toLowerCase());
        if (!lts.some((t) => t.includes(loanLc))) return false;
      }
      if (industryLc) {
        const inds = (r.industries ?? []).map((s) => String(s).toLowerCase());
        if (!inds.some((t) => t.includes(industryLc))) return false;
      }
      // Deal-size band overlap: lender's [minDeal,maxDeal] must overlap [sizeMin,sizeMax]
      if (sizeMin != null || sizeMax != null) {
        const lMin = r.minDeal ?? 0;
        const lMax = r.maxDeal ?? Number.POSITIVE_INFINITY;
        if (sizeMin != null && lMax < sizeMin) return false;
        if (sizeMax != null && lMin > sizeMax) return false;
      }
      return true;
    });
  }, [data, skippedNames, existingLowercase, filters]);

  const loanTypeOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.recommendations ?? []).forEach((r) => (r.loanTypes ?? []).forEach((t) => t && set.add(String(t))));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtersActive =
    filters.loanType !== 'any' ||
    !!filters.industry ||
    filters.status !== 'any' ||
    filters.minMatch > 0 ||
    filters.recency !== 'any' ||
    !!filters.sizeMinM ||
    !!filters.sizeMaxM;

  const preferredDefault = useMemo(() => {
    const byLabel = configuredStages.find((s) =>
      /nda|needs list/i.test(s.label),
    );
    return byLabel?.id || defaultStageId || configuredStages[0]?.id || 'on-deck';
  }, [configuredStages, defaultStageId]);

  const sufficiency = data?.sufficiency;
  const insufficient = sufficiency && !sufficiency.ok;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background/40 to-background/20 backdrop-blur-sm">
      <CardHeader className="pb-3 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 text-left hover:opacity-80"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-foreground">
              AI Recommended
            </span>
            {!loading && data && (
              <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                {visibleRecs.length}
              </Badge>
            )}
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <TooltipProvider>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Filters
                    {filtersActive && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">on</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Filter recommendations</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                      disabled={!filtersActive}
                    >
                      Reset
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Loan type</Label>
                    <Select
                      value={filters.loanType}
                      onValueChange={(v) => setFilters((f) => ({ ...f, loanType: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any" className="text-xs">Any</SelectItem>
                        {loanTypeOptions.map((t) => (
                          <SelectItem key={t} value={t.toLowerCase()} className="text-xs">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Deal size (USD millions)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Min"
                        className="h-8 text-xs"
                        value={filters.sizeMinM}
                        onChange={(e) => setFilters((f) => ({ ...f, sizeMinM: e.target.value }))}
                      />
                      <span className="text-muted-foreground text-xs">–</span>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Max"
                        className="h-8 text-xs"
                        value={filters.sizeMaxM}
                        onChange={(e) => setFilters((f) => ({ ...f, sizeMaxM: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Industry</Label>
                    <Input
                      placeholder="e.g. SaaS, Healthcare"
                      className="h-8 text-xs"
                      value={filters.industry}
                      onChange={(e) => setFilters((f) => ({ ...f, industry: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Status</Label>
                      <Select
                        value={filters.status}
                        onValueChange={(v: 'any' | 'active') => setFilters((f) => ({ ...f, status: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any" className="text-xs">Any</SelectItem>
                          <SelectItem value="active" className="text-xs">Active</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">Recent activity</Label>
                      <Select
                        value={filters.recency}
                        onValueChange={(v: RecFilters['recency']) => setFilters((f) => ({ ...f, recency: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any" className="text-xs">Any time</SelectItem>
                          <SelectItem value="30" className="text-xs">Last 30 days</SelectItem>
                          <SelectItem value="90" className="text-xs">Last 90 days</SelectItem>
                          <SelectItem value="180" className="text-xs">Last 180 days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px]">Minimum match score</Label>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{filters.minMatch}%</span>
                    </div>
                    <Slider
                      value={[filters.minMatch]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([v]) => setFilters((f) => ({ ...f, minMatch: v }))}
                    />
                  </div>
                </PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={resetExclusions}
                    disabled={loading}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset exclusions</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={refresh}
                    disabled={loading}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh recommendations</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0 pb-4">
          {loading && !data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <span className="text-destructive">{error}</span>
              <Button variant="outline" size="sm" onClick={refresh}>
                Retry
              </Button>
            </div>
          ) : insufficient ? (
            <div className="flex items-start gap-2 rounded-md border border-border/40 bg-background/30 p-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-foreground mb-0.5">Add more deal context to enable AI matching</div>
                <div>Missing: {sufficiency.missing.join(', ')}.</div>
              </div>
            </div>
          ) : visibleRecs.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No new recommendations. {skippedNames.size > 0 && 'Use Reset exclusions to see skipped lenders again.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleRecs.map((rec) => (
                <RecommendationRow
                  key={`${rec.lenderId ?? rec.lenderName}`}
                  rec={rec}
                  configuredStages={configuredStages}
                  defaultStageId={preferredDefault}
                  added={addedNames.has(rec.lenderName.toLowerCase())}
                  onAdd={async (stageId) => {
                    try {
                      await onAddLender(rec.lenderName, stageId);
                      markAdded(rec.lenderName);
                    } catch (e) {
                      toast.error('Failed to add lender');
                    }
                  }}
                  onSkip={() => skip(rec)}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function RecommendationRow({
  rec,
  configuredStages,
  defaultStageId,
  added,
  onAdd,
  onSkip,
}: {
  rec: AiRecommendation;
  configuredStages: { id: string; label: string; group: string }[];
  defaultStageId: string;
  added: boolean;
  onAdd: (stageId: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState(defaultStageId);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 backdrop-blur-sm p-2.5 hover:bg-background/60 transition-colors">
      <div className="h-9 w-9 shrink-0 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
        {initials(rec.lenderName) || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{rec.lenderName}</span>
          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium border', scoreColor(rec.matchScore))}>
            {rec.matchScore}% match
          </Badge>
          {typeof rec.confidence === 'number' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal border-border/60 text-muted-foreground">
                    {rec.confidence}% conf
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Confidence reflects how many deal &amp; lender dimensions had real signal (industry, size, geo, structure, notes, recent activity, AI review).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {rec.tier && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              {rec.tier}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">{rec.rationale}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {added ? (
          <Badge variant="secondary" className="text-[11px] gap-1">✓ Added</Badge>
        ) : (
          <>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="default" className="h-7 px-2 gap-1 text-xs">
                  <Plus className="h-3 w-3" />
                  Add to Deal
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3 space-y-2">
                <div className="text-xs font-medium">Add at stage</div>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {configuredStages.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onAdd(stageId);
                      setBusy(false);
                      setOpen(false);
                    }}
                  >
                    Add
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onSkip}
            >
              <X className="h-3 w-3" />
              Skip
            </Button>
          </>
        )}
      </div>
    </div>
  );
}