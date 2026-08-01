import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CalendarClock, Loader2, Maximize2 } from 'lucide-react';
const LazySalesDashboardV2 = lazy(() =>
  import('@/components/metrics/dashboards/SalesDashboardV2').then((m) => ({ default: m.SalesDashboardV2 })),
);

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { isExcludedDealName } from '@/utils/excludedDeals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';

// Stage identifiers in the default (Active) pipeline. Some legacy rows have
// an empty `to_stage_id` — match by `to_stage` label as a fallback.
const DEBT_STAGES = {
  ndaNeedsList:   { ids: ['ndaneeds-list-sent', 'nda_needs_list_sent'], labels: ['NDA/Needs List Sent', 'ndaneeds-list-sent'] },
  finalCredit:    { ids: ['final-credit-items'],                        labels: ['Final Credit Items', 'final-credit-items'] },
  termsIssued:    { ids: ['terms-issued'],                              labels: ['Terms Issued', 'terms-issued'] },
  inDueDiligence: { ids: ['in-due-diligence'],                          labels: ['In Due Diligence', 'in-due-diligence'] },
  fundedInvoiced: { ids: ['funded-invoiced'],                           labels: ['Funded/Invoiced', 'Funded / Invoiced', 'funded-invoiced'] },
} as const;

// FinServ Pipeline stage identifiers.
const FINSERV_STAGES = {
  qualification: { ids: ['fs-qualification'], labels: ['Qualification', 'fs-qualification'] },
  proposalSent:  { ids: ['fs-proposal-sent'], labels: ['Proposal Sent', 'fs-proposal-sent'] },
  activeClient:  { ids: ['fs-closed-won'],    labels: ['Active Client', 'fs-closed-won'] },
} as const;

// naitive Pipeline stage identifiers.
const NAITIVE_STAGES = {
  demoAccess:  { ids: ['demo-access'],  labels: ['Demo Access', 'demo-access'] },
  pilotAgreed: { ids: ['pilot-agreed'], labels: ['Pilot Agreed', 'pilot-agreed'] },
  active:      { ids: ['active'],       labels: ['Active', 'active'] },
} as const;

type StageConfig = { ids: readonly string[]; labels: readonly string[] };

type StageKey =
  | 'nda' | 'signed' | 'termsIssued' | 'termsSigned' | 'funded'
  | 'fsQualification' | 'fsProposal' | 'fsActive'
  | 'naDemos' | 'naProposals' | 'naClients';

const STAGE_REGISTRY: Record<StageKey, { label: string; config: StageConfig }> = {
  nda:              { label: 'Deals | Dollars on the Board',      config: DEBT_STAGES.ndaNeedsList },
  signed:           { label: 'Deals Signed | Dollars Signed',     config: DEBT_STAGES.finalCredit },
  termsIssued:      { label: 'Terms Issued | $ Terms Issued',     config: DEBT_STAGES.termsIssued },
  termsSigned:      { label: 'Terms Signed | $ Terms Signed',     config: DEBT_STAGES.inDueDiligence },
  funded:           { label: 'Deals Closed | Dollars Funded',     config: DEBT_STAGES.fundedInvoiced },
  fsQualification:  { label: 'FinServ Deals | $ On the Board',    config: FINSERV_STAGES.qualification },
  fsProposal:       { label: 'Proposals Sent | Revenue Proposed', config: FINSERV_STAGES.proposalSent },
  fsActive:         { label: 'Clients Signed | Revenue Signed',   config: FINSERV_STAGES.activeClient },
  naDemos:          { label: 'Demos Created',                     config: NAITIVE_STAGES.demoAccess },
  naProposals:      { label: 'Proposals Issued',                  config: NAITIVE_STAGES.pilotAgreed },
  naClients:        { label: 'Clients Signed',                    config: NAITIVE_STAGES.active },
};

