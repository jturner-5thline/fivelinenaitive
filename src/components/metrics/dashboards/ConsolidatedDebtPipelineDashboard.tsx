import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isActiveDeal } from '@/lib/deals';
import { Card, CardContent } from '@/components/ui/card';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Loader2, Users, DollarSign, FileCheck, FileSignature, FileText, ClipboardCheck,
  Coins, ScrollText, Handshake, Banknote, Briefcase, Sigma, LayoutGrid, Table as TableIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, Legend,
  ComposedChart, Line, LineChart,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';
import {
  useConsolidatedDebtPipelineMetrics,
  type StageTrendBucket,
  type StageSplitTrendBucket,
  type StageEntryDeal,
} from '@/hooks/usePipelineStageMetrics';
import { useTotalRevenueOpportunity } from '@/hooks/usePipelineStageMetrics';
import { useTermsConversionRate } from '@/hooks/useTermsConversionRate';
import { cn } from '@/lib/utils';
import { consumePendingReopen } from '@/lib/dealOriginContext';
import { NaitiveDealOverlay } from '@/components/naitive-pipeline/NaitiveDealOverlay';
import type { Deal } from '@/types/deal';
import { DashboardPlansGear } from './plans/DashboardPlansGear';
import { useDebtAdvisoryComparisonMode } from '@/hooks/useDebtAdvisoryComparisonMode';
import {
  ComparisonModeContext,
  useComparisonMode,
  type ComparisonMode,
} from './qir/ComparisonModeContext';
import {
  DEBT_ADVISORY_KPI_TO_PLAN,
  useDebtAdvisoryPlanValues,
  useDebtAdvisoryPlanForBuckets,
} from './qir/useDebtAdvisoryPlanValues';

// ------------------------------------------------------------------
// Deal drilldown open context — lets any nested drilldown table row
// open the deal overlay without prop-drilling a callback everywhere.
// ------------------------------------------------------------------
const OpenDealContext = createContext<((dealId: string) => void) | null>(null);
function useOpenDeal(): ((dealId: string) => void) | null {
  return useContext(OpenDealContext);
}
function DealLink({ dealId, children, className }: { dealId: string; children: React.ReactNode; className?: string }) {
  const open = useOpenDeal();
  if (!open) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); open(dealId); }}
      className={cn(
        'text-left underline decoration-dotted underline-offset-2 decoration-muted-foreground/40 hover:decoration-primary hover:text-primary transition-colors',
        className,
      )}
      title="Open deal"
    >
      {children}
    </button>
  );
}
import { PnlFourChartsSection } from '@/components/metrics/finserv-charts/PnlFourChartsSection';
import { QuarterlyConversionFunnelChart, type QuarterlyStepConversionOverrides } from '@/components/metrics/charts/QuarterlyConversionFunnelChart';
import { useQuarterlyTtmFunnel } from '@/hooks/useQuarterlyTtmFunnel';
import { useDealPeopleIndex, computeAllowedDealIds } from '@/hooks/useDealPeopleFilter';
import { filterDebtMetricsByPeople } from '@/lib/metrics/filterDebtMetricsByPeople';
import { FilterMultiSelect } from '@/components/cashflow/FilterMultiSelect';
import { useStageTransitMetrics } from '@/hooks/useStageTransitMetrics';
import {
  VelocityDrilldownDialog,
  anchorEndOfLastCompletedQuarter,
  pastFourQuarterLabels,
} from '@/components/metrics/dashboards/PipelineVelocitySection';
import { DEBT_ADVISORY_REALM_ID } from '@/hooks/useFinServFinancialMetrics';
import { InsightsDrilldownDrawer, type DrilldownContext } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { PipelineVelocitySection } from './PipelineVelocitySection';
import { RevenuePerHourDrilldownDialog } from './RevenuePerHourDrilldownDialog';

/**
 * Debt Advisory Metrics Board currency display.
 * Always renders as abbreviated millions with one decimal, e.g. $2.0MM, $0.8MM.
 * Used for KPI tiles, drilldown table cells, totals, and chart tooltips so every
 * surface on this board reconciles.
 */
const formatCurrency = (value: number) => {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}$${(Math.abs(n) / 1_000_000).toFixed(1)}MM`;
};

const formatCurrencyFull = formatCurrency;

/**
 * Currency formatter that keeps small values readable — renders as $K when the
 * absolute value is under $1MM (e.g. $100.0K), otherwise falls back to the
 * board-wide $MM format (e.g. $2.0MM). Used on the average-revenue-per-deal
 * tiles where sub-million values would otherwise collapse to $0.1MM.
 */
const formatCurrencyKOrMM = (value: number) => {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs < 1_000_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${(abs / 1_000_000).toFixed(1)}MM`;
};

/**
 * Stage-slug → display-label map for this board. Centralized so KPI tiles,
 * drilldown tables, and tooltips never show a malformed title-cased slug
 * (e.g. "Ndaneeds List Sent").
 */
const STAGE_LABEL_OVERRIDES: Record<string, string> = {
  'ndaneeds-list-sent': 'NDA/Needs List Sent',
  'nda-needs-list-sent': 'NDA/Needs List Sent',
  'nda_needs_list_sent': 'NDA/Needs List Sent',
};

