import { useMemo, useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Plus, X, Sparkles, RotateCcw, Info } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
    return recs.filter(
      (r) =>
        !skippedNames.has(r.lenderName.toLowerCase()) &&
        !existingLowercase.has(r.lenderName.toLowerCase()),
    );
  }, [data, skippedNames, existingLowercase]);

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