function formatCurrencyMM(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}MM`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Returns the [start, end] of a completed Mon–Sun week, offset back from
 * "last week" (weekOffset = 0). weekOffset = 1 → week before last, etc.
 */
function weekRange(weekOffset = 0, now = new Date()): { start: Date; end: Date } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMon = new Date(d);
  thisMon.setDate(d.getDate() - daysSinceMonday);
  const start = new Date(thisMon);
  start.setDate(thisMon.getDate() - 7 * (weekOffset + 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function lastMonSunRange(now = new Date()) {
  return weekRange(0, now);
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return curr > 0 ? Infinity : null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Stage-enter events whose *previous* stage is any of these are excluded —
 * they represent re-activation of a paused/dead deal, not a genuine new
 * entry onto the board. Match by normalized substring so slugs and labels
 * ("on-hold", "On Hold", "Deal/Diligence Paused/On Hold", "Client Paused
 * Deal", "Do Not Contact / Dead Deal", "dormant", "closed-lost", …) all hit.
 */
const REACTIVATION_FROM_KEYWORDS = [
  'hold',
  'paused',
  'dormant',
  'dead',
  'do not contact',
  'closed',
  'lost',
  'won',
  'churn',
  'unqualified',
  'not a fit',
  'archived',
];

function isReactivationFromStage(from: unknown): boolean {
  const s = String(from ?? '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return false;
  return REACTIVATION_FROM_KEYWORDS.some((k) => s.includes(k));
}

export function LastWeekSummaryWidget() {
  const { company } = useCompany();
  const companyId = company?.id;
  // Selected week offset. 0 = last completed week (default). Not persisted —
  // resets to last week on refresh by design.
  const [weekOffset, setWeekOffset] = useState(0);
  const range = useMemo(() => weekRange(weekOffset), [weekOffset]);
  const priorRange = useMemo(() => weekRange(weekOffset + 1), [weekOffset]);
  const [drilldown, setDrilldown] = useState<StageKey | null>(null);
  const [salesOpen, setSalesOpen] = useState(false);

  const fetchWindow = async (start: Date, end: Date, stage: StageConfig) => {
    const { data: rows, error } = await supabase
      .from('deal_stage_history')
      .select('deal_id, changed_at, to_stage_id, to_stage, from_stage, from_stage_id, deals!inner(company, value)')
      .eq('company_id', companyId!)
      .eq('event_type', 'stage_enter')
      .or(
        `to_stage_id.in.(${stage.ids.map((s) => `"${s}"`).join(',')}),to_stage.in.(${stage.labels.map((s) => `"${s}"`).join(',')})`,
      )
      .gte('changed_at', start.toISOString())
      .lte('changed_at', end.toISOString())
      .order('changed_at', { ascending: true });
    if (error) throw error;
    const seen = new Map<string, number>();
    for (const row of (rows ?? []) as any[]) {
      if (seen.has(row.deal_id)) continue;
      const deal = row.deals;
      if (!deal) continue;
      if (isExcludedDealName(deal.company)) continue;
      // Skip re-activations from on-hold / paused / dormant / dead / closed stages.
      if (
        isReactivationFromStage(row.from_stage) ||
        isReactivationFromStage(row.from_stage_id)
      ) continue;
      seen.set(row.deal_id, Number(deal.value) || 0);
    }
    return {
      count: seen.size,
      dollars: Array.from(seen.values()).reduce((s, v) => s + v, 0),
    };
  };

  const useStageWindow = (key: string, stage: StageConfig) =>
    useQuery({
      queryKey: ['last-week-stage', key, companyId, range.start.toISOString(), range.end.toISOString()],
      enabled: !!companyId,
      queryFn: async () => {
        const [curr, prev] = await Promise.all([
          fetchWindow(range.start, range.end, stage),
          fetchWindow(priorRange.start, priorRange.end, stage),
        ]);
        return { ...curr, prevCount: prev.count, prevDollars: prev.dollars };
      },
    });

  const nda        = useStageWindow('nda-needs-list', DEBT_STAGES.ndaNeedsList);
  const signed     = useStageWindow('final-credit-items', DEBT_STAGES.finalCredit);
  const termsIss   = useStageWindow('terms-issued', DEBT_STAGES.termsIssued);
  const termsSign  = useStageWindow('in-due-diligence', DEBT_STAGES.inDueDiligence);
  const funded     = useStageWindow('funded-invoiced', DEBT_STAGES.fundedInvoiced);

  const fsQualification = useStageWindow('fs-qualification', FINSERV_STAGES.qualification);
  const fsProposal      = useStageWindow('fs-proposal-sent', FINSERV_STAGES.proposalSent);
  const fsActive        = useStageWindow('fs-active-client', FINSERV_STAGES.activeClient);

  const naDemos     = useStageWindow('naitive-demo-access',  NAITIVE_STAGES.demoAccess);
  const naProposals = useStageWindow('naitive-pilot-agreed', NAITIVE_STAGES.pilotAgreed);
  const naClients   = useStageWindow('naitive-active',       NAITIVE_STAGES.active);

  const rangeLabel = `${range.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const weekTitle = weekOffset === 0 ? 'Last Week' : `${weekOffset + 1} Weeks Ago`;
  const MAX_WEEKS_BACK = 11;
  const canGoBack = weekOffset < MAX_WEEKS_BACK;
  const canGoForward = weekOffset > 0;

  return (
    <>
    <Card
      className={cn(
        'relative overflow-hidden h-full glass-module',
        'transition-all duration-200',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), transparent)' }}
      />
      <CardContent className="p-3 flex flex-col gap-1.5 h-full overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {weekTitle}
            </span>
          </div>
          <div className="inline-flex items-center gap-0.5 -mr-1.5">
            <button
              type="button"
              onClick={() => setSalesOpen(true)}
              aria-label="Open Sales Dashboard"
              title="Open Sales Dashboard"
              className={cn(
                'inline-flex items-center gap-1 h-5 px-1.5 mr-1 rounded transition-colors',
                'text-[10px] font-semibold uppercase tracking-wide',
                'text-muted-foreground/80 hover:text-foreground hover:bg-primary/10 border border-border/40',
              )}
            >
              <Maximize2 className="h-3 w-3" />
              Sales
            </button>
            <button
              type="button"
              onClick={() => canGoBack && setWeekOffset((w) => w + 1)}
              disabled={!canGoBack}
              aria-label="Previous week"
              className={cn(
                'inline-flex items-center justify-center h-5 w-5 rounded transition-colors',
                'text-muted-foreground/70 hover:text-foreground hover:bg-primary/5',
                'disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed',
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-mono text-muted-foreground/70 px-1 tabular-nums">
              {rangeLabel}
            </span>
            <button
              type="button"
              onClick={() => canGoForward && setWeekOffset((w) => w - 1)}
              disabled={!canGoForward}
              aria-label="Next week"
              className={cn(
                'inline-flex items-center justify-center h-5 w-5 rounded transition-colors',
                'text-muted-foreground/70 hover:text-foreground hover:bg-primary/5',
                'disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed',
              )}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <Group title="Debt Advisory">
          <StageRow stageKey="nda"          q={nda}       onOpen={setDrilldown} />
          <StageRow stageKey="signed"       q={signed}    onOpen={setDrilldown} />
          <StageRow stageKey="termsIssued"  q={termsIss}  onOpen={setDrilldown} />
          <StageRow stageKey="termsSigned"  q={termsSign} onOpen={setDrilldown} />
          <StageRow stageKey="funded"       q={funded}    onOpen={setDrilldown} />
        </Group>
        <Group title="FinServ">
          <StageRow stageKey="fsQualification" q={fsQualification} onOpen={setDrilldown} />
          <StageRow stageKey="fsProposal"      q={fsProposal}      onOpen={setDrilldown} />
          <StageRow stageKey="fsActive"        q={fsActive}        onOpen={setDrilldown} />
        </Group>
        <Group title="Naitive">
          <StageRow stageKey="naDemos"     q={naDemos}     onOpen={setDrilldown} />
          <StageRow stageKey="naProposals" q={naProposals} onOpen={setDrilldown} />
          <StageRow stageKey="naClients"   q={naClients}   onOpen={setDrilldown} />
        </Group>
      </CardContent>
    </Card>
    <DrilldownDialog
      stageKey={drilldown}
      companyId={companyId}
      onClose={() => setDrilldown(null)}
    />
    <Dialog open={salesOpen} onOpenChange={setSalesOpen}>
      <DialogContent className="sales-dashboard-popup max-w-[97vw] w-[97vw] h-[95vh] p-0 overflow-hidden flex flex-col border-white/10">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle>Sales Dashboard</DialogTitle>
          <DialogDescription className="sr-only">Full Sales Dashboard</DialogDescription>
        </DialogHeader>
        <div className="insights-glass-skin flex-1 min-h-0 overflow-auto px-4 pb-4">
          {salesOpen && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <LazySalesDashboardV2 />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/80 leading-tight">
        {title}
      </p>
      <div className="flex flex-col gap-0.5 pl-2 border-l border-primary/20">
        {children}
      </div>
    </div>
  );
}

function StageRow({
  stageKey,
  q,
  onOpen,
}: {
  stageKey: StageKey;
  q: { data?: { count: number; dollars: number; prevCount: number; prevDollars: number }; isLoading: boolean };
  onOpen: (k: StageKey) => void;
}) {
  const label = STAGE_REGISTRY[stageKey].label;
  return (
    <Row
      label={label}
      count={q.data?.count ?? 0}
      dollars={q.data?.dollars ?? 0}
      prevCount={q.data?.prevCount ?? 0}
      prevDollars={q.data?.prevDollars ?? 0}
      isLoading={q.isLoading}
      onClick={() => onOpen(stageKey)}
    />
  );
}

function Row({
  label,
  count,
  dollars,
  prevCount,
  prevDollars,
  isLoading,
  placeholder,
  onClick,
}: {
  label: string;
  count?: number;
  dollars?: number;
  prevCount?: number;
  prevDollars?: number;
  isLoading?: boolean;
  placeholder?: boolean;
  onClick?: () => void;
}) {
  const countChange = !placeholder ? pctChange(count ?? 0, prevCount ?? 0) : null;
  const dollarsChange = !placeholder ? pctChange(dollars ?? 0, prevDollars ?? 0) : null;
  const clickable = !!onClick && !placeholder;
  return (
    <div
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={cn(
        'grid items-center gap-x-1 gap-y-0 border-t border-border/30 pt-1.5 first:border-t-0 first:pt-0 rounded',
        'grid-cols-[minmax(0,1fr)_auto]',
        clickable && 'cursor-pointer hover:bg-primary/5 transition-colors',
      )}
    >
      <p className="text-[12px] uppercase tracking-wide text-white font-medium leading-tight truncate min-w-0">
        {label}
      </p>
      {placeholder ? (
        <div className="grid grid-cols-[3.25rem_0.5rem_3.75rem] gap-x-1 gap-y-0 items-center">
          <span className="text-[15px] font-extrabold font-mono tabular-nums text-muted-foreground/60 text-right">—</span>
          <span className="text-muted-foreground/50 font-light text-center">|</span>
          <span className="text-[15px] font-extrabold font-mono tabular-nums text-muted-foreground/60 text-right">—</span>
          <DeltaBadge pct={null} />
          <span className="text-muted-foreground/40 font-light text-center">|</span>
          <DeltaBadge pct={null} />
        </div>
      ) : isLoading ? (
        <div className="flex justify-end">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-[3.25rem_0.5rem_3.75rem] gap-x-1 gap-y-0 items-center">
          <span className="text-[15px] font-extrabold font-mono tabular-nums text-foreground text-right whitespace-nowrap leading-tight">
            {count}
          </span>
          <span className="text-muted-foreground/50 font-light text-center">|</span>
          <span className="text-[15px] font-extrabold font-mono tabular-nums text-foreground text-right whitespace-nowrap leading-tight">
            {formatCurrencyMM(dollars ?? 0)}
          </span>
          <DeltaBadge pct={countChange} />
          <span className="text-muted-foreground/40 font-light text-center leading-tight">|</span>
          <DeltaBadge pct={dollarsChange} />
        </div>
      )}
    </div>
  );
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="text-[11px] font-mono text-muted-foreground/40 w-full text-right">
        —
      </span>
    );
  }
  if (!isFinite(pct)) {
    return (
      <span className="text-[11px] font-mono font-semibold text-success w-full text-right">
        new
      </span>
    );
  }
  const positive = pct >= 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold w-full justify-end',
        positive ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

// -----------------------------------------------------------------------------
// Drilldown
// -----------------------------------------------------------------------------

const WEEKS_BACK = 8;

interface WeekBucket {
  weekStart: Date;
  weekEnd: Date;
  label: string; // e.g. "Nov 24"
  count: number;
  dollars: number;
  deals: { deal_id: string; company: string; value: number; entered_at: string }[];
}

function buildTrailingWeeks(now = new Date(), weeks = WEEKS_BACK): WeekBucket[] {
  // Most recent complete week is "last week" (Mon-Sun); go back N-1 more.
  const last = lastMonSunRange(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(last.start);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    buckets.push({
      weekStart: start,
      weekEnd: end,
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
      dollars: 0,
      deals: [],
    });
  }
  return buckets;
}

function DrilldownDialog({
  stageKey,
  companyId,
  onClose,
}: {
  stageKey: StageKey | null;
  companyId: string | undefined;
  onClose: () => void;
}) {
  const open = !!stageKey;
  const stage = stageKey ? STAGE_REGISTRY[stageKey] : null;

  const buckets = useMemo(() => buildTrailingWeeks(), []);
  const rangeStart = buckets[0]?.weekStart;
  const rangeEnd = buckets[buckets.length - 1]?.weekEnd;
  const [selectedIdx, setSelectedIdx] = useState<number>(buckets.length - 1);
  const [chartMode, setChartMode] = useState<'both' | 'count' | 'dollars'>('both');

  // Reset selection to the most-recent (last) week whenever the dialog opens
  // for a different metric.
  useEffect(() => {
    setSelectedIdx(buckets.length - 1);
  }, [stageKey, buckets.length]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'last-week-drilldown',
      stageKey,
      companyId,
      rangeStart?.toISOString(),
      rangeEnd?.toISOString(),
    ],
    enabled: open && !!companyId && !!stage,
    queryFn: async () => {
      const cfg = stage!.config;
      const { data: rows, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, to_stage_id, to_stage, from_stage, from_stage_id, deals!inner(company, value)')
        .eq('company_id', companyId!)
        .eq('event_type', 'stage_enter')
        .or(
          `to_stage_id.in.(${cfg.ids.map((s) => `"${s}"`).join(',')}),to_stage.in.(${cfg.labels.map((s) => `"${s}"`).join(',')})`,
        )
        .gte('changed_at', rangeStart!.toISOString())
        .lte('changed_at', rangeEnd!.toISOString())
        .order('changed_at', { ascending: true });
      if (error) throw error;

      // First stage_enter per deal within the full window (avoid double-counting).
      const seen = new Set<string>();
      const result = buckets.map((b) => ({ ...b, deals: [] as WeekBucket['deals'] }));
      for (const row of (rows ?? []) as any[]) {
        if (seen.has(row.deal_id)) continue;
        const deal = row.deals;
        if (!deal) continue;
        if (isExcludedDealName(deal.company)) continue;
        // Exclude re-activations from paused/dead/closed stages — mirrors the widget rule.
        if (
          isReactivationFromStage(row.from_stage) ||
          isReactivationFromStage(row.from_stage_id)
        ) continue;
        seen.add(row.deal_id);
        const t = new Date(row.changed_at).getTime();
        const idx = result.findIndex(
          (b) => t >= b.weekStart.getTime() && t <= b.weekEnd.getTime(),
        );
        if (idx < 0) continue;
        const val = Number(deal.value) || 0;
        result[idx].deals.push({
          deal_id: row.deal_id,
          company: deal.company ?? '—',
          value: val,
          entered_at: row.changed_at,
        });
        result[idx].count += 1;
        result[idx].dollars += val;
      }
      return result;
    },
  });

  const chartData = (data ?? buckets).map((b) => ({
    week: b.label,
    deals: b.count,
    dollarsMM: +(b.dollars / 1_000_000).toFixed(2),
  }));

  const source = data ?? buckets;
  const clampedIdx = Math.min(Math.max(selectedIdx, 0), source.length - 1);
  const selected = source[clampedIdx];
  const prior = clampedIdx > 0 ? source[clampedIdx - 1] : undefined;
  const countPct = selected && prior ? pctChange(selected.count, prior.count) : null;
  const dollarsPct = selected && prior ? pctChange(selected.dollars, prior.dollars) : null;
  const isLatestWeek = clampedIdx === source.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            {stage?.label ?? ''}
          </DialogTitle>
          <DialogDescription>
            Week-over-week stage entries · Trailing {WEEKS_BACK} weeks (Mon–Sun)
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Headline */}
            <div className="grid grid-cols-2 gap-3">
              <HeadlineTile
                label={`${isLatestWeek ? 'Last week' : 'Selected week'} (${selected?.label ?? '—'})`}
                primary={`${selected?.count ?? 0} deal${selected?.count === 1 ? '' : 's'}`}
                secondary={formatCurrencyMM(selected?.dollars ?? 0)}
                countPct={countPct}
                dollarsPct={dollarsPct}
              />
              <HeadlineTile
                label={`Prior week (${prior?.label ?? '—'})`}
                primary={`${prior?.count ?? 0} deal${prior?.count === 1 ? '' : 's'}`}
                secondary={formatCurrencyMM(prior?.dollars ?? 0)}
              />
            </div>

            {/* Chart */}
            <div className="flex items-center justify-end gap-1">
              <ChartModeButton active={chartMode === 'count'} onClick={() => setChartMode('count')}>
                # Deals
              </ChartModeButton>
              <ChartModeButton active={chartMode === 'dollars'} onClick={() => setChartMode('dollars')}>
                $ Value
              </ChartModeButton>
              <ChartModeButton active={chartMode === 'both'} onClick={() => setChartMode('both')}>
                Both
              </ChartModeButton>
            </div>
            <div className="h-56 rounded-lg border border-border/40 bg-card/40 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={({ x, y, payload, index }: any) => (
                      <text
                        x={x}
                        y={y + 12}
                        textAnchor="middle"
                        fontSize={10}
                        fill={index === clampedIdx ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                        fontWeight={index === clampedIdx ? 700 : 400}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedIdx(index)}
                      >
                        {payload.value}
                      </text>
                    )}
                  />
                  {chartMode !== 'dollars' && (
                    <YAxis yAxisId="left" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} allowDecimals={false} />
                  )}
                  {chartMode !== 'count' && (
                    <YAxis
                      yAxisId="right"
                      orientation={chartMode === 'dollars' ? 'left' : 'right'}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                      tickFormatter={(v: number) =>
                        v === 0 ? '$0' : v < 1 ? `$${(v * 1000).toFixed(0)}K` : `$${v}MM`
                      }
                    />
                  )}
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: any, name: string) =>
                      name === 'dollarsMM' ? [`$${value}MM`, 'Dollars'] : [value, 'Deals']
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {chartMode !== 'dollars' && (
                    <Bar
                      yAxisId="left"
                      dataKey="deals"
                      name="Deals"
                      radius={[4, 4, 0, 0]}
                      onClick={(_d: any, i: number) => setSelectedIdx(i)}
                      style={{ cursor: 'pointer' }}
                    >
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill="hsl(var(--primary))"
                          fillOpacity={i === clampedIdx ? 1 : 0.45}
                          stroke={i === clampedIdx ? 'hsl(var(--primary))' : 'transparent'}
                          strokeWidth={i === clampedIdx ? 1.5 : 0}
                        />
                      ))}
                    </Bar>
                  )}
                  {chartMode === 'dollars' && (
                    <Bar
                      yAxisId="right"
                      dataKey="dollarsMM"
                      name="Dollars ($MM)"
                      radius={[4, 4, 0, 0]}
                      onClick={(_d: any, i: number) => setSelectedIdx(i)}
                      style={{ cursor: 'pointer' }}
                    >
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill="hsl(var(--success))"
                          fillOpacity={i === clampedIdx ? 1 : 0.45}
                          stroke={i === clampedIdx ? 'hsl(var(--success))' : 'transparent'}
                          strokeWidth={i === clampedIdx ? 1.5 : 0}
                        />
                      ))}
                    </Bar>
                  )}
                  {chartMode === 'both' && (
                    <Line yAxisId="right" dataKey="dollarsMM" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} name="Dollars ($MM)" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground text-center -mt-2">
              Click a week to inspect it.
            </p>

            {/* Deal list — selected week */}
            <div className="flex flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Deals — {isLatestWeek ? 'last week' : 'selected week'}
                </p>
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  {selected?.label} → {selected?.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="overflow-y-auto max-h-56 rounded-md border border-border/40">
                {selected && selected.deals.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card/95 backdrop-blur">
                      <tr className="text-left text-muted-foreground border-b border-border/40">
                        <th className="px-3 py-2 font-medium">Deal</th>
                        <th className="px-3 py-2 font-medium text-right">Value</th>
                        <th className="px-3 py-2 font-medium text-right">Entered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.deals.map((d) => (
                        <tr key={d.deal_id} className="border-b border-border/20 last:border-b-0">
                          <td className="px-3 py-2 truncate max-w-[280px]">{d.company}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatCurrencyMM(d.value)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {new Date(d.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No deals entered this stage during this week.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HeadlineTile({
  label,
  primary,
  secondary,
  countPct,
  dollarsPct,
}: {
  label: string;
  primary: string;
  secondary: string;
  countPct?: number | null;
  dollarsPct?: number | null;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-3 flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold font-mono tabular-nums text-foreground">{primary}</span>
        {countPct !== undefined && <DeltaBadge pct={countPct ?? null} />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold font-mono tabular-nums text-muted-foreground">{secondary}</span>
        {dollarsPct !== undefined && <DeltaBadge pct={dollarsPct ?? null} />}
      </div>
    </div>
  );
}

function ChartModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border transition-colors',
        active
          ? 'bg-primary/15 border-primary/40 text-primary'
          : 'bg-transparent border-border/40 text-muted-foreground hover:bg-primary/5 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}