const formatStageLabel = (slug: string | null | undefined): string => {
  if (!slug) return '—';
  const key = String(slug).toLowerCase().trim();
  if (STAGE_LABEL_OVERRIDES[key]) return STAGE_LABEL_OVERRIDES[key];
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

interface MetricCardConfig {
  id: string;
  title: string;
  icon: typeof Users;
  value: string | number;
  isLoading: boolean;
  deals: StageEntryDeal[];
  color: string;
  drilldownTitle: string;
  drilldownPeriodNote?: string;
  /** How the drilldown bar chart should aggregate `deals`. */
  drilldownMetricType?: 'count' | 'dollars' | 'average' | 'none';
  /** Formatter applied to each bar value (and chart total). Defaults inferred from metric type. */
  drilldownValueFormatter?: (value: number) => string;
  /** Bar/total color override. Defaults to card color. */
  drilldownChartColor?: string;
  /** If true, drilldown renders a stacked bar chart per deal showing
   *  retainer / milestone / closing fee segments (uses fee_breakdown fields
   *  on the StageEntryDeal rows). */
  drilldownStackedFees?: boolean;
  /** Optional numerator/denominator breakdown for conversion-rate widgets. */
  conversionBreakdown?: ConversionBreakdown;
  /** Short label for the denominator stage that anchors this card's
   *  passthrough filter (e.g. "Submitted to Lenders"). */
  signedAnchorLabel?: string;
  /** Period-over-period conversion change (latest completed quarter vs prior). */
  changePct?: {
    /** Percentage-point delta, negative = worsened, positive = improved. */
    delta: number;
    /** Latest quarter conversion pct (0-100). */
    latestPct: number;
    /** Previous quarter conversion pct (0-100). */
    prevPct: number;
    latestLabel: string;
    prevLabel: string;
  };
  /** Optional secondary value displayed beneath the primary value
   *  (e.g. a dollar total under a deal count). Clicking it opens its own
   *  drilldown so users can inspect the count and dollar views separately. */
  secondary?: {
    label?: string;
    value: string | number;
    isLoading: boolean;
    deals: StageEntryDeal[];
    color?: string;
    drilldownTitle: string;
    drilldownPeriodNote?: string;
    drilldownMetricType?: 'count' | 'dollars' | 'average' | 'none';
    drilldownValueFormatter?: (value: number) => string;
    drilldownChartColor?: string;
    /** Same as `delta` on the primary but rendered under the secondary value. */
    delta?: {
      diff: number;
      formatDiff: (value: number) => string;
      pct: number | null;
      priorLabel?: string;
      /** Raw current-period value (used by "Performance to Plan" mode). */
      currentValue?: number;
    };
  };
  /** Period-over-period delta shown below the primary value ($ change and %
   *  change vs the equal-length prior window). */
  delta?: {
    /** Signed absolute change in the metric's native units. */
    diff: number;
    /** Formatter used to render the signed diff (e.g. $12.3K). */
    formatDiff: (value: number) => string;
    /** Signed percentage change vs prior (e.g. -12.5). Null → prior was 0. */
    pct: number | null;
    /** Short prior-period label used for the hover tooltip. */
    priorLabel?: string;
    /** Raw current-period value (used by "Performance to Plan" mode). */
    currentValue?: number;
  };
}

interface ConversionBreakdown {
  formula: string;
  numeratorLabel: string;
  denominatorLabel: string;
  numeratorDeals: StageEntryDeal[];
  denominatorDeals: StageEntryDeal[];
  numeratorCount: number;
  denominatorCount: number;
  percentText: string;
}

function MetricKPICard({
  config,
  onClick,
  onSecondaryClick,
}: {
  config: MetricCardConfig;
  onClick: () => void;
  onSecondaryClick?: () => void;
}) {
  const { mode, planValues, periodLabel, isPlanLoading } = useComparisonMode();
  const planMap = DEBT_ADVISORY_KPI_TO_PLAN[config.id];
  const primaryPlanKey = planMap?.primary;
  const secondaryPlanKey = planMap?.secondary;

  const buildPlanChipProps = (
    planKey: string | undefined,
    currentValue: number | undefined,
    formatDiff: (v: number) => string,
  ) => {
    if (!planKey) return { missing: true as const, reason: 'unmapped' };
    if (currentValue == null) return { missing: true as const, reason: 'loading' };
    const planValue = planValues.get(planKey);
    if (planValue == null) return { missing: true as const, reason: 'no-plan' };
    const diff = currentValue - planValue;
    const pct = planValue !== 0 ? (diff / Math.abs(planValue)) * 100 : null;
    return {
      missing: false as const,
      diff,
      formatDiff,
      pct,
      planValue,
      priorLabel: `Plan · ${periodLabel}`,
    };
  };

  const renderPlanChip = (
    chip: ReturnType<typeof buildPlanChipProps>,
    size: 'primary' | 'secondary' = 'primary',
  ) => {
    const textSize = size === 'primary' ? 'text-[13px]' : 'text-[13px]';
    if (chip.missing) {
      if (isPlanLoading) {
        return (
          <span className={cn('text-muted-foreground/60 font-mono tabular-nums', textSize)}>
            …
          </span>
        );
      }
      // Blank Master Plan cell → render nothing (no "No plan" chip).
      return null;
    }
    const { diff, formatDiff, pct, priorLabel } = chip;
    const neutral = diff === 0;
    const improved = diff > 0;
    const arrow = neutral ? '–' : improved ? '▲' : '▼';
    const toneClass = neutral
      ? 'text-muted-foreground'
      : improved
        ? 'text-emerald-400'
        : 'text-rose-400';
    const sign = neutral ? '' : improved ? '+' : '−';
    const signedDiff = `${sign}${formatDiff(Math.abs(diff))}`;
    const pctText = pct == null ? '—' : `${sign}${Math.abs(pct).toFixed(1)}%`;
    return (
      <span
        className={cn('inline-flex items-baseline gap-1 font-mono tabular-nums', textSize, toneClass)}
        title={`vs ${priorLabel}`}
      >
        <span>{arrow}</span>
        <span className="font-semibold">{signedDiff}</span>
        <span className="opacity-80">({pctText})</span>
      </span>
    );
  };

  return (
    <Card
      className={cn(
        'relative group overflow-hidden transition-all duration-200',
        'glass-module',
        'hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${config.color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-2 py-4 px-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate">{config.title}</p>
          <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
            {config.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={onClick}
                className="drilldown-value text-xl font-bold font-mono tabular-nums text-foreground"
              >
                {config.value}
              </button>
            )}
            {!config.isLoading && mode === 'variance' && config.changePct && (() => {
              const { delta, prevPct, latestLabel, prevLabel } = config.changePct;
              const relPct = prevPct > 0 ? (delta / prevPct) * 100 : null;
              if (relPct == null || !Number.isFinite(relPct)) return null;
              const neutral = Math.abs(relPct) < 0.05;
              const improved = relPct > 0; // higher conversion pct = better
              return neutral ? (
                <span
                  className="text-[15px] text-muted-foreground font-mono tabular-nums"
                  title={`${latestLabel} vs ${prevLabel}`}
                >
                  No change
                </span>
              ) : (
                <span
                  className={cn(
                    'text-[15px] font-medium font-mono tabular-nums',
                    improved ? 'text-emerald-400' : 'text-rose-400',
                  )}
                  title={`${latestLabel} vs ${prevLabel}`}
                >
                  {improved ? '▲' : '▼'} {improved ? '+' : '−'}{Math.abs(relPct).toFixed(1)}%
                </span>
              );
            })()}
            {!config.isLoading && mode === 'variance' && config.delta && (() => {
              const { diff, formatDiff, pct, priorLabel } = config.delta;
              const neutral = diff === 0;
              const improved = diff > 0;
              const arrow = neutral ? '–' : improved ? '▲' : '▼';
              const toneClass = neutral
                ? 'text-muted-foreground'
                : improved
                  ? 'text-emerald-400'
                  : 'text-rose-400';
              const sign = neutral ? '' : improved ? '+' : '−';
              const signedDiff = `${sign}${formatDiff(Math.abs(diff))}`;
              const pctText = pct == null
                ? '—'
                : `${sign}${Math.abs(pct).toFixed(1)}%`;
              return (
                <span
                  className={cn('inline-flex items-baseline gap-1 text-[13px] font-mono tabular-nums', toneClass)}
                  title={priorLabel ? `vs ${priorLabel}` : 'vs prior period'}
                >
                  <span>{arrow}</span>
                  <span className="font-semibold">{signedDiff}</span>
                  <span className="opacity-80">({pctText})</span>
                </span>
              );
            })()}
            {!config.isLoading && mode === 'plan' && renderPlanChip(
              buildPlanChipProps(
                primaryPlanKey,
                config.delta?.currentValue,
                config.delta?.formatDiff ?? ((v: number) => `${Math.round(v)}`),
              ),
              'primary',
            )}
          </div>
          {config.secondary && (
            <div className="mt-1 pt-1 border-t border-border/40">
              <div className="flex items-baseline gap-2 flex-wrap">
              {config.secondary.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  onClick={onSecondaryClick}
                  className="drilldown-value text-[1.3125rem] leading-tight font-semibold font-mono tabular-nums text-foreground hover:text-foreground transition-colors"
                >
                  {config.secondary.value}
                </button>
              )}
              {!config.secondary.isLoading && mode === 'variance' && config.secondary.delta && (() => {
                const { diff, formatDiff, pct, priorLabel } = config.secondary.delta;
                const neutral = diff === 0;
                const improved = diff > 0;
                const arrow = neutral ? '–' : improved ? '▲' : '▼';
                const toneClass = neutral
                  ? 'text-muted-foreground'
                  : improved ? 'text-emerald-400' : 'text-rose-400';
                const sign = neutral ? '' : improved ? '+' : '−';
                const signedDiff = `${sign}${formatDiff(Math.abs(diff))}`;
                const pctText = pct == null ? '—' : `${sign}${Math.abs(pct).toFixed(1)}%`;
                return (
                  <span
                    className={cn('inline-flex items-baseline gap-1 text-[13px] font-mono tabular-nums', toneClass)}
                    title={priorLabel ? `vs ${priorLabel}` : 'vs prior period'}
                  >
                    <span>{arrow}</span>
                    <span className="font-semibold">{signedDiff}</span>
                    <span className="opacity-80">({pctText})</span>
                  </span>
                );
              })()}
              {!config.secondary.isLoading && mode === 'plan' && renderPlanChip(
                buildPlanChipProps(
                  secondaryPlanKey,
                  config.secondary.delta?.currentValue,
                  config.secondary.delta?.formatDiff ?? ((v: number) => `${Math.round(v)}`),
                ),
                'secondary',
              )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact "average time between two stage entries" tile — matches
 * MetricKPICard visually. Uses trailing-12-month stage transit data on the
 * Active Pipeline (deals that entered `from` in the window and later
 * reached `to`; average difference in days).
 */
const AVG_TIME_STAGE_VARIANTS = {
  finalCreditItems: ['final-credit-items', 'Final Credit Items'],
  lendersInReview: ['lenders-in-review', 'Lenders in Review'],
  termsIssued: ['terms-issued', 'Terms Issued'],
  inDueDiligence: ['in-due-diligence', 'In Due Diligence'],
  fundedInvoiced: ['funded-invoiced', 'Funded/Invoiced', 'Funded / Invoiced', 'Closed & Funded'],
};

function AvgTimeTile({
  title,
  color,
  fromVariants,
  toVariants,
}: {
  title: string;
  color: string;
  fromVariants: string[];
  toVariants: string[];
}) {
  const { buckets, isLoading } = useStageTransitMetrics({
    fromVariants,
    toVariants,
    windowMonths: 12,
    logInverted: false,
  });
  const closed = buckets.filter(b => !b.isOpen && b.dealCount > 0);
  const totalDeals = closed.reduce((s, b) => s + b.dealCount, 0);
  const avgMonths = totalDeals > 0
    ? closed.reduce((s, b) => s + b.avgMonths * b.dealCount, 0) / totalDeals
    : 0;
  const DAYS_PER_MONTH = 30.4375;
  const avgDays = avgMonths * DAYS_PER_MONTH;
  const display = totalDeals > 0 && avgDays > 0 ? `${Math.round(avgDays)}d` : '—';

  // Period-over-period: latest completed quarter vs the one before.
  const anchor = anchorEndOfLastCompletedQuarter(new Date());
  const axis = pastFourQuarterLabels(anchor); // oldest → newest
  const agg = new Map<string, { sumMonths: number; deals: number }>();
  for (const b of buckets) {
    if (b.isOpen) continue;
    const d = new Date(b.monthStart);
    const key = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    const cur = agg.get(key) ?? { sumMonths: 0, deals: 0 };
    cur.sumMonths += b.avgMonths * b.dealCount;
    cur.deals += b.dealCount;
    agg.set(key, cur);
  }
  const quarterAvgDays = (k: string): number | null => {
    const v = agg.get(k);
    return v && v.deals > 0 ? (v.sumMonths / v.deals) * DAYS_PER_MONTH : null;
  };
  const latestQ = axis[axis.length - 1];
  const prevQ = axis[axis.length - 2];
  const curDays = latestQ ? quarterAvgDays(latestQ.key) : null;
  const prevDays = prevQ ? quarterAvgDays(prevQ.key) : null;
  const delta = curDays != null && prevDays != null ? curDays - prevDays : null;
  const pct = delta != null && prevDays! > 0 ? (delta / prevDays!) * 100 : null;
  const isImprovement = delta != null && delta < 0; // lower time = better
  const isNeutral = delta == null || Math.abs(delta) < 0.5;

  const [drilldown, setDrilldown] = useState(false);

  return (
    <>
    <Card
      className={cn(
        'relative group overflow-hidden transition-all duration-200',
        'glass-module',
        'hover:border-primary/40 hover:-translate-y-0.5',
        'hover:shadow-[0_0_20px_hsl(var(--primary)/0.1),0_8px_32px_hsl(0,0%,0%,0.4)]',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />
      <CardContent className="flex items-center gap-2 py-4 px-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground font-medium truncate" title={title}>
            {title}
          </p>
          <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <button
                type="button"
                onClick={() => setDrilldown(true)}
                className="drilldown-value text-xl font-bold font-mono tabular-nums text-foreground"
              >
                {display}
              </button>
            )}
            {!isLoading && !isNeutral && (
              <span
                className={cn(
                  'text-[15px] font-medium font-mono tabular-nums',
                  isImprovement ? 'text-emerald-400' : 'text-rose-400',
                )}
                title={`${latestQ?.label ?? ''} vs ${prevQ?.label ?? ''}`}
              >
                {isImprovement ? '▼' : '▲'} {Math.round(Math.abs(delta!))}d
                {pct != null && Number.isFinite(pct) && ` (${isImprovement ? '−' : '+'}${Math.abs(pct).toFixed(1)}%)`}
              </span>
            )}
            {!isLoading && isNeutral && prevQ && (
              <span className="text-[15px] text-muted-foreground">No change</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
    <VelocityDrilldownDialog
      open={drilldown}
      onOpenChange={setDrilldown}
      tile={{ id: title, title, color, fromVariants, toVariants }}
      unit="days"
    />
    </>
  );
}

const AVG_TIME_TILES: Array<{ id: string; title: string; color: string; from: string[]; to: string[] }> = [
  {
    id: 'avg-signed-to-submission',
    title: 'Signed to Submission',
    color: 'hsl(var(--chart-1))',
    from: AVG_TIME_STAGE_VARIANTS.finalCreditItems,
    to: AVG_TIME_STAGE_VARIANTS.lendersInReview,
  },
  {
    id: 'avg-signed-to-terms-issued',
    title: 'Signed to Terms Issued',
    color: 'hsl(var(--chart-2))',
    from: AVG_TIME_STAGE_VARIANTS.finalCreditItems,
    to: AVG_TIME_STAGE_VARIANTS.termsIssued,
  },
  {
    id: 'avg-signed-to-terms-signed',
    title: 'Signed to Terms Signed',
    color: 'hsl(var(--chart-3))',
    from: AVG_TIME_STAGE_VARIANTS.finalCreditItems,
    to: AVG_TIME_STAGE_VARIANTS.inDueDiligence,
  },
  {
    id: 'avg-submission-to-terms-signed',
    title: 'Submission to Terms Signed',
    color: 'hsl(var(--chart-4))',
    from: AVG_TIME_STAGE_VARIANTS.lendersInReview,
    to: AVG_TIME_STAGE_VARIANTS.inDueDiligence,
  },
  {
    id: 'avg-submission-to-funded',
    title: 'Submission to Funded / Invoiced',
    color: 'hsl(var(--chart-5))',
    from: AVG_TIME_STAGE_VARIANTS.lendersInReview,
    to: AVG_TIME_STAGE_VARIANTS.fundedInvoiced,
  },
];

interface DrilldownBucket {
  key: string;
  label: string;
  start: string;
  end: string;
  deals: StageEntryDeal[];
  count: number;
  sum: number;
  value: number; // aggregated value per metric type
}

function buildDrilldownBuckets(
  deals: StageEntryDeal[],
  quarter: QuarterOption,
  granularity: TrendChartMode,
  metricType: 'count' | 'dollars' | 'average',
): DrilldownBucket[] {
  // Monthly buckets from quarter.months; quarterly buckets group months into 3-month windows.
  const monthlyBuckets = quarter.months.map((m) => ({
    key: m.key,
    label: `${m.label} ${m.key.slice(2, 4)}`,
    start: m.start,
    end: m.end,
  }));

  let baseBuckets: { key: string; label: string; start: string; end: string }[];
  if (granularity === 'monthly') {
    baseBuckets = monthlyBuckets;
  } else {
    const grouped = new Map<string, { key: string; label: string; start: string; end: string }>();
    for (const m of quarter.months) {
      const [yearStr, monthStr] = m.key.split('-');
      const monthIdx = parseInt(monthStr, 10) - 1;
      const q = Math.floor(monthIdx / 3) + 1;
      const key = `${yearStr}-Q${q}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { key, label: `Q${q} ${yearStr.slice(2)}`, start: m.start, end: m.end });
      } else if (m.end > existing.end) {
        existing.end = m.end;
      }
    }
    baseBuckets = Array.from(grouped.values());
  }

  return baseBuckets.map((b) => {
    const bucketDeals = deals.filter((d) => {
      if (!d.entered_at) return false;
      const day = d.entered_at.slice(0, 10);
      return day >= b.start && day <= b.end;
    });
    const count = bucketDeals.length;
    const sum = bucketDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const value =
      metricType === 'count' ? count :
      metricType === 'dollars' ? sum :
      count > 0 ? sum / count : 0;
    return { ...b, deals: bucketDeals, count, sum, value };
  });
}

function DrilldownBarChart({
  buckets,
  color,
  formatter,
  selectedKey,
  onSelect,
  metricType,
}: {
  buckets: DrilldownBucket[];
  color: string;
  formatter: (v: number) => string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  metricType: 'count' | 'dollars' | 'average';
}) {
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={buckets} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={metricType !== 'count'}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatter(v)}
            width={54}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const b = payload[0].payload as DrilldownBucket;
              return (
                <div
                  style={{
                    backgroundColor: 'hsl(var(--popover) / 0.96)',
                    border: '1px solid hsl(0 0% 100% / 0.14)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 12,
                    color: 'hsl(0 0% 100%)',
                    boxShadow: 'var(--shadow-xl)',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{b.label} · {formatter(b.value)}</div>
                  <div style={{ color: 'hsl(0 0% 100% / 0.78)' }}>
                    {b.count} deal{b.count !== 1 ? 's' : ''} · {formatCurrency(b.sum)}
                  </div>
                </div>
              );
            }}
            wrapperStyle={{ outline: 'none' }}
            cursor={{ stroke: 'hsl(var(--accent))', strokeOpacity: 0.4 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: DrilldownBucket; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (cx == null || cy == null || !payload) {
                return <g key={`empty-${index ?? 0}`} />;
              }
              const isActive = selectedKey === null || selectedKey === payload.key;
              const isSelected = selectedKey === payload.key;
              return (
                <circle
                  key={`${payload.key}-${index ?? 0}`}
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 5 : 3.5}
                  fill={payload.value > 0 ? color : 'hsl(var(--muted))'}
                  fillOpacity={isActive ? 1 : 0.35}
                  stroke="hsl(var(--card))"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(selectedKey === payload.key ? null : payload.key)}
                />
              );
            }}
            activeDot={{ r: 5, style: { cursor: 'pointer' } }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DrilldownModal({
  open, onClose, title, deals, periodNote, selectedQuarter,
  metricType = 'dollars', valueFormatter, chartColor, conversionBreakdown,
  signedMode, onSignedModeChange, signedAnchorLabel, stackedFees,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  deals: StageEntryDeal[];
  periodNote?: string;
  selectedQuarter?: QuarterOption;
  metricType?: 'count' | 'dollars' | 'average' | 'none';
  valueFormatter?: (v: number) => string;
  chartColor?: string;
  conversionBreakdown?: ConversionBreakdown;
  signedMode?: 'off' | 'ttm' | 'lifetime';
  onSignedModeChange?: (v: 'off' | 'ttm' | 'lifetime') => void;
  signedAnchorLabel?: string;
  stackedFees?: boolean;
}) {
  return (
    <DrilldownModalInner
      open={open}
      onClose={onClose}
      title={title}
      deals={deals}
      periodNote={periodNote}
      selectedQuarter={selectedQuarter}
      metricType={metricType}
      valueFormatter={valueFormatter}
      chartColor={chartColor}
      conversionBreakdown={conversionBreakdown}
      signedMode={signedMode}
      onSignedModeChange={onSignedModeChange}
      signedAnchorLabel={signedAnchorLabel}
      stackedFees={stackedFees}
    />
  );
}

const FEE_SEGMENTS = [
  { key: 'retainer_fee' as const, label: 'Retainer', color: 'hsl(160, 65%, 50%)' },
  { key: 'milestone_fee' as const, label: 'Milestone', color: 'hsl(280, 65%, 60%)' },
  { key: 'closing_fee' as const, label: 'Closing / Success', color: 'hsl(35, 85%, 55%)' },
];

function StackedFeesChart({ deals }: { deals: StageEntryDeal[] }) {
  const fmt = (v: number) => {
    const n = Number(v) || 0;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs < 1_000_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
  };
  const [xAxis, setXAxis] = useState<'deal' | 'month'>('deal');
  const rows = useMemo(() => {
    return deals
      .map(d => {
        const retainer = Number(d.retainer_fee) || 0;
        const milestone = Number(d.milestone_fee) || 0;
        const closing = Number(d.closing_fee) || 0;
        const total = retainer + milestone + closing;
        return {
          deal_id: d.deal_id,
          company: d.company,
          retainer_fee: retainer,
          milestone_fee: milestone,
          closing_fee: closing,
          total,
        };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [deals]);

  const monthRows = useMemo(() => {
    const UNSCHED = 'Unscheduled';
    const bucket = new Map<string, { key: string; label: string; retainer_fee: number; milestone_fee: number; closing_fee: number; total: number; sortKey: string }>();
    const add = (rawDate: string | null | undefined, field: 'retainer_fee' | 'milestone_fee' | 'closing_fee', amount: number) => {
      if (!amount) return;
      let key: string;
      let label: string;
      let sortKey: string;
      if (!rawDate) {
        key = UNSCHED; label = UNSCHED; sortKey = '9999-99';
      } else {
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) { key = UNSCHED; label = UNSCHED; sortKey = '9999-99'; }
        else {
          const y = d.getUTCFullYear();
          const m = d.getUTCMonth();
          key = `${y}-${String(m + 1).padStart(2, '0')}`;
          label = d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
          sortKey = key;
        }
      }
      let row = bucket.get(key);
      if (!row) {
        row = { key, label, retainer_fee: 0, milestone_fee: 0, closing_fee: 0, total: 0, sortKey };
        bucket.set(key, row);
      }
      row[field] += amount;
      row.total += amount;
    };
    for (const d of deals) {
      // Milestone revenue → Qualified Term Sheet milestone due date
      add(d.qts_due_date, 'milestone_fee', Number(d.milestone_fee) || 0);
      // Closing/Success revenue → deal projected close date
      add(d.projected_close_date, 'closing_fee', Number(d.closing_fee) || 0);
      // Retainer → also anchored to projected close date (no dedicated date)
      add(d.projected_close_date, 'retainer_fee', Number(d.retainer_fee) || 0);
    }
    return Array.from(bucket.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [deals]);

  const activeRows = xAxis === 'deal' ? rows : monthRows;
  const xKey = xAxis === 'deal' ? 'company' : 'label';

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.retainer += r.retainer_fee;
        acc.milestone += r.milestone_fee;
        acc.closing += r.closing_fee;
        acc.total += r.total;
        return acc;
      },
      { retainer: 0, milestone: 0, closing: 0, total: 0 },
    );
  }, [rows]);

  const height = xAxis === 'deal'
    ? Math.max(260, Math.min(600, activeRows.length * 42 + 60))
    : Math.max(260, Math.min(560, activeRows.length * 48 + 80));

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fee mix by {xAxis === 'deal' ? 'deal' : 'forecasted month'}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <div className="inline-flex rounded-md border border-border/40 bg-muted/40 p-0.5 gap-0.5">
            {(['deal', 'month'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setXAxis(opt)}
                className={
                  'px-2.5 py-1 text-[11px] rounded-sm transition-colors ' +
                  (xAxis === opt
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')
                }
                title={opt === 'deal' ? 'One bar per deal' : 'Bucketed by forecasted revenue month (QTS milestone due date for milestone fees; projected close date for retainer & closing/success)'}
              >
                By {opt === 'deal' ? 'deal' : 'month'}
              </button>
            ))}
          </div>
          {FEE_SEGMENTS.map(s => {
            const v =
              s.key === 'retainer_fee' ? totals.retainer
              : s.key === 'milestone_fee' ? totals.milestone
              : totals.closing;
            return (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="font-mono text-foreground/80">{fmt(v)}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={activeRows} margin={{ top: 8, right: 16, left: 8, bottom: xAxis === 'deal' ? 64 : 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
              interval={0}
              angle={xAxis === 'deal' ? -35 : 0}
              textAnchor={xAxis === 'deal' ? 'end' : 'middle'}
              height={xAxis === 'deal' ? 70 : 30}
            />
            <YAxis
              type="number"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v: number) => fmt(v)}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--accent) / 0.08)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const row = payload[0].payload as { retainer_fee: number; milestone_fee: number; closing_fee: number; total: number };
                return (
                  <div
                    style={{
                      backgroundColor: 'hsl(var(--popover) / 0.96)',
                      border: '1px solid hsl(0 0% 100% / 0.14)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontSize: 12,
                      color: 'hsl(0 0% 100%)',
                      boxShadow: 'var(--shadow-xl)',
                      backdropFilter: 'blur(16px)',
                      minWidth: 200,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    {FEE_SEGMENTS.map(s => (
                      <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, opacity: 0.9 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ height: 8, width: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                          {s.label}
                        </span>
                        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmt(row[s.key])}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4, paddingTop: 4, borderTop: '1px solid hsl(0 0% 100% / 0.12)', fontWeight: 600 }}>
                      <span>Total</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace' }}>{fmt(row.total)}</span>
                    </div>
                  </div>
                );
              }}
            />
            {FEE_SEGMENTS.map(s => (
              <Bar key={s.key} dataKey={s.key} stackId="fees" fill={s.color} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {xAxis === 'month' && (
        <div className="text-[10px] text-muted-foreground/80 leading-relaxed">
          Milestone fees bucketed by the "Qualified Term Sheet" milestone due date. Retainer & Closing/Success fees bucketed by projected close date. Deals missing those dates roll up under "Unscheduled".
        </div>
      )}
    </div>
  );
}

function ConversionDealsTable({ heading, deals, accent, dropoutIds, stillActiveIds }: { heading: string; deals: StageEntryDeal[]; accent: string; dropoutIds?: Set<string>; stillActiveIds?: Set<string> }) {
  return _ConversionDealsTable({ heading, deals, accent, dropoutIds, stillActiveIds });
}

function SignedModeToggle({
  value,
  onChange,
  anchorLabel,
}: {
  value: 'off' | 'ttm' | 'lifetime';
  onChange: (v: 'off' | 'ttm' | 'lifetime') => void;
  anchorLabel: string;
}) {
  const opts: Array<{ v: 'off' | 'ttm' | 'lifetime'; label: string; hint: string }> = [
    { v: 'off', label: 'All entries', hint: `Raw stage-entry counts — no ${anchorLabel} passthrough filter` },
    { v: 'ttm', label: `In ${anchorLabel} (TTM)`, hint: `Only deals that entered ${anchorLabel} in the last 12 months` },
    { v: 'lifetime', label: `In ${anchorLabel} ever`, hint: `Only deals that entered ${anchorLabel} at any point in their history` },
  ];
  return (
    <div className="inline-flex rounded-md border border-border/40 bg-muted/40 p-0.5 gap-0.5">
      {opts.map(o => (
        <button
          key={o.v}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.v)}
          className={
            'px-2.5 py-1 text-[11px] rounded-sm transition-colors ' +
            (value === o.v
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function _ConversionDealsTable({ heading, deals, accent, dropoutIds, stillActiveIds }: { heading: string; deals: StageEntryDeal[]; accent: string; dropoutIds?: Set<string>; stillActiveIds?: Set<string> }) {
  const total = deals.reduce((s, d) => s + d.value, 0);
  const dropoutCount = dropoutIds ? deals.filter(d => dropoutIds.has(d.deal_id)).length : 0;
  const stillActiveCount = stillActiveIds ? deals.filter(d => stillActiveIds.has(d.deal_id)).length : 0;
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          <span className="text-xs font-semibold text-foreground">{heading}</span>
          {dropoutIds && dropoutCount > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30">
              {dropoutCount} dropped off
            </span>
          )}
          {stillActiveIds && stillActiveCount > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
              {stillActiveCount} still in process
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} · {formatCurrencyFull(total)}
        </span>
      </div>
      {deals.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No deals entered this stage in the trailing 12 months.</p>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/20">
              <tr className="border-b">
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Deal</th>
                <th className="text-right px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Entered</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const dropped = dropoutIds?.has(d.deal_id) ?? false;
                const stillActive = !dropped && (stillActiveIds?.has(d.deal_id) ?? false);
                return (
                  <tr
                    key={d.deal_id}
                    className={cn(
                      'border-b last:border-0',
                      dropped
                        ? 'bg-destructive/10 hover:bg-destructive/15'
                        : stillActive
                          ? 'bg-primary/10 hover:bg-primary/15'
                          : 'hover:bg-muted/20',
                    )}
                  >
                    <td className="px-3 py-1.5 font-medium">
                      <div className="flex items-center gap-1.5">
                        {dropped && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-destructive"
                            aria-label="Did not advance"
                          />
                        )}
                        {stillActive && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-primary"
                            aria-label="Still in process"
                          />
                        )}
                        <DealLink
                          dealId={d.deal_id}
                          className={
                            dropped
                              ? 'text-destructive-foreground'
                              : stillActive
                                ? 'text-primary'
                                : undefined
                          }
                        >
                          {d.company}
                        </DealLink>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatCurrencyFull(d.value)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {new Date(d.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DrilldownModalInner({
  open, onClose, title, deals, periodNote, selectedQuarter,
  metricType = 'dollars', valueFormatter, chartColor, conversionBreakdown,
  signedMode, onSignedModeChange, signedAnchorLabel, stackedFees,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  deals: StageEntryDeal[];
  periodNote?: string;
  selectedQuarter?: QuarterOption;
  metricType?: 'count' | 'dollars' | 'average' | 'none';
  valueFormatter?: (v: number) => string;
  chartColor?: string;
  conversionBreakdown?: ConversionBreakdown;
  signedMode?: 'off' | 'ttm' | 'lifetime';
  onSignedModeChange?: (v: 'off' | 'ttm' | 'lifetime') => void;
  signedAnchorLabel?: string;
  stackedFees?: boolean;
}) {
  const [granularity, setGranularity] = useState<TrendChartMode>('monthly');
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGranularity('monthly');
      setSelectedBucketKey(null);
    }
  }, [open, title]);

  const showStackedFeesChart = !conversionBreakdown && !!stackedFees && deals.length > 0;
  const showChart =
    !conversionBreakdown && !showStackedFeesChart && metricType !== 'none' && !!selectedQuarter && deals.length > 0;
  const chartMetricType = (metricType === 'none' ? 'count' : metricType) as 'count' | 'dollars' | 'average';
  const formatter = valueFormatter ?? (chartMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency);
  const color = chartColor ?? 'hsl(var(--chart-3))';

  const buckets = useMemo<DrilldownBucket[]>(() => {
    if (!selectedQuarter) return [];
    return buildDrilldownBuckets(deals, selectedQuarter, granularity, chartMetricType);
  }, [deals, selectedQuarter, granularity, chartMetricType]);

  const filteredDeals = useMemo(() => {
    if (!selectedBucketKey) return deals;
    const b = buckets.find((x) => x.key === selectedBucketKey);
    return b ? b.deals : deals;
  }, [deals, buckets, selectedBucketKey]);

  const total = deals.reduce((s, d) => s + d.value, 0);
  const selectedBucket = selectedBucketKey ? buckets.find((b) => b.key === selectedBucketKey) ?? null : null;

  // For conversion-rate drilldowns: identify denominator deals that never
  // advanced to the numerator stage, then check the deals table to see which
  // of them are STILL active (not closed-won / closed-lost / on-hold / etc).
  // We surface an alternative conversion rate that excludes those "still in
  // process" deals from the denominator so genuinely in-flight deals aren't
  // treated as drop-offs.
  const dropoutIds = useMemo(() => {
    if (!conversionBreakdown) return [] as string[];
    const numSet = new Set(conversionBreakdown.numeratorDeals.map(n => n.deal_id));
    return conversionBreakdown.denominatorDeals
      .filter(d => !numSet.has(d.deal_id))
      .map(d => d.deal_id);
  }, [conversionBreakdown]);

  const dropoutKey = useMemo(() => [...dropoutIds].sort().join(','), [dropoutIds]);
  const { data: stillActiveDropoutIds } = useQuery({
    queryKey: ['conversion-dropout-still-active', dropoutKey],
    enabled: open && dropoutIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, stage, status')
        .in('id', dropoutIds);
      if (error) throw error;
      return (data ?? [])
        .filter(d => isActiveDeal(d as unknown as Parameters<typeof isActiveDeal>[0]))
        .map(d => d.id as string);
    },
  });

  const adjustedConversion = useMemo(() => {
    if (!conversionBreakdown) return null;
    const stillActive = stillActiveDropoutIds?.length ?? 0;
    if (stillActive <= 0) return null;
    const denomAdj = conversionBreakdown.denominatorCount - stillActive;
    if (denomAdj <= 0) return null;
    const pct = (conversionBreakdown.numeratorCount / denomAdj) * 100;
    return { stillActive, denomAdj, pct, text: `${pct.toFixed(1)}%` };
  }, [conversionBreakdown, stillActiveDropoutIds]);
  const stillActiveIdSet = useMemo(
    () => new Set(stillActiveDropoutIds ?? []),
    [stillActiveDropoutIds],
  );

  const context: DrilldownContext = {
    sourceId: `debt-advisory:${title}`,
    sourceLabel: title,
    selection: periodNote,
    periodLabel: selectedQuarter?.label,
  };

  const body = (
    <div className="p-4 space-y-4 text-foreground">
        {conversionBreakdown && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <TooltipProvider delayDuration={100}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">
                        Conversion rate
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-[11px] leading-relaxed">
                      Source: deal_stage_history · stage_enter events on the Active Pipeline,
                      deduplicated to the first entry per deal per stage over the trailing 12 months.
                      Numerator = {conversionBreakdown.numeratorLabel}. Denominator = {conversionBreakdown.denominatorLabel}.
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
                <div className="mt-0.5 flex items-baseline gap-3 flex-wrap">
                  <div className="text-2xl font-bold text-foreground">
                    {conversionBreakdown.percentText}
                  </div>
                  {adjustedConversion && (
                    <TooltipProvider delayDuration={100}>
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-baseline gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 cursor-help">
                            <span className="text-[10px] uppercase tracking-wide text-primary/80 font-semibold">Excl. in-process</span>
                            <span className="text-lg font-bold text-primary tabular-nums">{adjustedConversion.text}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-[11px] leading-relaxed">
                          Excludes {adjustedConversion.stillActive} deal{adjustedConversion.stillActive !== 1 ? 's' : ''} still active in the pipeline
                          (not Closed Won / Closed Lost / On Hold) from the denominator.
                          Adjusted = {conversionBreakdown.numeratorCount} / {adjustedConversion.denomAdj}.
                        </TooltipContent>
                      </UITooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {deals.length} deal{deals.length !== 1 ? 's' : ''}
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono">
                {formatCurrencyFull(total)}
              </Badge>
            </div>
            {onSignedModeChange && (
              <div className="rounded-md border border-border/40 bg-background/60 p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Restrict to deals that entered {signedAnchorLabel ?? 'the denominator stage'}
                </div>
                <SignedModeToggle
                  value={signedMode ?? 'off'}
                  onChange={onSignedModeChange}
                  anchorLabel={signedAnchorLabel ?? 'denominator'}
                />
                <p className="text-[11px] text-muted-foreground">
                  {signedMode === 'ttm' && `Numerator only counts deals whose ${signedAnchorLabel ?? 'denominator'} entry falls inside the trailing 12-month window.`}
                  {signedMode === 'lifetime' && `Numerator only counts deals that entered ${signedAnchorLabel ?? 'the denominator stage'} at any point in their history — even if the ${signedAnchorLabel ?? 'denominator'} event predates the TTM window.`}
                  {(!signedMode || signedMode === 'off') && `Raw stage-entry counts — no ${signedAnchorLabel ?? 'denominator'}-passthrough filter applied.`}
                </p>
              </div>
            )}
          </div>
        )}

      {!conversionBreakdown && (
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono">
            {formatCurrencyFull(total)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {showChart
              ? `${granularity === 'monthly' ? 'Monthly' : 'Quarterly'} trend for selected period`
              : (periodNote ?? 'Filtered by selected period')}
          </span>
        </div>
      )}

        {showStackedFeesChart && (
          <StackedFeesChart deals={deals} />
        )}

        {showChart && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {chartMetricType === 'count' ? 'Deals' : chartMetricType === 'dollars' ? 'Dollar volume' : 'Average'} by {granularity === 'monthly' ? 'month' : 'quarter'}
              </div>
              <div className="flex items-center gap-2">
                {selectedBucket && (
                  <button
                    type="button"
                    onClick={() => setSelectedBucketKey(null)}
                    className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    Clear · {selectedBucket.label}
                  </button>
                )}
                <Tabs value={granularity} onValueChange={(v) => { setGranularity(v as TrendChartMode); setSelectedBucketKey(null); }}>
                  <TabsList className="h-7 bg-muted/40 border border-border/40">
                    <TabsTrigger value="monthly" className="h-6 px-2 text-[11px]">Monthly</TabsTrigger>
                    <TabsTrigger value="quarterly" className="h-6 px-2 text-[11px]">Quarterly</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            <DrilldownBarChart
              buckets={buckets}
              color={color}
              formatter={formatter}
              selectedKey={selectedBucketKey}
              onSelect={setSelectedBucketKey}
              metricType={chartMetricType}
            />
          </div>
        )}

        {conversionBreakdown ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ConversionDealsTable
              heading={conversionBreakdown.denominatorLabel}
              deals={conversionBreakdown.denominatorDeals}
              accent="hsl(var(--chart-4))"
              dropoutIds={new Set(
                conversionBreakdown.denominatorDeals
                  .filter(d =>
                    !conversionBreakdown.numeratorDeals.some(n => n.deal_id === d.deal_id) &&
                    !stillActiveIdSet.has(d.deal_id),
                  )
                  .map(d => d.deal_id),
              )}
              stillActiveIds={stillActiveIdSet}
            />
            <ConversionDealsTable
              heading={conversionBreakdown.numeratorLabel}
              deals={conversionBreakdown.numeratorDeals}
              accent="hsl(var(--chart-3))"
            />
          </div>
        ) : filteredDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {selectedBucketKey ? 'No deals in this bucket.' : 'No deals found for this period.'}
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Deal / Company</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Current Stage</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Entered</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(deal => (
                  <tr key={deal.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">
                      <DealLink dealId={deal.deal_id}>{deal.company}</DealLink>
                    </td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{formatCurrencyFull(deal.value)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatStageLabel(deal.current_stage)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(deal.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{deal.manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20">
                  <td className="px-3 py-2 text-xs font-medium">
                    Total {selectedBucketKey ? '(all periods)' : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">{formatCurrencyFull(total)}</td>
                  <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                    {deals.length} deal{deals.length !== 1 ? 's' : ''} across all buckets
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </div>
  );

  return (
    <InsightsDrilldownDrawer
      open={open}
      onClose={onClose}
      context={context}
      columns={[]}
      rows={[]}
      body={body}
      onBackToDashboard={onClose}
    />
  );
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  cards: MetricCardConfig[];
}

type TrendChartMode = 'monthly' | 'quarterly';

type TrendMetricKey = 'deals-closed' | 'dollars-funded';

interface PendingTrendReopen {
  metric: TrendMetricKey;
  mode: TrendChartMode;
  bucketKey: string;
}

function CompactFundedBarChart({
  title,
  subtitle,
  buckets,
  isLoading,
  color,
  dataKey,
  valueFormatter,
  totalFormatter,
  onBarClick,
  planWidgetKey,
}: {
  title: string;
  subtitle: string;
  buckets: StageTrendBucket[];
  isLoading: boolean;
  color: string;
  dataKey: 'count' | 'dollarVolume';
  valueFormatter: (value: number) => string;
  totalFormatter: (value: number) => string;
  onBarClick: (bucket: StageTrendBucket) => void;
  /** Master Plan widget key. When set and comparison mode = "plan", a plan
   *  overlay line is drawn on the bar chart. */
  planWidgetKey?: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket[dataKey], 0);
  const [showTrend, setShowTrend] = useState(false);
  const { mode: comparisonMode } = useComparisonMode();
  const planLookup = useDebtAdvisoryPlanForBuckets(
    comparisonMode === 'plan' ? planWidgetKey : undefined,
    buckets,
  );
  const showPlanOverlay = comparisonMode === 'plan' && !!planWidgetKey;
  const planTotal = useMemo(
    () =>
      showPlanOverlay
        ? buckets.reduce((sum, b) => sum + (planLookup.values.get(b.key) ?? 0), 0)
        : 0,
    [buckets, planLookup.values, showPlanOverlay],
  );
  const planCoverage = showPlanOverlay
    ? buckets.filter((b) => planLookup.values.has(b.key)).length
    : 0;

  // Linear regression trend line over the visible buckets.
  const trendValues = useMemo(() => {
    const values = buckets.map((b) => Number(b[dataKey]) || 0);
    const pts = values.map((y, x) => ({ x, y }));
    if (pts.length < 2) return values.map(() => null as number | null);
    const n = pts.length;
    const sumX = pts.reduce((a, p) => a + p.x, 0);
    const sumY = pts.reduce((a, p) => a + p.y, 0);
    const sumXY = pts.reduce((a, p) => a + p.x * p.y, 0);
    const sumXX = pts.reduce((a, p) => a + p.x * p.x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return values.map(() => null);
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return values.map((_, i) => intercept + slope * i);
  }, [buckets, dataKey]);

  const chartData = useMemo(
    () =>
      buckets.map((b, i) => ({
        ...b,
        trend: trendValues[i],
        plan: showPlanOverlay ? planLookup.values.get(b.key) ?? null : null,
      })),
    [buckets, trendValues, showPlanOverlay, planLookup.values],
  );

  // Period-over-period change: latest bucket vs prior bucket.
  const latestVal = buckets.length ? Number(buckets[buckets.length - 1][dataKey]) || 0 : 0;
  const prevVal = buckets.length > 1 ? Number(buckets[buckets.length - 2][dataKey]) || 0 : null;
  const popDelta = prevVal != null ? latestVal - prevVal : null;
  const popPct = prevVal != null && prevVal !== 0 ? ((latestVal - prevVal) / Math.abs(prevVal)) * 100 : null;
  const popPositive = (popDelta ?? 0) >= 0;

  // Trend delta: linear-regression endpoints across the visible period.
  const firstTrend = trendValues.find((v) => v != null) ?? null;
  const lastTrend = [...trendValues].reverse().find((v) => v != null) ?? null;
  const trendDelta = firstTrend != null && lastTrend != null ? lastTrend - firstTrend : null;
  const trendPct = firstTrend != null && firstTrend !== 0 && trendDelta != null
    ? (trendDelta / firstTrend) * 100 : null;
  const trendPositive = (trendDelta ?? 0) >= 0;

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-1 h-3 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          {showTrend && trendDelta != null && (
            <p className={cn(
              'text-[11px] font-medium mt-1',
              trendDelta > 0 ? 'text-emerald-400' : trendDelta < 0 ? 'text-rose-400' : 'text-muted-foreground',
            )}>
              Trend: {trendPositive ? '+' : ''}{trendPct != null ? `${trendPct.toFixed(1)}%` : '—'}
              {' / '}{trendPositive ? '+' : ''}{valueFormatter(trendDelta)}
              <span className="text-muted-foreground font-normal"> vs start of period</span>
            </p>
          )}
          {showPlanOverlay && planCoverage > 0 && (() => {
            const diff = total - planTotal;
            const pct = planTotal !== 0 ? (diff / Math.abs(planTotal)) * 100 : null;
            const positive = diff >= 0;
            return (
              <p className="text-[11px] font-medium mt-1 text-amber-300/90">
                Plan: {valueFormatter(planTotal)}
                {' · '}
                <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>
                  {positive ? '▲ +' : '▼ '}{valueFormatter(Math.abs(diff))}
                  {pct != null ? ` (${positive ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)` : ''}
                </span>
                <span className="text-muted-foreground font-normal"> vs plan</span>
                {planCoverage < buckets.length && (
                  <span
                    className="text-muted-foreground/70 font-normal"
                    title="Some periods have no Master Plan value entered"
                  >
                    {' '}· {planCoverage}/{buckets.length} periods
                  </span>
                )}
              </p>
            );
          })()}
          {showPlanOverlay && planCoverage === 0 && !planLookup.isLoading && (
            <p
              className="text-[11px] font-medium mt-1 text-muted-foreground/70"
              title="Enter values in the Master Plan popup to see a plan line here."
            >
              No plan values entered for this period
            </p>
          )}
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            <p className="text-lg font-bold text-foreground leading-tight">{totalFormatter(total)}</p>
            {popDelta != null ? (
              <p className={cn(
                'text-[10px] font-medium leading-tight',
                popDelta > 0 ? 'text-emerald-400' : popDelta < 0 ? 'text-rose-400' : 'text-muted-foreground',
              )}>
                {popPositive ? '▲' : '▼'} {popPositive ? '+' : ''}{valueFormatter(popDelta)}
                {popPct != null ? ` (${popPositive ? '+' : ''}${popPct.toFixed(1)}%)` : ''}
                <span className="text-muted-foreground font-normal"> vs prev</span>
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground leading-tight">{buckets.length} {buckets.length === 6 ? 'Months' : 'Quarters'}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowTrend((v) => !v)}
            aria-pressed={showTrend}
            title="Toggle trend line"
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-md border transition-colors shrink-0',
              showTrend
                ? 'bg-primary/20 border-primary/40 text-foreground'
                : 'bg-muted/40 border-border/40 text-muted-foreground hover:text-foreground',
            )}
          >
            Trend
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={dataKey === 'dollarVolume'}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => valueFormatter(value)}
                width={54}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const bucket = payload[0].payload as StageTrendBucket;
                  const value = dataKey === 'dollarVolume' ? bucket.dollarVolume : bucket.count;
                  const idx = buckets.findIndex((b) => b.key === bucket.key);
                  const prev = idx > 0 ? buckets[idx - 1] : null;
                  const prevValInner = prev ? Number(prev[dataKey]) || 0 : null;
                  const deltaInner = prevValInner != null ? value - prevValInner : null;
                  const pctInner = prevValInner != null && prevValInner !== 0
                    ? ((value - prevValInner) / Math.abs(prevValInner)) * 100 : null;
                  const posInner = (deltaInner ?? 0) >= 0;
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: 'hsl(0 0% 100%)',
                        maxWidth: 280,
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(0 0% 100%)' }}>
                        {bucket.label} · {valueFormatter(value)}
                      </div>
                      {deltaInner != null && (
                        <div style={{
                          color: posInner ? '#5EEAD4' : '#FB7185',
                          fontSize: 11,
                          marginBottom: 4,
                        }}>
                          {posInner ? '▲' : '▼'} {posInner ? '+' : ''}{valueFormatter(deltaInner)}
                          {pctInner != null ? ` (${posInner ? '+' : ''}${pctInner.toFixed(1)}%)` : ''} vs prev
                        </div>
                      )}
                      <div style={{ color: 'hsl(0 0% 100% / 0.82)', marginBottom: bucket.deals.length ? 6 : 0 }}>
                        {bucket.count} deal{bucket.count !== 1 ? 's' : ''} · {formatCurrency(bucket.dollarVolume)}
                      </div>
                      {showPlanOverlay && (() => {
                        const planVal = planLookup.values.get(bucket.key);
                        if (planVal == null) {
                          return (
                            <div style={{ color: 'hsl(45 93% 70% / 0.75)', fontSize: 11, marginBottom: 4 }}>
                              Plan: — (no value entered)
                            </div>
                          );
                        }
                        const d = value - planVal;
                        const p = planVal !== 0 ? (d / Math.abs(planVal)) * 100 : null;
                        const pos = d >= 0;
                        return (
                          <div style={{ color: 'hsl(45 93% 70%)', fontSize: 11, marginBottom: 4 }}>
                            Plan: {valueFormatter(planVal)}{' · '}
                            <span style={{ color: pos ? '#5EEAD4' : '#FB7185' }}>
                              {pos ? '▲ +' : '▼ '}{valueFormatter(Math.abs(d))}
                              {p != null ? ` (${pos ? '+' : '−'}${Math.abs(p).toFixed(1)}%)` : ''}
                            </span>
                          </div>
                        );
                      })()}
                      {bucket.deals.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 14, lineHeight: 1.4 }}>
                          {bucket.deals.slice(0, 8).map((deal) => (
                            <li key={deal.deal_id} style={{ color: 'hsl(0 0% 100% / 0.88)' }}>
                              {deal.company}
                            </li>
                          ))}
                          {bucket.deals.length > 8 ? (
                            <li style={{ color: 'hsl(0 0% 100% / 0.78)' }}>+{bucket.deals.length - 8} more</li>
                          ) : null}
                        </ul>
                      ) : (
                        <div style={{ color: 'hsl(0 0% 100% / 0.78)' }}>No deals</div>
                      )}
                    </div>
                  );
                }}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Bar dataKey={dataKey} shape={createGlassBarShape({ radius: 3, dataKey })} cursor="pointer" onClick={(bucket: StageTrendBucket) => onBarClick(bucket)}>
                {buckets.map((bucket, index) => {
                  const rawValue = dataKey === 'dollarVolume' ? bucket.dollarVolume : bucket.count;
                  return (
                    <Cell
                      key={`${bucket.key}-${index}`}
                      fill={rawValue > 0 ? color : 'hsl(var(--muted))'}
                      fillOpacity={rawValue > 0 ? 0.85 : 0.3}
                    />
                  );
                })}
              </Bar>
              {showTrend && (
                <Line
                  type="monotone"
                  dataKey="trend"
                  stroke="hsl(142 71% 45%)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              {showPlanOverlay && planCoverage > 0 && (
                <Line
                  type="monotone"
                  dataKey="plan"
                  stroke="hsl(45 93% 58%)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 3, fill: 'hsl(45 93% 58%)', stroke: 'hsl(45 93% 58%)' }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                  name="Plan"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

const FUNDED_INVOICED_COLOR = 'hsl(var(--chart-3))';
const CLOSED_WON_COLOR = 'hsl(142 71% 45%)';

function StageMovementStackedBarChart({
  buckets,
  isLoading,
  trendMode,
  onBarClick,
}: {
  buckets: StageSplitTrendBucket[];
  isLoading: boolean;
  trendMode: TrendChartMode;
  onBarClick: (bucket: StageSplitTrendBucket) => void;
}) {
  const total = buckets.reduce((s, b) => s + b.total, 0);

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="mt-1 h-3 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[260px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">
            Stage Movement — Funded/Invoiced vs Closed Won
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Debt Advisory Metrics — {trendMode === 'monthly' ? 'monthly' : 'quarterly'} stage_enter events, past {trendMode === 'monthly' ? '6 months' : '4 quarters'} (rolling, anchored to today)
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">{buckets.length} {trendMode === 'monthly' ? 'Months' : 'Quarters'}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const bucket = payload[0].payload as StageSplitTrendBucket;
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: 'hsl(0 0% 100%)',
                        maxWidth: 280,
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {bucket.label} · {bucket.total} event{bucket.total !== 1 ? 's' : ''}
                      </div>
                      <div style={{ color: FUNDED_INVOICED_COLOR }}>
                        Closed: {bucket.fundedInvoicedCount}
                      </div>
                      <div style={{ color: CLOSED_WON_COLOR }}>
                        Closed Won: {bucket.closedWonCount}
                      </div>
                    </div>
                  );
                }}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}
                iconType="circle"
              />
              <Bar
                dataKey="fundedInvoicedCount"
                name="Closed"
                stackId="stage"
                fill={FUNDED_INVOICED_COLOR}
                fillOpacity={0.85}
                cursor="pointer"
                onClick={(bucket: StageSplitTrendBucket) => onBarClick(bucket)}
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="closedWonCount"
                name="Closed Won"
                stackId="stage"
                fill={CLOSED_WON_COLOR}
                fillOpacity={0.9}
                cursor="pointer"
                onClick={(bucket: StageSplitTrendBucket) => onBarClick(bucket)}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineMatrixTable({
  sections,
  selectedQuarter,
  onCellClick,
}: {
  sections: SectionDef[];
  selectedQuarter: QuarterOption;
  onCellClick: (card: MetricCardConfig, bucket: { key: string; label: string; deals: StageEntryDeal[] } | null) => void;
}) {
  const months = selectedQuarter.months;

  const rowsBySection = sections.map((section) => ({
    section,
    rows: section.cards.filter(c => !/average/i.test(c.title)),
  })).filter(s => s.rows.length > 0);

  const renderCell = (card: MetricCardConfig, monthStart: string, monthEnd: string) => {
    const dealsInMonth = card.deals.filter(d => {
      if (!d.entered_at) return false;
      const day = d.entered_at.slice(0, 10);
      return day >= monthStart && day <= monthEnd;
    });
    const metricType = card.drilldownMetricType ?? 'dollars';
    const count = dealsInMonth.length;
    const sum = dealsInMonth.reduce((s, d) => s + (Number(d.value) || 0), 0);
    if (metricType === 'count') return { display: count > 0 ? String(count) : '—', empty: count === 0, deals: dealsInMonth };
    return { display: count > 0 ? formatCurrency(sum) : '—', empty: count === 0, deals: dealsInMonth };
  };

  const renderTotal = (card: MetricCardConfig) => {
    const metricType = card.drilldownMetricType ?? 'dollars';
    if (metricType === 'count') return String(card.deals.length);
    const sum = card.deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    return formatCurrency(sum);
  };

  // Average cards across all sections, for the band below the table.
  const averageCards = sections.flatMap(s => s.cards.filter(c => /average/i.test(c.title)));

  return (
    <div className="space-y-4">
      <Card className="glass-module overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="sticky left-0 z-10 bg-muted/40 backdrop-blur text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[220px]">
                  Metric
                </th>
                {months.map(mo => (
                  <th
                    key={mo.key}
                    className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap min-w-[88px]"
                  >
                    {mo.label} {mo.key.slice(2, 4)}
                  </th>
                ))}
                <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground whitespace-nowrap min-w-[100px] border-l border-border/40">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsBySection.map(({ section, rows }) => (
                <Fragment key={section.id}>
                  <tr className="bg-muted/10">
                    <td
                      colSpan={months.length + 2}
                      className="sticky left-0 z-10 bg-muted/20 backdrop-blur px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground/80"
                    >
                      {section.title}
                      <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
                        {section.description}
                      </span>
                    </td>
                  </tr>
                  {rows.map(card => (
                    <tr key={card.id} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="sticky left-0 z-10 bg-card/95 backdrop-blur px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onCellClick(card, null)}
                          className="flex items-center gap-2 text-left hover:text-primary"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: card.color }}
                          />
                          {card.title}
                        </button>
                      </td>
                      {months.map(mo => {
                        const cell = renderCell(card, mo.start, mo.end);
                        return (
                          <td key={mo.key} className="px-3 py-2 text-right font-mono tabular-nums">
                            {card.isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                            ) : cell.empty ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  onCellClick(card, {
                                    key: mo.key,
                                    label: `${mo.label} ${mo.key.slice(2, 4)}`,
                                    deals: cell.deals,
                                  })
                                }
                                className="hover:text-primary hover:underline underline-offset-2"
                              >
                                {cell.display}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-foreground border-l border-border/40">
                        {card.isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground inline" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => onCellClick(card, null)}
                            className="hover:text-primary hover:underline underline-offset-2"
                          >
                            {renderTotal(card)}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {averageCards.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide">Averages</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Trailing-period averages — separated from the matrix because they are derived metrics
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {averageCards.map(card => (
              <MetricKPICard
                key={card.id}
                config={card}
                onClick={() => onCellClick(card, null)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ConsolidatedDebtPipelineDashboard({
  selectedQuarter,
}: {
  selectedQuarter?: QuarterOption;
}) {
  const rawMetrics = useConsolidatedDebtPipelineMetrics(selectedQuarter as QuarterOption);
  const { byDeal, ownerOptions, managerOptions } = useDealPeopleIndex();
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const allowedDealIds = useMemo(
    () => computeAllowedDealIds(byDeal, selectedOwners, selectedManagers),
    [byDeal, selectedOwners, selectedManagers],
  );
  const m = useMemo(
    () => filterDebtMetricsByPeople(rawMetrics, allowedDealIds),
    [rawMetrics, allowedDealIds],
  );
  const quarterlyFunnel = useQuarterlyTtmFunnel();
  const totalRevenueOpportunity = useTotalRevenueOpportunity();
  const termsConversionRate = useTermsConversionRate();
  const [trendMode, setTrendMode] = useState<TrendChartMode>('monthly');
  // When true, each bucket in the chart shows the trailing-12-month rollup
  // ending at that bucket's period end, instead of the bucket's own period.
  const [ttmCharts, setTtmCharts] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [comparisonMode] = useDebtAdvisoryComparisonMode();
  const debtPlan = useDebtAdvisoryPlanValues(selectedQuarter);
  const comparisonCtx = useMemo(
    () => ({
      mode: comparisonMode,
      planValues: debtPlan.values,
      periodLabel: debtPlan.periodLabel,
      isPlanLoading: debtPlan.isLoading,
    }),
    [comparisonMode, debtPlan.values, debtPlan.periodLabel, debtPlan.isLoading],
  );
  // Conversion filter mode for the Pipeline Conversion section:
  //   'off'      → count every stage-entry event in the TTM window (raw)
  //   'ttm'      → downstream stages must ALSO have entered FCI inside TTM
  //   'lifetime' → downstream stages must have entered FCI at ANY point
  //                (includes deals whose FCI event predates the TTM window,
  //                 e.g. True North Transportation, Duracell Power Center)
  type SignedMode = 'off' | 'ttm' | 'lifetime';
  const [signedMode, setSignedMode] = useState<SignedMode>('off');
  // Pipeline Conversion display mode: deal-count cohort vs deal-value ($ USD) cohort.
  const [conversionMode, setConversionMode] = useState<'count' | 'dollars'>('count');
  const [pendingTrendReopen, setPendingTrendReopen] = useState<PendingTrendReopen | null>(null);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    deals: StageEntryDeal[];
    periodNote?: string;
    metricType?: 'count' | 'dollars' | 'average' | 'none';
    valueFormatter?: (v: number) => string;
    chartColor?: string;
    conversionBreakdown?: ConversionBreakdown;
    stackedFees?: boolean;
    /** When set, the modal re-derives the breakdown from the live card by id
     *  so the FCI-only toggle inside the modal updates counts instantly. */
    conversionCardId?: string;
  } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());
  const [revPerHourOpen, setRevPerHourOpen] = useState(false);
  const [openDealId, setOpenDealId] = useState<string | null>(null);

  useEffect(() => {
    if (!m.fundedInvoicedTrend.isLoading && !m.fundedInvoiced.isLoading) {
      setLastRefresh(new Date());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.fundedInvoicedTrend.isLoading, m.fundedInvoiced.isLoading, m.fundedInvoicedTrend.monthly]);

  const pickTrend = <T,>(series: { monthly: T; quarterly: T; monthlyTtm: T; quarterlyTtm: T }): T => {
    if (trendMode === 'monthly') return ttmCharts ? series.monthlyTtm : series.monthly;
    return ttmCharts ? series.quarterlyTtm : series.quarterly;
  };
  const ndaNeedsListTrendBuckets = pickTrend(m.ndaNeedsListTrend);
  const finalCreditItemsTrendBuckets = pickTrend(m.finalCreditItemsTrend);
  const fundedTrendBuckets = pickTrend(m.fundedInvoicedTrend);
  const trendPeriodLabel = ttmCharts
    ? (trendMode === 'monthly' ? 'TTM as of each of the past 6 months' : 'TTM as of each of the past 4 quarters')
    : (trendMode === 'monthly' ? 'Past 6 months' : 'Past 4 quarters');
  const ttmSuffix = ttmCharts ? ' (TTM)' : '';

  const buildTrendPeriodNote = (bucket: StageTrendBucket, metricLabel: string) =>
    `${metricLabel} · Debt Advisory Metrics → Closed + Closed Won · ${bucket.label}`;

  useEffect(() => {
    if (m.fundedInvoicedTrend.isLoading || !selectedQuarter) return;
    const reopen = consumePendingReopen(
      (entry) => entry.source === 'insights.consolidated-debt-pipeline' && entry.quarterId === selectedQuarter.value,
    );
    if (!reopen) return;
    const [metric, mode, bucketKey] = reopen.bucketKey.split('|') as [TrendMetricKey, TrendChartMode, string];
    if (mode !== trendMode) {
      setPendingTrendReopen({ metric, mode, bucketKey });
      setTrendMode(mode);
      return;
    }
    const bucket = (mode === 'monthly' ? m.fundedInvoicedTrend.monthly : m.fundedInvoicedTrend.quarterly).find((entry) => entry.key === bucketKey);
    if (!bucket) return;
    setDrilldown({
      title: `${metric === 'deals-closed' ? 'Deals Closed' : 'Dollars Funded'} — ${bucket.label}`,
      deals: bucket.deals,
      periodNote: buildTrendPeriodNote(bucket, metric === 'deals-closed' ? 'Deal count' : 'Dollar volume'),
      metricType: metric === 'deals-closed' ? 'count' : 'dollars',
      valueFormatter: metric === 'deals-closed' ? (v: number) => `${Math.round(v)}` : formatCurrency,
      chartColor: metric === 'deals-closed' ? 'hsl(var(--chart-3))' : 'hsl(var(--success))',
    });
  }, [m.fundedInvoicedTrend.isLoading, m.fundedInvoicedTrend.monthly, m.fundedInvoicedTrend.quarterly, selectedQuarter, trendMode]);

  useEffect(() => {
    if (!pendingTrendReopen || pendingTrendReopen.mode !== trendMode) return;
    const bucket = (trendMode === 'monthly' ? m.fundedInvoicedTrend.monthly : m.fundedInvoicedTrend.quarterly).find(
      (entry) => entry.key === pendingTrendReopen.bucketKey,
    );
    if (!bucket) return;
    setDrilldown({
      title: `${pendingTrendReopen.metric === 'deals-closed' ? 'Deals Closed' : 'Dollars Funded'} — ${bucket.label}`,
      deals: bucket.deals,
      periodNote: buildTrendPeriodNote(bucket, pendingTrendReopen.metric === 'deals-closed' ? 'Deal count' : 'Dollar volume'),
      metricType: pendingTrendReopen.metric === 'deals-closed' ? 'count' : 'dollars',
      valueFormatter: pendingTrendReopen.metric === 'deals-closed' ? (v: number) => `${Math.round(v)}` : formatCurrency,
      chartColor: pendingTrendReopen.metric === 'deals-closed' ? 'hsl(var(--chart-3))' : 'hsl(var(--success))',
    });
    setPendingTrendReopen(null);
  }, [m.fundedInvoicedTrend.monthly, m.fundedInvoicedTrend.quarterly, pendingTrendReopen, trendMode]);

  const formatMetricCurrency = (value: number | null) => (value == null ? 'N/A' : formatCurrency(value));
  const formatMetricCurrencyK = (value: number | null) => (value == null ? 'N/A' : formatCurrencyKOrMM(value));

  /** Build a KPI card `delta` config from an AverageMetricResult. Returns
   *  undefined when either the current or prior value is unavailable so the
   *  card renders without a delta row. */
  const buildAverageDelta = (
    metric: { value: number | null; previousValue?: number | null },
    formatDiff: (value: number) => string,
    priorLabel: string,
  ) => {
    if (metric.value == null || metric.previousValue == null) return undefined;
    const diff = metric.value - metric.previousValue;
    const pct = metric.previousValue !== 0 ? (diff / metric.previousValue) * 100 : null;
    return { diff, formatDiff, pct, priorLabel, currentValue: metric.value };
  };
  /** Signed delta of a StageMetric field (`count` or `dollarVolume`) vs its
   *  prior-period counterpart. Returns undefined while either side is loading
   *  so the card renders without a delta row until data is ready. */
  const buildStageDelta = (
    current: { count: number; dollarVolume: number; isLoading: boolean },
    prior: { count: number; dollarVolume: number; isLoading: boolean } | undefined,
    field: 'count' | 'dollarVolume',
    formatDiff: (value: number) => string,
    priorLabel = 'prior period',
  ) => {
    if (!prior || current.isLoading || prior.isLoading) return undefined;
    const cur = current[field] ?? 0;
    const prev = prior[field] ?? 0;
    const diff = cur - prev;
    const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null;
    return { diff, formatDiff, pct, priorLabel, currentValue: cur };
  };
  const formatCountDiff = (v: number) => `${Math.round(v)}`;
  const formatHourlyRate = (value: number) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.round(Math.abs(value)).toLocaleString()}/hr`;
  };

  const latestStepConversions = useMemo<QuarterlyStepConversionOverrides>(() => {
    const steps = [
      ['proposalIssued', 'finalCreditItems'],
      ['finalCreditItems', 'submittedToLenders'],
      ['submittedToLenders', 'termsIssued'],
      ['termsIssued', 'inDueDiligence'],
      ['inDueDiligence', 'fundedInvoiced'],
    ] as const;

    const out: QuarterlyStepConversionOverrides = {};
    for (const [from, to] of steps) {
      const denominator = m.ttmCounts[from];
      const reachedNumerator = m.lifetimeStageDealIds[to];
      const reachedDeals = denominator.deals.filter(deal => reachedNumerator.has(deal.deal_id));
      out[`${from}__${to}` as keyof QuarterlyStepConversionOverrides] = {
        fromCount: denominator.count,
        toCount: reachedDeals.length,
        fromDollars: denominator.deals.reduce((s, d) => s + (d.value ?? 0), 0),
        toDollars: reachedDeals.reduce((s, d) => s + (d.value ?? 0), 0),
      };
    }
    return out;
  }, [
    m.ttmCounts.proposalIssued,
    m.ttmCounts.finalCreditItems,
    m.ttmCounts.submittedToLenders,
    m.ttmCounts.termsIssued,
    m.ttmCounts.inDueDiligence,
    m.ttmCounts.fundedInvoiced,
    m.lifetimeStageDealIds.finalCreditItems,
    m.lifetimeStageDealIds.submittedToLenders,
    m.lifetimeStageDealIds.termsIssued,
    m.lifetimeStageDealIds.inDueDiligence,
    m.lifetimeStageDealIds.fundedInvoiced,
  ]);

  if (!selectedQuarter) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a quarter from the dashboard header to view Debt Advisory Metrics metrics.
      </div>
    );
  }

  const sections: SectionDef[] = [
    {
      id: 'sales',
      title: 'Sales',
      description: '',
      cards: [
        {
          id: 'deals-on-board',
          title: 'Deals on the Board',
          icon: Briefcase,
          value: m.ndaNeedsList.count,
          isLoading: m.ndaNeedsList.isLoading,
          deals: m.ndaNeedsList.deals,
          color: 'hsl(var(--primary))',
          drilldownTitle: 'Deals on the Board — added to Active Pipeline',
          drilldownMetricType: 'count',
          delta: buildStageDelta(m.ndaNeedsList, m.priors.ndaNeedsList, 'count', formatCountDiff),
          secondary: {
            value: formatCurrency(m.ndaNeedsList.dollarVolume),
            isLoading: m.ndaNeedsList.isLoading,
            deals: m.ndaNeedsList.deals,
            color: 'hsl(var(--chart-2))',
            drilldownTitle: 'Dollars on the Board — added to Active Pipeline',
            drilldownMetricType: 'dollars',
            delta: buildStageDelta(m.ndaNeedsList, m.priors.ndaNeedsList, 'dollarVolume', formatCurrency),
          },
        },
        {
          id: 'proposals-issued',
          title: 'Proposals Issued',
          icon: Briefcase,
          value: m.proposalsIssued.count,
          isLoading: m.proposalsIssued.isLoading,
          deals: m.proposalsIssued.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Proposals Issued — entered Proposal Issued',
          drilldownMetricType: 'count',
          delta: buildStageDelta(m.proposalsIssued, m.priors.proposalsIssued, 'count', formatCountDiff),
          secondary: {
            value: formatCurrency(m.proposalsIssued.dollarVolume),
            isLoading: m.proposalsIssued.isLoading,
            deals: m.proposalsIssued.deals,
            color: 'hsl(var(--chart-4))',
            drilldownTitle: 'Dollars Proposed — entered Proposal Issued',
            drilldownMetricType: 'dollars',
            delta: buildStageDelta(m.proposalsIssued, m.priors.proposalsIssued, 'dollarVolume', formatCurrency),
          },
        },
        {
          id: 'debt-deals-signed',
          title: 'Debt Deals Signed',
          icon: Briefcase,
          value: m.finalCreditItems.count,
          isLoading: m.finalCreditItems.isLoading,
          deals: m.finalCreditItems.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Debt Deals Signed — entered Signed',
          drilldownMetricType: 'count',
          delta: buildStageDelta(m.finalCreditItems, m.priors.finalCreditItems, 'count', formatCountDiff),
          secondary: {
            value: formatCurrency(m.finalCreditItems.dollarVolume),
            isLoading: m.finalCreditItems.isLoading,
            deals: m.finalCreditItems.deals,
            color: 'hsl(var(--success))',
            drilldownTitle: 'Dollars Signed — entered Signed',
            drilldownMetricType: 'dollars',
            delta: buildStageDelta(m.finalCreditItems, m.priors.finalCreditItems, 'dollarVolume', formatCurrency),
          },
        },
        {
          id: 'terms-issued',
          title: 'Terms Issued',
          icon: Briefcase,
          value: m.termsIssued.count,
          isLoading: m.termsIssued.isLoading,
          deals: m.termsIssued.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Terms Issued — entered Terms Issued',
          drilldownMetricType: 'count',
          delta: buildStageDelta(m.termsIssued, m.priors.termsIssued, 'count', formatCountDiff),
          secondary: {
            value: formatCurrency(m.termsIssued.dollarVolume),
            isLoading: m.termsIssued.isLoading,
            deals: m.termsIssued.deals,
            color: 'hsl(var(--chart-2))',
            drilldownTitle: 'Terms Issued $ — entered Terms Issued',
            drilldownMetricType: 'dollars',
            delta: buildStageDelta(m.termsIssued, m.priors.termsIssued, 'dollarVolume', formatCurrency),
          },
        },
        {
          id: 'terms-signed',
          title: 'Terms Signed',
          icon: Briefcase,
          value: m.inDueDiligence.count,
          isLoading: m.inDueDiligence.isLoading,
          deals: m.inDueDiligence.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Terms Signed — entered In Due Diligence',
          drilldownMetricType: 'count',
          delta: buildStageDelta(m.inDueDiligence, m.priors.inDueDiligence, 'count', formatCountDiff),
          secondary: {
            value: formatCurrency(m.inDueDiligence.dollarVolume),
            isLoading: m.inDueDiligence.isLoading,
            deals: m.inDueDiligence.deals,
            color: 'hsl(var(--chart-4))',
            drilldownTitle: 'Terms Signed $ — entered In Due Diligence',
            drilldownMetricType: 'dollars',
            delta: buildStageDelta(m.inDueDiligence, m.priors.inDueDiligence, 'dollarVolume', formatCurrency),
          },
        },
        {
          id: 'deals-closed',
          title: 'Deals Closed',
          icon: Briefcase,
          value: m.fundedInvoicedOnly.count,
          isLoading: m.fundedInvoicedOnly.isLoading,
          deals: m.fundedInvoicedOnly.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Deals Closed — entered Closed',
          drilldownMetricType: 'count',
          delta: buildStageDelta(m.fundedInvoicedOnly, m.priors.fundedInvoicedOnly, 'count', formatCountDiff),
          secondary: {
            value: formatCurrency(m.fundedInvoicedOnly.dollarVolume),
            isLoading: m.fundedInvoicedOnly.isLoading,
            deals: m.fundedInvoicedOnly.deals,
            color: 'hsl(var(--success))',
            drilldownTitle: 'Dollars Funded — entered Closed',
            drilldownMetricType: 'dollars',
            delta: buildStageDelta(m.fundedInvoicedOnly, m.priors.fundedInvoicedOnly, 'dollarVolume', formatCurrency),
          },
        },
      ],
    },
    {
      id: 'averages',
      title: '',
      description: '',
      cards: [
        {
          id: 'average-deal-on-board',
          title: 'Average Deal on the Board',
          icon: Sigma,
          value: formatMetricCurrency(m.averageDealOnBoard.value),
          isLoading: m.averageDealOnBoard.isLoading,
          deals: m.averageDealOnBoard.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Average Deal on the Board — added to Active Pipeline',
          drilldownPeriodNote: 'Selected period · Dollars on the Board ÷ Deals on the Board',
          drilldownMetricType: 'average',
          delta: buildAverageDelta(m.averageDealOnBoard, formatCurrency, 'prior period'),
        },
        {
          id: 'average-deal-signed',
          title: 'Average Deal Signed',
          icon: Sigma,
          value: formatMetricCurrency(m.averageDealSigned.value),
          isLoading: m.averageDealSigned.isLoading,
          deals: m.averageDealSigned.deals,
          color: 'hsl(var(--chart-1))',
          drilldownTitle: 'Average Deal Signed — entered Signed',
          drilldownPeriodNote: 'Trailing 6 months · based on stage-entry deal volume ÷ deal count',
          drilldownMetricType: 'average',
          delta: buildAverageDelta(m.averageDealSigned, formatCurrency, 'prior 6 months'),
        },
        {
          id: 'average-revenue-per-deal-signed',
          title: 'Average Revenue per Deal Signed',
          icon: Sigma,
          value: formatMetricCurrencyK(m.averageRevenuePerDealSigned.value),
          isLoading: m.averageRevenuePerDealSigned.isLoading,
          deals: m.averageRevenuePerDealSigned.deals,
          color: 'hsl(var(--chart-3))',
          drilldownTitle: 'Average Revenue per Deal Signed — Signed',
          drilldownPeriodNote: 'Trailing 12 months revenue ÷ trailing 12 months signed-deal count',
          drilldownMetricType: 'none',
          delta: buildAverageDelta(m.averageRevenuePerDealSigned, formatCurrencyKOrMM, 'prior 12 months'),
        },
        {
          id: 'average-deal-closed',
          title: 'Average Deal Closed',
          icon: Sigma,
          value: formatMetricCurrency(m.averageDealClosed.value),
          isLoading: m.averageDealClosed.isLoading,
          deals: m.averageDealClosed.deals,
          color: 'hsl(var(--chart-2))',
          drilldownTitle: 'Average Deal Closed — entered Closed',
          drilldownPeriodNote: 'Trailing 6 months · based on stage-entry deal volume ÷ deal count',
          drilldownMetricType: 'average',
          delta: buildAverageDelta(m.averageDealClosed, formatCurrency, 'prior 6 months'),
        },
        {
          id: 'average-revenue-per-deal-closed',
          title: 'Average Revenue per Deal Closed',
          icon: Sigma,
          value: formatMetricCurrencyK(m.averageRevenuePerDealClosed.value),
          isLoading: m.averageRevenuePerDealClosed.isLoading,
          deals: m.averageRevenuePerDealClosed.deals,
          color: 'hsl(var(--chart-5))',
          drilldownTitle: 'Average Revenue per Deal Closed — Closed',
          drilldownPeriodNote: 'Trailing 12 months revenue ÷ trailing 12 months funded-deal count',
          drilldownMetricType: 'none',
          delta: buildAverageDelta(m.averageRevenuePerDealClosed, formatCurrencyKOrMM, 'prior 12 months'),
        },
        {
          id: 'revenue-per-deal-hour',
          title: 'Revenue per Deal Hour',
          icon: Sigma,
          value: m.revenuePerDealHour.value == null
            ? 'N/A'
            : `$${Math.round(m.revenuePerDealHour.value).toLocaleString()}/hr`,
          isLoading: m.revenuePerDealHour.isLoading,
          deals: m.revenuePerDealHour.deals,
          color: 'hsl(var(--chart-4))',
          drilldownTitle: 'Revenue per Deal Hour',
          drilldownPeriodNote: 'Trailing 12 months 5th Line Capital Advisors revenue ÷ hours logged on Active Pipeline + In Development deals',
          drilldownMetricType: 'none',
          delta: buildAverageDelta(m.revenuePerDealHour, formatHourlyRate, 'prior 12 months'),
        },
      ],
    },
    {
      id: 'pipeline-conversion',
      title: 'Pipeline Conversion',
      description: 'Trailing 12 months stage-to-stage conversion rates',
      cards: (() => {
        // Per-card denominator-anchored conversion filter.
        //
        // Each conversion card has a NUMERATOR stage (e.g. Terms Issued) and a
        // DENOMINATOR stage (e.g. Submitted to Lenders). The toggle restricts
        // the numerator to deals that ALSO passed through THAT card's own
        // denominator stage:
        //   'off'      → raw stage-entry counts (no passthrough filter)
        //   'ttm'      → numerator deal must have entered the denominator
        //                stage inside the trailing 12-month window
        //   'lifetime' → numerator deal must have entered the denominator
        //                stage at any point in its history (includes deals
        //                whose denominator event predates the TTM window)
        //
        // The denominator itself is the anchor — always shown unfiltered.
        const t = m.ttmCounts;
        const loading = t.isLoading || m.lifetimeStageDealIds.isLoading;
        const STAGE_LABELS = {
          proposalIssued: 'Proposal Issued',
          finalCreditItems: 'Signed',
          submittedToLenders: 'Submitted',
          termsIssued: 'Terms Issued',
          inDueDiligence: 'In Due Diligence (Terms Signed)',
          fundedInvoiced: 'Closed',
        } as const;
        const SHORT_LABELS: Record<StageKey, string> = {
          proposalIssued: 'Proposal Issued',
          finalCreditItems: 'Signed',
          submittedToLenders: 'Submitted',
          termsIssued: 'Terms Issued',
          inDueDiligence: 'Terms Signed',
          fundedInvoiced: 'Closed',
        };
        type StageKey = keyof typeof STAGE_LABELS;
        const pctText = (num: number, den: number) =>
          loading ? '…' : den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';
        const defs: Array<{ title: string; numKey: StageKey; denKey: StageKey }> = [
          { title: 'Proposal to Signed',                numKey: 'finalCreditItems',    denKey: 'proposalIssued' },
          { title: 'Signed to Submission',              numKey: 'submittedToLenders',  denKey: 'finalCreditItems' },
          { title: 'Submission to Terms Issued',        numKey: 'termsIssued',         denKey: 'submittedToLenders' },
          { title: 'Signed to Terms Issued',            numKey: 'termsIssued',         denKey: 'finalCreditItems' },
          { title: 'Signed to Terms Signed',            numKey: 'inDueDiligence',      denKey: 'finalCreditItems' },
          { title: 'Submission to Terms Signed',        numKey: 'inDueDiligence',      denKey: 'submittedToLenders' },
          { title: 'Terms Issued to Terms Signed',      numKey: 'inDueDiligence',      denKey: 'termsIssued' },
          { title: 'Terms Signed to Closed',            numKey: 'fundedInvoiced',      denKey: 'inDueDiligence' },
          { title: 'Deal Signed to Closed & Funded',   numKey: 'fundedInvoiced',      denKey: 'finalCreditItems' },
          { title: 'Submission to Closed',              numKey: 'fundedInvoiced',      denKey: 'submittedToLenders' },
        ];
        return defs.map((d, i) => {
          const den = t[d.denKey];
          const numShort = SHORT_LABELS[d.numKey];
          const numLabel = STAGE_LABELS[d.numKey];
          const denLabel = STAGE_LABELS[d.denKey];
          const denShort = SHORT_LABELS[d.denKey];
          // Cohort tracking: of the deals that entered the DENOMINATOR stage
          // in the last 12 months, how many EVER progressed to the NUMERATOR
          // stage (any time — including after the TTM window).
          const reachedNumIds = m.lifetimeStageDealIds[d.numKey];
          const numDeals = den.deals.filter(dl => reachedNumIds.has(dl.deal_id));
          const num = {
            deals: numDeals,
            count: numDeals.length,
            dollarVolume: numDeals.reduce((s, dl) => s + (dl.value ?? 0), 0),
          };
          const denDollars = den.deals.reduce((s, dl) => s + (dl.value ?? 0), 0);
          const value = conversionMode === 'dollars'
            ? pctText(num.dollarVolume, denDollars)
            : pctText(num.count, den.count);
          // Period-over-period conversion change: latest completed quarter vs prior.
          const latestQ = quarterlyFunnel.quarters[0];
          const prevQ = quarterlyFunnel.quarters[1];
          const stepKey = `${d.denKey}__${d.numKey}` as const;
          const pctFor = (q: typeof latestQ | undefined) => {
            if (!q) return null;
            const s = q.allConversions[stepKey];
            if (!s) return null;
            const from = conversionMode === 'dollars' ? s.fromDollars : s.fromCount;
            const to = conversionMode === 'dollars' ? s.toDollars : s.toCount;
            return from > 0 ? (to / from) * 100 : null;
          };
          const latestPct = pctFor(latestQ);
          const prevPct = pctFor(prevQ);
          const changePct = !quarterlyFunnel.isLoading && latestPct != null && prevPct != null && latestQ && prevQ
            ? {
                delta: latestPct - prevPct,
                latestPct,
                prevPct,
                latestLabel: latestQ.label,
                prevLabel: prevQ.label,
              }
            : undefined;
          const formula = conversionMode === 'dollars'
            ? `($ of deals that entered ${denLabel} in the last 12 months and ever reached ${numLabel}) ÷ ` +
              `($ of deals that entered ${denLabel} in the last 12 months) = ` +
              `${formatCurrency(num.dollarVolume)} ÷ ${formatCurrency(denDollars)} = ${value}`
            : `(Deals that entered ${denLabel} in the last 12 months and ever reached ${numLabel}) ÷ ` +
              `(Deals that entered ${denLabel} in the last 12 months) = ` +
              `${num.count} ÷ ${den.count} = ${value}`;
          return {
            id: `conversion-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`,
            title: d.title,
            icon: Sigma,
            value,
            isLoading: loading,
            deals: den.deals,
            color: `hsl(var(--chart-${(i % 5) + 1}))`,
            drilldownTitle: d.title,
            drilldownPeriodNote: undefined,
            drilldownMetricType: 'none' as const,
            conversionBreakdown: {
              formula,
              numeratorLabel: conversionMode === 'dollars'
                ? `$ of deals that entered ${denLabel} (TTM) and ever reached ${numShort}`
                : `Entered ${denLabel} (TTM) and ever reached ${numShort}`,
              denominatorLabel: conversionMode === 'dollars'
                ? `$ of deals that entered ${denLabel} (TTM)`
                : `Entered ${denLabel} (TTM)`,
              numeratorDeals: num.deals,
              denominatorDeals: den.deals,
              numeratorCount: conversionMode === 'dollars' ? num.dollarVolume : num.count,
              denominatorCount: conversionMode === 'dollars' ? denDollars : den.count,
              percentText: value,
            },
            signedAnchorLabel: denShort,
            changePct,
          };
        });
      })(),
    },
  ];

  // Split off a subset of conversion tiles into a separate "Other Metrics"
  // section that renders below Financial Performance. Keeps the primary
  // Pipeline Conversion grid focused on the headline funnel steps.
  const OTHER_METRICS_TITLES = new Set<string>([
    'Signed to Submission',
    'Signed to Terms Issued',
    'Signed to Terms Signed',
    'Submission to Terms Signed',
    'Submission to Closed',
  ]);
  const conversionIdx = sections.findIndex(s => s.id === 'pipeline-conversion');
  const otherMetricsCards = conversionIdx >= 0
    ? sections[conversionIdx].cards.filter(c => OTHER_METRICS_TITLES.has(c.title))
    : [];
  if (conversionIdx >= 0) {
    sections[conversionIdx] = {
      ...sections[conversionIdx],
      cards: sections[conversionIdx].cards.filter(c => !OTHER_METRICS_TITLES.has(c.title)),
    };
  }
  const otherMetricsSection: SectionDef = {
    id: 'other-metrics',
    title: 'Other Metrics',
    description: 'Supplementary trailing-12-month conversion rates',
    cards: otherMetricsCards,
  };

  // Total Revenue Opportunity: sum of `total_fee` across current Active
  // Pipeline deals in stages Final Credit Items → In Due Diligence.
  otherMetricsSection.cards = [
    ...otherMetricsSection.cards,
    {
      id: 'total-revenue-opportunity',
      title: 'Total Revenue Opportunity',
      icon: DollarSign,
      value: formatCurrency(totalRevenueOpportunity.dollarVolume),
      isLoading: totalRevenueOpportunity.isLoading,
      deals: totalRevenueOpportunity.deals,
      color: 'hsl(var(--chart-2))',
      drilldownTitle: 'Total Revenue Opportunity',
      drilldownMetricType: 'dollars' as const,
      drilldownValueFormatter: formatCurrency,
      drilldownStackedFees: true,
    },
    {
      id: 'terms-conversion-rate',
      title: 'Terms Conversion Rate',
      icon: Sigma,
      value: termsConversionRate.value,
      isLoading: termsConversionRate.isLoading,
      deals: [],
      color: 'hsl(var(--chart-3))',
      drilldownTitle: 'Terms Conversion Rate',
      drilldownMetricType: 'none' as const,
      conversionBreakdown: {
        formula:
          '(Funding sources at Terms Issued or later) ÷ (Total funding sources added) on deals that entered ' +
          `Submitted to Lenders / Lenders in Review in the last 12 months = ${termsConversionRate.numerator} ÷ ` +
          `${termsConversionRate.denominator} = ${termsConversionRate.value}`,
        numeratorLabel: 'Funding sources that reached Terms Issued or later',
        denominatorLabel: 'Total funding sources added (TTM qualifying deals)',
        numeratorDeals: termsConversionRate.numeratorDeals,
        denominatorDeals: termsConversionRate.denominatorDeals,
        numeratorCount: termsConversionRate.numerator,
        denominatorCount: termsConversionRate.denominator,
        percentText: termsConversionRate.value,
      },
    },

    {
      id: 'avg-term-sheets-per-deal',
      title: 'Avg. Term Sheets / Deal',
      icon: Sigma,
      value: termsConversionRate.avgValue,
      isLoading: termsConversionRate.isLoading,
      deals: [],
      color: 'hsl(var(--chart-4))',
      drilldownTitle: 'Avg. Term Sheets / Deal',
      drilldownMetricType: 'none' as const,
      conversionBreakdown: {
        formula:
          '(Funding sources at Terms Issued or later) ÷ (Deals that entered Submitted to Lenders / Lenders in ' +
          `Review in the last 12 months) = ${termsConversionRate.numerator} ÷ ${termsConversionRate.dealCount} = ` +
          `${termsConversionRate.avgValue}`,
        numeratorLabel: 'Funding sources that reached Terms Issued or later',
        denominatorLabel: 'TTM qualifying deals',
        numeratorDeals: termsConversionRate.numeratorDeals,
        denominatorDeals: [],
        numeratorCount: termsConversionRate.numerator,
        denominatorCount: termsConversionRate.dealCount,
        percentText: termsConversionRate.avgValue,
      },
    },
  ];


  return (
    <div className="space-y-6">
      <ComparisonModeContext.Provider value={comparisonCtx}>
      <OpenDealContext.Provider value={setOpenDealId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterMultiSelect
            label="Owner"
            options={ownerOptions}
            selected={selectedOwners}
            onChange={setSelectedOwners}
            searchable
            emptyText="No deal owners"
          />
          <FilterMultiSelect
            label="Manager"
            options={managerOptions}
            selected={selectedManagers}
            onChange={setSelectedManagers}
            searchable
            emptyText="No deal managers"
          />
          {allowedDealIds && (
            <span className="text-xs text-muted-foreground">
              {allowedDealIds.size} deal{allowedDealIds.size === 1 ? '' : 's'} matched
            </span>
          )}
        </div>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'cards' | 'table')}>
          <TabsList className="bg-muted/40 border border-border/40">
            <TabsTrigger value="cards" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-1.5">
              <TableIcon className="h-3.5 w-3.5" /> Table
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === 'table' ? (
        <PipelineMatrixTable
          sections={sections}
          selectedQuarter={selectedQuarter}
          onCellClick={(card, bucket) => {
            const metricType = card.drilldownMetricType ?? 'dollars';
            setDrilldown({
              title: bucket
                ? `${card.drilldownTitle} — ${bucket.label}`
                : card.drilldownTitle,
              deals: bucket ? bucket.deals : card.deals,
              periodNote: card.drilldownPeriodNote,
              metricType,
              valueFormatter: card.drilldownValueFormatter
                ?? (metricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
              chartColor: card.drilldownChartColor ?? card.color,
              conversionBreakdown: bucket ? undefined : card.conversionBreakdown,
              conversionCardId: bucket ? undefined : (card.conversionBreakdown ? card.id : undefined),
            });
          }}
        />
      ) : (
        sections.map(section => (
        <Fragment key={section.id}>
        <div className="space-y-3">
          {(section.title || section.description || section.id === 'pipeline-conversion') && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                {section.title && (
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    {section.title}
                  </h3>
                )}
                {section.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                )}
              </div>
              {section.id === 'pipeline-conversion' && (
                <div
                  className="inline-flex rounded-md p-1"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
                  role="tablist"
                  aria-label="Conversion basis"
                >
                  {(['count', 'dollars'] as const).map(k => {
                    const active = conversionMode === k;
                    return (
                      <button
                        key={k}
                        role="tab"
                        aria-selected={active}
                        onClick={() => setConversionMode(k)}
                        className={cn(
                          'h-7 px-3 rounded text-xs font-medium transition-colors',
                          active
                            ? 'bg-primary/20 text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                        )}
                      >
                        {k === 'count' ? '# Deals' : '$ Value'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {(() => {
            const rows = [section.cards];
            // Sales KPI grid is the canonical tile-sizing template. Averages
            // reuses the exact same grid so each tile lines up with a Sales
            // column instead of stretching to fill a wider 4-col layout.
            const gridClass =
              section.id === 'sales' || section.id === 'averages'
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2'
                : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2';
            // Pipeline Conversion: stack tiles single-column on the left with a
            // trailing-12-month funnel chart on the right.
            if (section.id === 'pipeline-conversion') {
              return (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3">
                  <div className="flex flex-col gap-2">
                    {section.cards.map(card => (
                      <MetricKPICard
                        key={card.id}
                        config={card}
                        onClick={() => setDrilldown({
                          title: card.drilldownTitle,
                          deals: card.deals,
                          periodNote: card.drilldownPeriodNote,
                          metricType: card.drilldownMetricType ?? 'dollars',
                          valueFormatter: card.drilldownValueFormatter
                            ?? (card.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                          chartColor: card.drilldownChartColor ?? card.color,
                          conversionBreakdown: card.conversionBreakdown,
                          conversionCardId: card.conversionBreakdown ? card.id : undefined,
                        })}
                      />
                    ))}
                  </div>
                  <QuarterlyConversionFunnelChart
                    latestStepConversions={latestStepConversions}
                    mode={conversionMode}
                  />
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {rows.map((rowCards, idx) => (
                  <div key={idx} className={gridClass}>
                    {rowCards.map(card => (
                      <MetricKPICard
                        key={card.id}
                        config={card}
                        onClick={() => {
                          if (card.id === 'revenue-per-deal-hour') {
                            setRevPerHourOpen(true);
                            return;
                          }
                          setDrilldown({
                          title: card.drilldownTitle,
                          deals: card.deals,
                          periodNote: card.drilldownPeriodNote,
                          metricType: card.drilldownMetricType ?? 'dollars',
                          valueFormatter: card.drilldownValueFormatter
                            ?? (card.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                          chartColor: card.drilldownChartColor ?? card.color,
                          conversionBreakdown: card.conversionBreakdown,
                          conversionCardId: card.conversionBreakdown ? card.id : undefined,
                          });
                        }}
                        onSecondaryClick={card.secondary ? () => {
                          const s = card.secondary!;
                          setDrilldown({
                            title: s.drilldownTitle,
                            deals: s.deals,
                            periodNote: s.drilldownPeriodNote,
                            metricType: s.drilldownMetricType ?? 'dollars',
                            valueFormatter: s.drilldownValueFormatter
                              ?? (s.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                            chartColor: s.drilldownChartColor ?? s.color ?? card.color,
                          });
                        } : undefined}
                      />
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {section.id === 'pipeline-conversion' && <PipelineVelocitySection />}
        </Fragment>
        ))
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div />
          <div className="flex justify-end items-center gap-2">
            <button
              type="button"
              onClick={() => setTtmCharts((v) => !v)}
              aria-pressed={ttmCharts}
              title={ttmCharts
                ? 'TTM on — each bar shows the trailing-12-month rollup ending at that period'
                : 'Show trailing-12-month rollups anchored at each period end'}
              className={
                'group inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border transition-all ' +
                (ttmCharts
                  ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_4px_14px_-4px_hsl(var(--primary)/0.55)]'
                  : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:border-border')
              }
            >
              <span
                className={
                  'inline-block h-1.5 w-1.5 rounded-full transition-colors ' +
                  (ttmCharts ? 'bg-primary-foreground shadow-[0_0_6px_hsl(var(--primary-foreground)/0.9)]' : 'bg-muted-foreground/50')
                }
                aria-hidden
              />
              TTM
              {ttmCharts && <span className="text-[10px] font-medium opacity-80">ON</span>}
            </button>
            <Tabs value={trendMode} onValueChange={(value) => setTrendMode(value as TrendChartMode)}>
              <TabsList className="bg-muted/40 border border-border/40">
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompactFundedBarChart
            title={`Deals on Board${ttmSuffix}`}
            subtitle={`Debt Advisory Metrics → NDA / Needs List Sent · ${trendPeriodLabel}`}
            buckets={ndaNeedsListTrendBuckets}
            isLoading={m.ndaNeedsListTrend.isLoading}
            color="hsl(var(--chart-2))"
            dataKey="count"
            valueFormatter={(value) => `${Math.round(value)}`}
            totalFormatter={(value) => `${Math.round(value)}`}
            planWidgetKey="deals-on-board"
            onBarClick={(bucket) =>
              setDrilldown({
                title: `Deals on Board${ttmSuffix} — ${bucket.label}`,
                deals: bucket.deals,
                periodNote: buildTrendPeriodNote(bucket, ttmCharts ? 'Deal count (TTM)' : 'Deal count'),
              })
            }
          />
          <CompactFundedBarChart
            title={`Deals Signed${ttmSuffix}`}
            subtitle={`Debt Advisory Metrics → Final Credit Items · ${trendPeriodLabel}`}
            buckets={finalCreditItemsTrendBuckets}
            isLoading={m.finalCreditItemsTrend.isLoading}
            color="hsl(var(--chart-4))"
            dataKey="count"
            valueFormatter={(value) => `${Math.round(value)}`}
            totalFormatter={(value) => `${Math.round(value)}`}
            planWidgetKey="deals-signed"
            onBarClick={(bucket) =>
              setDrilldown({
                title: `Deals Signed${ttmSuffix} — ${bucket.label}`,
                deals: bucket.deals,
                periodNote: buildTrendPeriodNote(bucket, ttmCharts ? 'Deal count (TTM)' : 'Deal count'),
              })
            }
          />
        </div>
      </div>

      <div className="space-y-3 -mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CompactFundedBarChart
            title={`Deals Closed${ttmSuffix}`}
            subtitle={`Debt Advisory Metrics → Closed + Closed Won · ${trendPeriodLabel}`}
            buckets={fundedTrendBuckets}
            isLoading={m.fundedInvoicedTrend.isLoading}
            color="hsl(var(--chart-3))"
            dataKey="count"
            valueFormatter={(value) => `${Math.round(value)}`}
            totalFormatter={(value) => `${Math.round(value)}`}
            planWidgetKey="deals-closed"
            onBarClick={(bucket) =>
              setDrilldown({
                title: `Deals Closed${ttmSuffix} — ${bucket.label}`,
                deals: bucket.deals,
                periodNote: buildTrendPeriodNote(bucket, ttmCharts ? 'Deal count (TTM)' : 'Deal count'),
              })
            }
          />
          <CompactFundedBarChart
            title={`Dollars Funded${ttmSuffix}`}
            subtitle={`Debt Advisory Metrics → Closed + Closed Won · ${trendPeriodLabel}`}
            buckets={fundedTrendBuckets}
            isLoading={m.fundedInvoicedTrend.isLoading}
            color="hsl(var(--success))"
            dataKey="dollarVolume"
            valueFormatter={formatCurrency}
            totalFormatter={formatCurrency}
            planWidgetKey="dollars-funded"
            onBarClick={(bucket) =>
              setDrilldown({
                title: `Dollars Funded${ttmSuffix} — ${bucket.label}`,
                deals: bucket.deals,
                periodNote: buildTrendPeriodNote(bucket, ttmCharts ? 'Dollar volume (TTM)' : 'Dollar volume'),
              })
            }
          />
        </div>

      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Financial Performance</h3>
        </div>
        <PnlFourChartsSection
          realmId={DEBT_ADVISORY_REALM_ID}
          cashflowTitle="Debt Advisory Cashflow"
          halfWidthCashflow
        />
      </div>

      {(otherMetricsSection.cards.length > 0 || AVG_TIME_TILES.length > 0) && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                {otherMetricsSection.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{otherMetricsSection.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {otherMetricsSection.cards.map(card => (
              <MetricKPICard
                key={card.id}
                config={card}
                onClick={() => setDrilldown({
                  title: card.drilldownTitle,
                  deals: card.deals,
                  periodNote: card.drilldownPeriodNote,
                  metricType: card.drilldownMetricType ?? 'dollars',
                  valueFormatter: card.drilldownValueFormatter
                    ?? (card.drilldownMetricType === 'count' ? (v: number) => `${Math.round(v)}` : formatCurrency),
                  chartColor: card.drilldownChartColor ?? card.color,
                  conversionBreakdown: card.conversionBreakdown,
                  conversionCardId: card.conversionBreakdown ? card.id : undefined,
                  stackedFees: card.drilldownStackedFees,
                })}
              />
            ))}
          </div>
          <div className="pt-2">
            <p className="text-[11px] text-muted-foreground mb-2">
              Average time between Active Pipeline stage entries (trailing 12 months).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {AVG_TIME_TILES.map(t => (
                <AvgTimeTile
                  key={t.id}
                  title={t.title}
                  color={t.color}
                  fromVariants={t.from}
                  toVariants={t.to}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {(() => {
        // Re-derive the live breakdown from the currently-rendered conversion
        // card so the FCI-only toggle inside the modal updates counts and
        // deal lists instantly (drilldown state was captured at click time).
        const liveBreakdown = (() => {
          if (!drilldown?.conversionCardId) return drilldown?.conversionBreakdown;
          const conv = sections.find(s => s.id === 'pipeline-conversion');
          const card =
            conv?.cards.find(c => c.id === drilldown.conversionCardId)
            ?? otherMetricsSection.cards.find(c => c.id === drilldown.conversionCardId);
          return card?.conversionBreakdown ?? drilldown?.conversionBreakdown;
        })();
        return (
          <DrilldownModal
            open={!!drilldown}
            onClose={() => setDrilldown(null)}
            title={drilldown?.title ?? ''}
            deals={drilldown?.deals ?? []}
            periodNote={drilldown?.periodNote}
            selectedQuarter={selectedQuarter}
            metricType={drilldown?.metricType}
            valueFormatter={drilldown?.valueFormatter}
            chartColor={drilldown?.chartColor}
            conversionBreakdown={liveBreakdown}
            stackedFees={drilldown?.stackedFees}
            signedMode={undefined}
            onSignedModeChange={undefined}
            signedAnchorLabel={(() => {
              if (!drilldown?.conversionCardId) return undefined;
              const conv = sections.find(s => s.id === 'pipeline-conversion');
              return (
                conv?.cards.find(c => c.id === drilldown.conversionCardId)?.signedAnchorLabel
                ?? otherMetricsSection.cards.find(c => c.id === drilldown.conversionCardId)?.signedAnchorLabel
              );
            })()}
          />
        );
      })()}

      <div className="pt-2 text-[10px] text-muted-foreground/70 font-mono">
        data source: deal_stage_history · source: all · last refresh: {lastRefresh.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' })}
      </div>
      <RevenuePerHourDrilldownDialog
        open={revPerHourOpen}
        onClose={() => setRevPerHourOpen(false)}
      />
      <NaitiveDealOverlay
        deal={openDealId ? ({ id: openDealId, company: 'Deal' } as unknown as Deal) : null}
        orderedDeals={[]}
        stages={[]}
        onClose={() => setOpenDealId(null)}
        onNavigate={(d) => setOpenDealId(d.id)}
        onStageChange={() => { /* stage changes handled inside embedded deal detail */ }}
      />
      </OpenDealContext.Provider>
      </ComparisonModeContext.Provider>
    </div>
  );
}
