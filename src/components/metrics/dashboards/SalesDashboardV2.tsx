import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { filterSalesCallEventsForVariant, isSalesCallEventForVariant, useSalesCallsCount } from '@/hooks/useSalesCallsCount';
import { useDealsOnBoardByMonth, type DealOnBoardEntry } from '@/hooks/useDealsOnBoardByMonth';
import { useProposalsIssuedByMonth, type ProposalIssuedEntry } from '@/hooks/useProposalsIssuedByMonth';
import {
  useFinservDealsOnBoardByMonth,
  useFinservProposalsIssuedByMonth,
  type FinservStageEntry,
} from '@/hooks/useFinservStageEntryByMonth';
import { useDollarsSignedByMonth } from '@/hooks/useDollarsSignedByMonth';
import { useStageEntryCount, useStageEntryEvents } from '@/hooks/useStageEntryCounts';
import { useMasterPlanMonthly } from '@/hooks/useMasterPlanMonthly';
import {
  buildQuarterOptions,
  getCurrentQuarter,
  buildCustomPeriod,
  type QuarterOption,
} from '@/hooks/useQBQuarterlyRevenue';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDashboardPeriod } from '@/components/metrics/DashboardPeriodPicker';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { SalesTeamBoardKpiGrid } from '@/components/metrics/dashboards/SalesTeamBoardDashboard';
import { ShareReportDialog } from '@/components/metrics/dashboards/ShareReportDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Bar,
  ComposedChart,
  Legend,
  LabelList,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  BarChart3,
  Layers,
  FileText,
  Settings,
  Phone,
  Target,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Radio,
  Table2,
  X,
  Save,
  Info,
  TrendingUp,
  Share2,
} from 'lucide-react';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Sales Dashboard-V2 — faithful build of the 5th Line approved prototype.
 * Self-contained, derives all values from PLAN/ACTUAL arrays below.
 * Uses platform font (inherited), tabular-nums on all numeric values.
 */

// ============================================================
// DATA — Jan–Sep 2026 (actuals exist for Jan–Jun only)
// ============================================================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'] as const;
const MONTHS_ALL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const;
const ELAPSED = 6;

// Calendar-month indexed (0=Jan ... 8=Sep) seeded data covers 2026 only.
const SEED_YEAR = 2026;
const SEED_MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

type MetricKey =
  | 'salesCalls'
  | 'dealsOnBoard'
  | 'dollarsOnBoard'
  | 'proposalsIssued'
  | 'dollarsProposed'
  | 'clientsSigned'
  | 'dollarsSigned'
  | 'clientsReceivingTerms'
  | 'termsSigned'
  | 'volumeOfTermsSigned'
  | 'dealsClosed'
  | 'dollarsFunded'
  | 'finservProposalsIssued'
  | 'finservDollarsProposed';

interface RowDef {
  key: MetricKey;
  label: string;
  type: 'count' | 'money';
  bold?: boolean;
}

const ROW_ORDER: RowDef[] = [
  { key: 'salesCalls', label: 'Sales Calls', type: 'count' },
  { key: 'dealsOnBoard', label: 'Deals on Board', type: 'count' },
  { key: 'dollarsOnBoard', label: 'Dollars on Board', type: 'money' },
  { key: 'proposalsIssued', label: 'Proposals Issued', type: 'count' },
  { key: 'dollarsProposed', label: 'Dollars Proposed', type: 'money' },
  { key: 'clientsSigned', label: 'Clients Signed', type: 'count' },
  { key: 'dollarsSigned', label: 'Dollars Signed', type: 'money' },
  { key: 'clientsReceivingTerms', label: 'Clients Receiving Terms', type: 'count' },
  { key: 'termsSigned', label: 'Terms Signed', type: 'count' },
  { key: 'volumeOfTermsSigned', label: 'Volume of Terms Signed', type: 'money' },
  { key: 'dealsClosed', label: 'FinServ: Deals on the Board', type: 'count' },
  { key: 'dollarsFunded', label: 'FinServ $ on the Board', type: 'money', bold: true },
  { key: 'finservProposalsIssued', label: 'FinServ: Proposals Issued', type: 'count' },
  { key: 'finservDollarsProposed', label: 'FinServ Proposals Issued $', type: 'money' },
];

const PLAN: Record<MetricKey, number[]> = {
  salesCalls: [44, 46, 48, 48, 50, 50, 52, 52, 54],
  dealsOnBoard: [2, 2, 2, 2, 2, 2, 2, 2, 2],
  dollarsOnBoard: [30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3, 30.3],
  proposalsIssued: [7, 7, 7, 7, 7, 7, 7, 7, 7],
  dollarsProposed: [20, 20, 20, 20, 20, 20, 20, 20, 20],
  clientsSigned: [1, 2, 2, 2, 2, 2, 2, 2, 2],
  dollarsSigned: [4.8, 8.0, 8.0, 8.0, 8.0, 8.0, 8.0, 12.0, 12.0],
  clientsReceivingTerms: [2, 2, 2, 1, 2, 2, 2, 2, 2],
  termsSigned: [2, 2, 2, 2, 1, 2, 2, 2, 2],
  volumeOfTermsSigned: [6.4, 6.4, 6.4, 6.4, 3.5, 7.2, 8.0, 8.0, 8.0],
  dealsClosed: [2, 2, 2, 2, 2, 2, 2, 1, 2],
  dollarsFunded: [6.4, 6.4, 6.4, 6.4, 6.7, 7.2, 8.0, 4.8, 8.0],
  finservProposalsIssued: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  finservDollarsProposed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const ACTUAL: Record<MetricKey, (number | null)[]> = {
  salesCalls: pad([]),
  dealsOnBoard: pad([]), // overridden by live useDealsOnBoardByMonth
  dollarsOnBoard: pad([]),
  proposalsIssued: pad([]), // overridden by live proposalsIssuedQuery
  dollarsProposed: pad([]),
  clientsSigned: pad([]),
  dollarsSigned: pad([]), // overridden by live dollarsSignedQuery
  clientsReceivingTerms: pad([]),
  termsSigned: pad([]),
  volumeOfTermsSigned: pad([]),
  dealsClosed: pad([]),
  dollarsFunded: pad([]),
  finservProposalsIssued: pad([]),
  finservDollarsProposed: pad([]),
};

// Map dashboard MetricKey → Master Plan widget key + divisor.
// Currency metrics store raw USD in the Master Plan; dashboard renders $MM.
const PLAN_OVERLAY_MAP: Partial<Record<MetricKey, { widgetKey: string; divisor: number }>> = {
  dealsOnBoard: { widgetKey: 'deals-on-board', divisor: 1 },
  dollarsOnBoard: { widgetKey: 'deals-on-board-value', divisor: 1_000_000 },
  proposalsIssued: { widgetKey: 'proposals-issued', divisor: 1 },
  dollarsProposed: { widgetKey: 'dollars-proposed', divisor: 1_000_000 },
  clientsSigned: { widgetKey: 'deals-signed', divisor: 1 },
  dollarsSigned: { widgetKey: 'dollars-signed', divisor: 1_000_000 },
  clientsReceivingTerms: { widgetKey: 'clients-receiving-terms', divisor: 1 },
  termsSigned: { widgetKey: 'terms-signed', divisor: 1 },
  volumeOfTermsSigned: { widgetKey: 'volume-of-terms-signed', divisor: 1_000_000 },
  dealsClosed: { widgetKey: 'deals-closed', divisor: 1 },
  dollarsFunded: { widgetKey: 'dollars-funded', divisor: 1_000_000 },
  finservProposalsIssued: { widgetKey: 'finserv-proposals-issued', divisor: 1 },
  finservDollarsProposed: { widgetKey: 'finserv-dollars-proposed', divisor: 1_000_000 },
};

const MASTER_PLAN_WIDGET_KEYS = Array.from(
  new Set(Object.values(PLAN_OVERLAY_MAP).map((m) => m.widgetKey)),
);

function pad(actuals: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(9).fill(null);
  actuals.forEach((v, i) => (out[i] = v));
  return out;
}

function addMonthsClampedUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetLastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(date.getUTCDate(), targetLastDay);
  return new Date(Date.UTC(
    y,
    m,
    d,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

function firstDayOfMonthAfterUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

// ============================================================
// FILTERED-VIEW CONTEXT
// All sub-components read months/plan/actual/elapsed from here so the
// quarter selector in the header drives the full dashboard.
// ============================================================
export interface DashboardView {
  months: string[];
  monthIndexes: number[]; // indexes into the seeded 9-month arrays
  plan: Record<MetricKey, number[]>;
  actual: Record<MetricKey, (number | null)[]>;
  elapsed: number; // number of months in `months` already elapsed (have actuals)
  rangeStart: Date;
  rangeEnd: Date;
  label: string;
  /** Jan-through-end-of-selected-range month labels for YTD-cumulative charts. */
  ytdMonths?: string[];
  ytdPlan?: Record<MetricKey, number[]>;
  ytdActual?: Record<MetricKey, (number | null)[]>;
  /** Count of YTD months already elapsed (Jan..today), clamped to ytdMonths.length. */
  ytdElapsed?: number;
  /** When a single month is selected, render the sparkline with the trailing
   *  3 months (current + prior 2) instead of just the selected month. */
  sparkMonths?: string[];
  sparkPlan?: Record<MetricKey, number[]>;
  sparkActual?: Record<MetricKey, (number | null)[]>;
}

const ViewCtx = React.createContext<DashboardView | null>(null);
function useView(): DashboardView {
  const v = React.useContext(ViewCtx);
  if (!v) throw new Error('Missing DashboardView');
  return v;
}

// ------------------------------------------------------------
// Drilldown context — any chart/KPI/cell can call open(metric, monthIdx?)
// to surface the underlying monthly composition.
// ------------------------------------------------------------
interface DrilldownFocus {
  metricKey: MetricKey;
  monthIndex?: number;
}
interface DrilldownApi {
  open: (metric: MetricKey, monthIndex?: number) => void;
}
const DrilldownCtx = React.createContext<DrilldownApi | null>(null);
function useDrilldown(): DrilldownApi {
  const v = React.useContext(DrilldownCtx);
  if (!v) throw new Error('Missing DrilldownCtx');
  return v;
}

// ------------------------------------------------------------
// Forecast context — user-editable full-year plan overrides that
// persist across timeframe changes. Owned by SalesDashboardV2 so
// PerformancePanel and the Sales Model editor share the same source.
// ------------------------------------------------------------
interface ForecastCtxValue {
  fullDraft: FullForecastDraft;
  setFullDraft: React.Dispatch<React.SetStateAction<FullForecastDraft>>;
}
const ForecastCtx = React.createContext<ForecastCtxValue | null>(null);
function useForecast(): ForecastCtxValue {
  const v = React.useContext(ForecastCtx);
  if (!v) throw new Error('Missing ForecastCtx');
  return v;
}

function buildView(quarter: QuarterOption): DashboardView {
  // Determine which seeded month indexes fall inside the selected quarter.
  const indexes: number[] = [];
  const monthLabels: string[] = [];
  for (const m of quarter.months) {
    const [yStr, monStr] = m.key.split('-');
    const y = Number(yStr);
    const monIdx = Number(monStr) - 1; // 0-based
    if (y === SEED_YEAR && SEED_MONTH_INDEXES.includes(monIdx)) {
      indexes.push(monIdx);
      monthLabels.push(MONTHS[monIdx]);
    } else {
      // Month outside seeded window — keep label but no seeded data.
      indexes.push(-1);
      const d = new Date(y, monIdx, 1);
      monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    }
  }

  const slice = <T,>(arr: T[], fallback: T): T[] =>
    indexes.map((i) => (i >= 0 ? arr[i] : fallback));

  const plan = {} as Record<MetricKey, number[]>;
  const actual = {} as Record<MetricKey, (number | null)[]>;
  (Object.keys(PLAN) as MetricKey[]).forEach((k) => {
    plan[k] = slice(PLAN[k], 0);
    actual[k] = slice(ACTUAL[k], null);
  });

  // Elapsed = completed months plus the current month-to-date so live
  // calendar-backed actuals and drilldown rows reconcile to the event list.
  const today = new Date();
  let elapsed = 0;
  for (const m of quarter.months) {
    const start = new Date(m.start + 'T00:00:00');
    if (start <= today) elapsed += 1;
    else break;
  }
  // Clamp to at least 1 so charts render a current value
  if (elapsed < 1) elapsed = Math.min(1, quarter.months.length);

  return {
    months: monthLabels,
    monthIndexes: indexes,
    plan,
    actual,
    elapsed,
    rangeStart: new Date(quarter.startDate + 'T00:00:00Z'),
    rangeEnd: new Date(quarter.endDate + 'T23:59:59Z'),
    label: quarter.label,
  };
}

// ============================================================
// TOKENS
// ============================================================
const C = {
  bg: '#08080C',
  textPrimary: '#FFFFFF',
  textMuted: '#FFFFFF',
  textFaint: '#FFFFFF',
  periwinkle: '#FFFFFF',
  cyan: '#5EEAD4',
  violet: '#A78BFA',
  rose: '#FB7185',
  amber: '#FBBF24',
  surface: 'rgba(255,255,255,0.035)',
  surfaceBorder: 'rgba(255,255,255,0.18)',
  hairline: 'rgba(255,255,255,0.12)',
};

// Consumes the shared `--insights-widget-*` custom properties defined in
// `src/index.css` under `.insights-glass-skin`. This is the single source of
// truth for the Insights widget surface — every widget (Card-based,
// glass-module-based, and these inline shells) resolves to the same tokens.
const glassStyle: React.CSSProperties = {
  background: 'var(--insights-widget-bg)',
  border: 'var(--insights-widget-border)',
  borderRadius: 'var(--insights-widget-radius)',
  boxShadow: 'var(--insights-widget-shadow)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
};

// ============================================================
// FORMATTERS
// ============================================================
function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${v.toFixed(1)}MM`;
}
function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}
function fmtRow(v: number | null | undefined, type: 'count' | 'money') {
  return type === 'money' ? fmtMoney(v) : fmtCount(v);
}
function fmtSignedMoney(v: number): string {
  const s = v >= 0 ? '+' : '−';
  return `${s}${Math.abs(v).toFixed(1)}MM`;
}
function fmtSignedCount(v: number): string {
  const s = v >= 0 ? '+' : '−';
  return `${s}${Math.abs(Math.round(v)).toLocaleString()}`;
}
function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
function sum(arr: (number | null)[], end?: number): number {
  const slice = end !== undefined ? arr.slice(0, end) : arr;
  return slice.reduce((a: number, b) => a + (b ?? 0), 0);
}
function cumulative(arr: (number | null)[]): (number | null)[] {
  let s = 0;
  return arr.map((v) => {
    if (v === null || v === undefined) return null;
    s += v;
    return s;
  });
}
function cumulativePlan(arr: number[]): number[] {
  let s = 0;
  return arr.map((v) => (s += v));
}

// ============================================================
// SMALL COMPONENTS
// ============================================================
function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ borderRadius: 'inherit' }}
    >
      <div
        style={{
          position: 'absolute',
          top: -200,
          left: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(157,162,245,0.10) 0%, transparent 60%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -180,
          right: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(94,234,212,0.07) 0%, transparent 60%)',
        }}
      />
    </div>
  );
}

function ConcentricLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="12" stroke={C.periwinkle} strokeWidth="1" strokeDasharray="1.5 3" />
      <circle cx="14" cy="14" r="8" stroke={C.cyan} strokeWidth="1" strokeDasharray="1.5 3" />
      <circle cx="14" cy="14" r="4" stroke={C.cyan} strokeWidth="1" strokeDasharray="1.5 3" />
      <circle cx="14" cy="14" r="1.6" fill={C.cyan} />
    </svg>
  );
}

function NavRail() {
  const items = [LayoutGrid, BarChart3, Layers, FileText, Settings];
  return (
    <div
      className="hidden md:flex flex-col items-center gap-3 py-5 shrink-0"
      style={{
        width: 62,
        borderRight: `1px solid ${C.surfaceBorder}`,
      }}
    >
      <div className="mb-2">
        <ConcentricLogo />
      </div>
      {items.map((Icon, i) => {
        const active = i === 0;
        return (
          <button
            key={i}
            tabIndex={0}
            className="flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2"
            style={{
              width: 36,
              height: 36,
              background: active ? 'rgba(157,162,245,0.14)' : 'transparent',
              border: active ? `1px solid ${C.periwinkle}` : '1px solid transparent',
              color: active ? C.periwinkle : C.textFaint,
            }}
            aria-label={`nav-${i}`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// KPI CARD
// ============================================================
function KpiCard({
  ...args
}: {
  label: string;
  Icon: LucideIcon;
  type: 'count' | 'money';
  metricKey: MetricKey;
  mode: 'sum' | 'current';
}) {
  return <KpiCardInner {...args} />;
}

function PipelineVariantToggle({
  value,
  onChange,
}: {
  value: 'debt' | 'finserv';
  onChange: (v: 'debt' | 'finserv') => void;
}) {
  const options: { key: 'debt' | 'finserv'; label: string }[] = [
    { key: 'debt', label: 'Debt' },
    { key: 'finserv', label: 'FinServ' },
  ];
  return (
    <div
      className="inline-flex items-center rounded-md p-0.5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${C.surfaceBorder}`,
      }}
      role="tablist"
      aria-label="KPI pipeline variant"
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className="px-2.5 py-1 text-[11px] font-medium rounded-[5px] transition-colors focus-visible:outline-none focus-visible:ring-1"
            style={{
              background: active ? 'rgba(157,162,245,0.16)' : 'transparent',
              color: active ? C.textPrimary : C.textMuted,
              letterSpacing: '0.04em',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ValueModeToggle({
  value,
  onChange,
}: {
  value: 'count' | 'value';
  onChange: (v: 'count' | 'value') => void;
}) {
  const options: { key: 'count' | 'value'; label: string }[] = [
    { key: 'count', label: '#' },
    { key: 'value', label: '$' },
  ];
  return (
    <div
      className="inline-flex items-center rounded-md p-0.5"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${C.surfaceBorder}`,
      }}
      role="tablist"
      aria-label="KPI value mode"
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className="px-2.5 py-1 text-[11px] font-medium rounded-[5px] transition-colors focus-visible:outline-none focus-visible:ring-1"
            style={{
              background: active ? 'rgba(157,162,245,0.16)' : 'transparent',
              color: active ? C.textPrimary : C.textMuted,
              letterSpacing: '0.04em',
              minWidth: 22,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BlankKpiCard({ label }: { label: string }) {
  return (
    <div
      className="relative flex flex-col justify-center items-center text-center"
      style={{
        ...glassStyle,
        padding: 18,
        minHeight: 172,
        color: C.textFaint,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.14em] mb-2"
        style={{ color: C.textMuted }}
      >
        {label}
      </div>
      <div className="text-xs" style={{ color: C.textFaint }}>
        Not applicable in $ view
      </div>
    </div>
  );
}

function KpiCardInner({
  label,
  Icon,
  type,
  metricKey,
  mode,
}: {
  label: string;
  Icon: LucideIcon;
  type: 'count' | 'money';
  metricKey: MetricKey;
  mode: 'sum' | 'current';
}) {
  const view = useView();
  const drill = useDrilldown();
  const planArr = view.plan[metricKey];
  const actualArr = view.actual[metricKey];
  const E = view.elapsed;
  // Big number honors `mode`:
  //   - 'sum'     → cumulative through elapsed months in the selected range
  //   - 'current' → value of the current (latest elapsed) month only
  const currentActual =
    mode === 'sum' ? sum(actualArr, E) : (actualArr[E - 1] ?? 0);
  const currentPlan =
    mode === 'sum'
      ? planArr.slice(0, E).reduce((a, b) => a + b, 0)
      : (planArr[E - 1] ?? 0);
  const deltaPct = currentPlan === 0 ? 0 : (currentActual - currentPlan) / currentPlan;
  const positive = deltaPct >= 0;
  const compareActual = currentActual;
  const comparePlan = currentPlan;
  const gap = compareActual - comparePlan;

  const sparkMonthsArr = view.sparkMonths ?? view.months;
  const sparkPlanArr = view.sparkPlan?.[metricKey] ?? planArr;
  const sparkActualArr = view.sparkActual?.[metricKey] ?? actualArr;
  const sparkData = sparkMonthsArr.map((m, i) => ({
    month: m,
    plan: sparkPlanArr[i],
    actual: sparkActualArr[i],
  }));

  return (
    <button
      type="button"
      onClick={() => drill.open(metricKey)}
      style={glassStyle}
      className="relative p-4 flex flex-col gap-2 overflow-hidden text-left cursor-pointer transition-transform hover:-translate-y-[1px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
      aria-label={`Drill into ${label}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 28,
            height: 28,
            background: 'rgba(157,162,245,0.14)',
            color: C.periwinkle,
          }}
        >
          <Icon size={14} />
        </div>
        <div
          className="text-[10px] font-medium uppercase"
          style={{ color: C.textMuted, letterSpacing: '0.08em' }}
        >
          {label}
        </div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <div
          className="text-3xl font-semibold leading-none"
          style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}
        >
          {type === 'money' ? fmtMoney(currentActual) : fmtCount(currentActual)}
        </div>
        <div
          className="flex items-center gap-0.5 text-xs font-medium"
          style={{ color: positive ? C.cyan : C.rose, fontVariantNumeric: 'tabular-nums' }}
        >
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {positive ? '+' : '−'}
          {Math.abs(Math.round(deltaPct * 100))}%
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px]" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
        <span>
          vs plan {type === 'money' ? fmtMoney(comparePlan) : fmtCount(comparePlan)} ·{' '}
          <span style={{ color: gap >= 0 ? C.cyan : C.rose }}>
            {type === 'money' ? fmtSignedMoney(gap) : fmtSignedCount(gap)}
          </span>
        </span>
        <span className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 0, borderTop: `1.5px dashed #a855f7`, display: 'inline-block' }} />
            Plan
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 2, background: C.cyan, display: 'inline-block', borderRadius: 1 }} />
            Actual
          </span>
        </span>
      </div>
      <div style={{ height: 160 }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={sparkData}
            margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
            onClick={(state: { activeTooltipIndex?: number } | null) => {
              if (state && typeof state.activeTooltipIndex === 'number') {
                drill.open(metricKey, state.activeTooltipIndex);
              }
            }}
          >
            <CartesianGrid stroke={C.hairline} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: C.textFaint, fontSize: 10 }}
              axisLine={{ stroke: C.hairline }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: C.textFaint, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(8,8,12,0.95)',
                border: `1px solid ${C.surfaceBorder}`,
                borderRadius: 8,
                color: C.textPrimary,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="plan"
              stroke="#a855f7"
              strokeWidth={1.4}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={C.cyan}
              strokeWidth={2}
              dot={{ r: 2.5, fill: C.cyan }}
              activeDot={{ r: 5, fill: C.cyan, stroke: C.cyan }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

// ============================================================
// PERFORMANCE-TO-PLAN PANEL
// ============================================================
function statusColor(att: number): string {
  if (att >= 1) return C.cyan;
  if (att >= 0.95) return C.amber;
  return C.rose;
}

function PerformancePanel() {
  const view = useView();
  const drill = useDrilldown();
  const [driverMode, setDriverMode] = React.useState<'gap' | 'performance'>('gap');
  const [selectedDriver, setSelectedDriver] = React.useState<MetricKey>('dollarsFunded');
  const E = view.elapsed;

  // Drivers
  type Driver = {
    label: string;
    note?: string;
    actual: number;
    plan: number;
    type: 'count' | 'money';
    metricKey: MetricKey;
  };
  const drivers: Driver[] = [
    { label: 'Sales Calls', metricKey: 'salesCalls', actual: sum(view.actual.salesCalls, E), plan: view.plan.salesCalls.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'Proposals Issued', metricKey: 'proposalsIssued', actual: sum(view.actual.proposalsIssued, E), plan: view.plan.proposalsIssued.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'Deals on Board', metricKey: 'dealsOnBoard', actual: view.actual.dealsOnBoard[E - 1] ?? 0, plan: view.plan.dealsOnBoard[E - 1] ?? 0, type: 'count' },
    { label: 'Dollars Signed', metricKey: 'dollarsSigned', actual: sum(view.actual.dollarsSigned, E), plan: view.plan.dollarsSigned.slice(0, E).reduce((a, b) => a + b, 0), type: 'money' },
    { label: 'FinServ: Deals on the Board', metricKey: 'dealsClosed', actual: sum(view.actual.dealsClosed, E), plan: view.plan.dealsClosed.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'FinServ $ on the Board', metricKey: 'dollarsFunded', actual: sum(view.actual.dollarsFunded, E), plan: view.plan.dollarsFunded.slice(0, E).reduce((a, b) => a + b, 0), type: 'money' },
    { label: 'FinServ: Proposals Issued', metricKey: 'finservProposalsIssued', actual: sum(view.actual.finservProposalsIssued, E), plan: view.plan.finservProposalsIssued.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'FinServ Proposals Issued $', metricKey: 'finservDollarsProposed', actual: sum(view.actual.finservDollarsProposed, E), plan: view.plan.finservDollarsProposed.slice(0, E).reduce((a, b) => a + b, 0), type: 'money' },
  ];

  const activeDriver = drivers.find((d) => d.metricKey === selectedDriver) ?? drivers[drivers.length - 1];
  const activePlan = activeDriver.plan;
  const activeActual = activeDriver.actual;
  const attainment = activePlan === 0 ? 0 : activeActual / activePlan;
  const gap = activeActual - activePlan;
  const actualWidthPct = activePlan === 0 ? 0 : Math.max(0, Math.min(100, (activeActual / activePlan) * 100));
  const isMoney = activeDriver.type === 'money';
  const fmtValue = (n: number) =>
    isMoney ? fmtMoney(n) : Math.round(n).toLocaleString();
  const fmtSignedValue = (n: number) =>
    isMoney
      ? fmtSignedMoney(n)
      : `${n >= 0 ? '+' : '−'}${Math.round(Math.abs(n)).toLocaleString()}`;
  const cumulativeLabel = activeDriver.note?.includes('current') ? 'Current' : 'YTD';

  return (
    <div style={glassStyle} className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] overflow-hidden">
      {/* LEFT — Gap to Plan / Performance to Plan by Driver */}
      <div className="p-5 lg:border-r" style={{ borderColor: C.surfaceBorder }}>
        <div className="flex items-center justify-between mb-3">
          <Select value={driverMode} onValueChange={(v) => setDriverMode(v as 'gap' | 'performance')}>
            <SelectTrigger
              className="h-6 w-auto gap-1.5 border-0 bg-transparent px-1 py-0 text-[10px] font-medium uppercase focus:ring-0 focus:ring-offset-0 hover:bg-white/[0.04]"
              style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gap">Gap to Plan</SelectItem>
              <SelectItem value="performance">Performance to Plan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col">
          {drivers.map((d, idx) => {
            const att = d.actual / d.plan;
            const color = statusColor(att);
            const gapVal = d.actual - d.plan;
            const shortfallPct = d.plan === 0 ? 0 : Math.round(Math.abs(1 - att) * 100);
            const gapDisplay =
              d.type === 'money'
                ? `${gapVal >= 0 ? '+' : '−'}$${Math.abs(gapVal).toFixed(1)}`
                : `${gapVal >= 0 ? '+' : '−'}${Math.round(Math.abs(gapVal))}`;
            const isActive = d.metricKey === selectedDriver;
            return (
              <button
                type="button"
                key={d.label}
                onClick={() => setSelectedDriver(d.metricKey)}
                onDoubleClick={() => drill.open(d.metricKey)}
                title="Click to preview · Double-click to drill down"
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 text-left w-full cursor-pointer hover:bg-white/[0.03] rounded-md px-2 -mx-2 focus-visible:outline-none focus-visible:ring-1"
                style={{
                  borderTop: idx === 0 ? 'none' : `1px solid ${C.hairline}`,
                  background: isActive ? 'rgba(157,162,245,0.08)' : undefined,
                  boxShadow: isActive
                    ? `inset 2px 0 0 ${C.periwinkle}`
                    : undefined,
                }}
              >
                <div className="text-[12px]" style={{ color: C.textPrimary }}>
                  {d.label}
                  {d.note && <span className="ml-1" style={{ color: C.textFaint }}>{d.note}</span>}
                </div>
                <div className="text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: C.textPrimary }}>
                    {d.type === 'money' ? `$${d.actual.toFixed(1)}` : Math.round(d.actual)}
                  </span>
                  <span style={{ color: C.textFaint }}>
                    {' / '}
                    {d.type === 'money' ? `$${d.plan.toFixed(1)}` : Math.round(d.plan)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 min-w-[48px] justify-end">
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: 'inline-block' }} />
                  <span
                    className="text-[12px] font-medium"
                    style={{ color, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {driverMode === 'performance'
                      ? fmtPct(att)
                      : `${gapDisplay} · ${shortfallPct}%`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT — Performance to Plan (driver-driven) */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div
            className="flex items-center gap-1.5 text-[10px] font-medium uppercase min-w-0"
            style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
          >
            <Target size={11} />
            <span className="truncate">Performance to Plan · {activeDriver.label} {cumulativeLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => drill.open(selectedDriver)}
            className="flex items-center gap-1 text-[10px] uppercase px-2 py-1 rounded-md hover:bg-white/[0.05] transition-colors shrink-0"
            style={{
              color: C.textMuted,
              border: `1px solid ${C.hairline}`,
              letterSpacing: '0.06em',
            }}
            title="Open drill-down"
          >
            Drill down
            <ArrowUpRight size={11} />
          </button>
        </div>
        <div className="flex items-end gap-3">
          <div
            className="text-5xl font-semibold leading-none"
            style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtPct(attainment)}
          </div>
          <div
            className="text-[11px] px-2 py-1 rounded-md"
            style={{
              color: gap >= 0 ? C.cyan : C.rose,
              background: gap >= 0 ? 'rgba(94,234,212,0.10)' : 'rgba(251,113,133,0.10)',
              border: `1px solid ${gap >= 0 ? 'rgba(94,234,212,0.25)' : 'rgba(251,113,133,0.25)'}`,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtSignedValue(gap)} to plan
          </div>
        </div>

        {/* Bridge */}
        <div className="mt-6 space-y-3">
          {/* Plan bar */}
          <BridgeBar
            label="Plan"
            value={fmtValue(activePlan)}
            widthPct={100}
            fill={`repeating-linear-gradient(135deg, rgba(157,162,245,0.45) 0 6px, rgba(157,162,245,0.18) 6px 12px)`}
            valueColor={C.periwinkle}
          />
          {/* Actual bar */}
          <BridgeBar
            label="Actual"
            value={fmtValue(activeActual)}
            widthPct={actualWidthPct}
            fill={`linear-gradient(90deg, rgba(94,234,212,0.85), rgba(94,234,212,0.55))`}
            valueColor={C.cyan}
          />
        </div>

        {/* Gap callout */}
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-px flex-1"
            style={{
              backgroundImage: `linear-gradient(to right, ${C.rose} 50%, transparent 50%)`,
              backgroundSize: '6px 1px',
              backgroundRepeat: 'repeat-x',
              opacity: 0.55,
            }}
          />
          <div className="text-[11px]" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: C.rose }}>Gap {fmtSignedValue(gap)}</span>
            <span> · {Math.round(Math.abs(1 - attainment) * 100)}% short of pace through {view.months[E - 1] ?? ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BridgeBar({
  label,
  value,
  widthPct,
  fill,
  valueColor,
}: {
  label: string;
  value: string;
  widthPct: number;
  fill: string;
  valueColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px]" style={{ color: C.textMuted }}>
          {label}
        </div>
        <div
          className="text-[12px] font-medium"
          style={{ color: valueColor, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </div>
      </div>
      <div
        className="relative w-full"
        style={{
          height: 10,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${widthPct}%`,
            height: '100%',
            background: fill,
            borderRadius: 4,
            transition: 'width 400ms ease',
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// TOP SOURCED-VIA WIDGET (half width, below Performance-to-Plan)
// Shows the top 5 "Sourced Via" values for deals created inside the
// selected timeframe.
// ============================================================
const EXCLUDED_DEAL_NAMES = new Set(["Test-Niki's Store", 'Example Deal']);
function isExcludedDeal(name: string | null | undefined): boolean {
  if (!name) return false;
  if (EXCLUDED_DEAL_NAMES.has(name)) return true;
  return /^test\s/i.test(name);
}

// ============================================================
// BD CALLS & MEETINGS WIDGET (placeholder — data to be wired later)
// ============================================================
function BdCallsMeetingsWidget() {
  return (
    <div style={glassStyle} className="p-5 overflow-hidden">
      <div
        className="flex items-center gap-1.5 text-[10px] font-medium uppercase mb-3"
        style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
      >
        <Radio size={11} />
        BD Calls &amp; Meetings
      </div>
      <div
        className="flex items-center justify-center text-[12px] italic"
        style={{ color: C.textMuted, minHeight: 180 }}
      >
        Data coming soon
      </div>
    </div>
  );
}

function TopSourcedViaWidget() {
  type DealRow = {
    id: string;
    company: string | null;
    sourced_via: string | null;
    referral_source: string | null;
    referral_source_id: string | null;
    referred_by: string | null;
    referred_by_contact_id: string | null;
    referred_by_crm_company_id: string | null;
    lead_source: string | null;
    created_at: string;
  };
  const view = useView();
  const { company } = useCompany();
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Realtime: refetch when any deal's attribution fields change so edits to
  // sourced_via / referral fields reflect immediately in this widget.
  React.useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`top-sourced-via-deals-${company.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'deals', filter: `company_id=eq.${company.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['top-sourced-via-v3'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [company?.id, queryClient]);

  // Period math — derive period length in whole months from the selected
  // range, then compute two prior periods of the same length.
  const periods = React.useMemo(() => {
    const start = view.rangeStart;
    const end = view.rangeEnd;
    const pm = Math.max(
      1,
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - start.getUTCMonth()),
    );
    const shift = (d: Date, months: number) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate()));
    const p0 = { start, end };
    const p1 = { start: shift(start, pm), end: start };
    const p2 = { start: shift(start, pm * 2), end: shift(start, pm) };
    // Extended window: past 6 months when a month is selected, or past 2
    // quarters (also 6 months) when a quarter is selected. Falls back to the
    // current period for larger selections.
    const extendedMonths = pm === 1 ? 6 : pm === 3 ? 6 : pm;
    const extended = { start: shift(end, extendedMonths), end };
    const extendedLabel = pm === 3 ? 'Past 2 quarters' : `Past ${extendedMonths} months`;
    const labelFor = (s: Date, e: Date) => {
      if (pm === 1) return s.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      if (pm === 3) {
        const q = Math.floor(s.getUTCMonth() / 3) + 1;
        return `Q${q} ${s.getUTCFullYear()}`;
      }
      if (pm === 12) return `${s.getUTCFullYear()}`;
      const a = s.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      const b = new Date(e.getTime() - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      return `${a}–${b}`;
    };
    const wideStart = new Date(Math.min(p2.start.getTime(), extended.start.getTime()));
    return {
      periodMonths: pm,
      wide: { start: wideStart, end: p0.end },
      extended: { ...extended, label: extendedLabel },
      buckets: [
        { key: 'p2', label: labelFor(p2.start, p2.end), start: p2.start, end: p2.end },
        { key: 'p1', label: labelFor(p1.start, p1.end), start: p1.start, end: p1.end },
        { key: 'p0', label: labelFor(p0.start, p0.end), start: p0.start, end: p0.end },
      ] as const,
    };
  }, [view.rangeStart, view.rangeEnd]);

  const wideStartIso = periods.wide.start.toISOString();
  const wideEndIso = periods.wide.end.toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['top-sourced-via-v3', company?.id, wideStartIso, wideEndIso],
    enabled: !!company?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Pipeline IDs. Active pipeline: deals entering "NDA / Needs List Sent".
      // FinServ pipeline: deals created in-period. Naitive pipeline: deals
      // entering "Demo Access".
      const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
      const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';
      const { getNaitivePipelineId } = await import('@/utils/naitivePipelineExclusion');
      const naitivePipelineId = await getNaitivePipelineId();

      // 1) Active pipeline — NDA / Needs List Sent stage entries across the
      // wide window covering current + two prior periods.
      const ndaQ = supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at')
        .eq('pipeline_id', ACTIVE_PIPELINE_ID)
        .eq('event_type', 'stage_enter')
        .or('to_stage_id.eq.ndaneeds-list-sent,to_stage.eq.ndaneeds-list-sent')
        .gte('changed_at', wideStartIso)
        .lt('changed_at', wideEndIso);

      // 2) FinServ pipeline — deals created in the wide window.
      const finservQ = supabase
        .from('deals')
        .select('id, created_at')
        .eq('company_id', company!.id)
        .eq('pipeline_id', FINSERV_PIPELINE_ID)
        .neq('status', 'archived')
        .gte('created_at', wideStartIso)
        .lte('created_at', wideEndIso);

      // 3) Naitive pipeline — Demo Access stage entries in the wide window.
      const naitiveQ = naitivePipelineId
        ? supabase
            .from('deal_stage_history')
            .select('deal_id, changed_at')
            .eq('pipeline_id', naitivePipelineId)
            .eq('event_type', 'stage_enter')
            .or('to_stage_id.eq.demo-access,to_stage.eq.demo-access')
            .gte('changed_at', wideStartIso)
            .lt('changed_at', wideEndIso)
        : Promise.resolve({ data: [] as { deal_id: string; changed_at: string }[], error: null });

      const [ndaRes, finservRes, naitiveRes] = await Promise.all([ndaQ, finservQ, naitiveQ]);
      if ((ndaRes as any).error) throw (ndaRes as any).error;
      if ((finservRes as any).error) throw (finservRes as any).error;
      if ((naitiveRes as any).error) throw (naitiveRes as any).error;

      // Merge into (deal_id, event_at) pairs across sources.
      const events: Array<{ dealId: string; at: string }> = [];
      for (const r of ((ndaRes as any).data ?? []) as { deal_id: string | null; changed_at: string }[]) {
        if (r.deal_id && r.changed_at) events.push({ dealId: r.deal_id, at: r.changed_at });
      }
      for (const r of ((finservRes as any).data ?? []) as { id: string; created_at: string }[]) {
        if (r.id && r.created_at) events.push({ dealId: r.id, at: r.created_at });
      }
      for (const r of ((naitiveRes as any).data ?? []) as { deal_id: string | null; changed_at: string }[]) {
        if (r.deal_id && r.changed_at) events.push({ dealId: r.deal_id, at: r.changed_at });
      }

      const dealIds = new Set(events.map((e) => e.dealId));

      if (dealIds.size === 0) {
        return { events, deals: [] as DealRow[] };
      }

      const { data: dealsData, error: dealsErr } = await supabase
        .from('deals')
        .select('id, company, sourced_via, referral_source, referral_source_id, referred_by, lead_source, created_at')
        .in('id', Array.from(dealIds));
      if (dealsErr) throw dealsErr;
      return { events, deals: (dealsData ?? []) as DealRow[] };
    },
  });

  // Bucket qualifying deals per period and compute per-source counts.
  const analysis = React.useMemo(() => {
    const deals = data?.deals ?? [];
    const events = data?.events ?? [];
    const dealMap = new Map(deals.map((d) => [d.id, d] as const));

    const sourceKey = (d: DealRow): string => {
      const hasReferral =
        !!d.referral_source_id ||
        !!(d.referral_source || '').trim() ||
        !!(d.referred_by || '').trim();
      return (
        (d.sourced_via || '').trim() ||
        (hasReferral ? 'Referral' : '') ||
        (d.lead_source || '').trim() ||
        'Unattributed'
      );
    };

    // Bucket unique deal_ids per period based on event timestamps.
    const perPeriodDeals: Record<string, Set<string>> = { p2: new Set(), p1: new Set(), p0: new Set() };
    for (const e of events) {
      const t = new Date(e.at).getTime();
      for (const b of periods.buckets) {
        if (t >= b.start.getTime() && t < b.end.getTime()) {
          perPeriodDeals[b.key].add(e.dealId);
          break;
        }
      }
    }

    const bucketToCounts = (dealSet: Set<string>) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const id of dealSet) {
        const d = dealMap.get(id);
        if (!d) continue;
        if (isExcludedDeal(d.company)) continue;
        const key = sourceKey(d);
        if (key === 'Unattributed') continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total += 1;
      }
      return { counts, total };
    };

    const current = bucketToCounts(perPeriodDeals.p0);
    const prior1 = bucketToCounts(perPeriodDeals.p1);
    const prior2 = bucketToCounts(perPeriodDeals.p2);

    const topRows = Array.from(current.counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    // Extended window rollup — past 6 months / past 2 quarters.
    const extendedDealIds = new Set<string>();
    const extStart = periods.extended.start.getTime();
    const extEnd = periods.extended.end.getTime();
    for (const e of events) {
      const t = new Date(e.at).getTime();
      if (t >= extStart && t < extEnd) extendedDealIds.add(e.dealId);
    }
    const extended = bucketToCounts(extendedDealIds);
    const extendedRows = Array.from(extended.counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    // Build chart data: one entry per period with a numeric field per top source.
    const chartData = periods.buckets.map((b) => {
      const src = b.key === 'p0' ? current.counts : b.key === 'p1' ? prior1.counts : prior2.counts;
      const row: Record<string, number | string> = { period: b.label };
      for (const r of topRows) row[r.label] = src.get(r.label) ?? 0;
      return row;
    });

    // Deals in current period, grouped by source (for the right-side list).
    const currentDeals = Array.from(perPeriodDeals.p0)
      .map((id) => dealMap.get(id))
      .filter((d): d is DealRow => !!d && !isExcludedDeal(d.company) && sourceKey(d) !== 'Unattributed');
    const groupedDeals = new Map<string, DealRow[]>();
    for (const d of currentDeals) {
      const k = sourceKey(d);
      const list = groupedDeals.get(k) ?? [];
      list.push(d);
      groupedDeals.set(k, list);
    }

    return {
      topRows,
      currentTotal: current.total,
      chartData,
      groupedDeals,
      extendedRows,
      extendedTotal: extended.total,
    };
  }, [data, periods]);

  const max = analysis.topRows[0]?.count ?? 0;
  const extMax = analysis.extendedRows[0]?.count ?? 0;

  const SERIES_COLORS = ['#9DA2F5', '#7EC8E3', '#C7A6F2', '#F5A97F', '#7FD4B0'];

  return (
    <>
    <div style={glassStyle} className="p-5 overflow-hidden">
      <div
        className="flex items-center gap-1.5 text-[10px] font-medium uppercase mb-3"
        style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
      >
        <Radio size={11} />
        Top Sourced Via · Deals Created · {view.label}
      </div>

      {isLoading ? (
        <div className="text-[12px]" style={{ color: C.textMuted }}>Loading…</div>
      ) : analysis.topRows.length === 0 ? (
        <div className="text-[12px]" style={{ color: C.textMuted }}>
          No qualifying deals in this period.
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Current-period top sources with bars */}
          <div className="flex flex-col">
            {analysis.topRows.map((r, idx) => {
              const widthPct = max === 0 ? 0 : (r.count / max) * 100;
              const share = analysis.currentTotal === 0 ? 0 : r.count / analysis.currentTotal;
              return (
                <button
                  type="button"
                  key={r.label}
                  onClick={() => setSelectedSource(r.label)}
                  title={`View ${r.count} deal${r.count === 1 ? '' : 's'} sourced via ${r.label}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 text-left w-full cursor-pointer hover:bg-white/[0.03] rounded-md px-2 -mx-2 focus-visible:outline-none focus-visible:ring-1"
                  style={{ borderTop: idx === 0 ? 'none' : `1px solid ${C.hairline}` }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[12px] truncate mb-1.5"
                      style={{ color: C.textPrimary }}
                      title={r.label}
                    >
                      {r.label}
                    </div>
                    <div
                      className="relative w-full"
                      style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, rgba(157,162,245,0.85), rgba(157,162,245,0.45))`,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                  <div
                    className="text-[11px] tabular-nums whitespace-nowrap"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    <span style={{ color: C.textPrimary }}>{r.count}</span>
                    <span style={{ color: C.textFaint }}>{' · '}{Math.round(share * 100)}%</span>
                  </div>
                </button>
              );
            })}
            {analysis.extendedRows.length > 0 && (
              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.hairline}` }}>
                <div
                  className="text-[10px] font-medium uppercase mb-2"
                  style={{ color: C.textFaint, letterSpacing: '0.08em' }}
                >
                  {periods.extended.label}
                </div>
                {analysis.extendedRows.map((r, idx) => {
                  const widthPct = extMax === 0 ? 0 : (r.count / extMax) * 100;
                  const share = analysis.extendedTotal === 0 ? 0 : r.count / analysis.extendedTotal;
                  return (
                    <button
                      type="button"
                      key={`ext-${r.label}`}
                      onClick={() => setSelectedSource(r.label)}
                      title={`View ${r.count} deal${r.count === 1 ? '' : 's'} sourced via ${r.label}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5 text-left w-full cursor-pointer hover:bg-white/[0.03] rounded-md px-2 -mx-2 focus-visible:outline-none focus-visible:ring-1"
                      style={{ borderTop: idx === 0 ? 'none' : `1px solid ${C.hairline}` }}
                    >
                      <div className="min-w-0">
                        <div
                          className="text-[11px] truncate mb-1"
                          style={{ color: C.textPrimary }}
                          title={r.label}
                        >
                          {r.label}
                        </div>
                        <div
                          className="relative w-full"
                          style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' }}
                        >
                          <div
                            style={{
                              width: `${widthPct}%`,
                              height: '100%',
                              background: `linear-gradient(90deg, rgba(199,166,242,0.85), rgba(199,166,242,0.45))`,
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </div>
                      <div
                        className="text-[10.5px] tabular-nums whitespace-nowrap"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        <span style={{ color: C.textPrimary }}>{r.count}</span>
                        <span style={{ color: C.textFaint }}>{' · '}{Math.round(share * 100)}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    <SourcedViaDrilldownDialog
      source={selectedSource}
      deals={(data?.deals ?? []).filter(
        (d) => {
          if (isExcludedDeal(d.company)) return false;
          const hasReferral =
            !!(d.referral_source_id) ||
            !!(d.referral_source || '').trim() ||
            !!(d.referred_by || '').trim();
          const key =
            (d.sourced_via || '').trim() ||
            (hasReferral ? 'Referral' : '') ||
            (d.lead_source || '').trim() ||
            'Unattributed';
          return key === selectedSource;
        },
      )}
      viewLabel={view.label}
      onClose={() => setSelectedSource(null)}
    />
    </>
  );
}

// ------------------------------------------------------------
// Sourced Via drill-down dialog
// ------------------------------------------------------------
function SourcedViaDrilldownDialog({
  source,
  deals,
  viewLabel,
  onClose,
}: {
  source: string | null;
  deals: Array<{
    id: string;
    company: string | null;
    sourced_via: string | null;
    referral_source: string | null;
    referral_source_id: string | null;
    created_at: string;
  }>;
  viewLabel: string;
  onClose: () => void;
}) {
  const open = !!source;
  const referralIds = React.useMemo(
    () => Array.from(new Set(deals.map((d) => d.referral_source_id).filter(Boolean))) as string[],
    [deals],
  );

  const { data: sources } = useQuery({
    queryKey: ['sourced-via-drilldown-refs', referralIds.sort().join(',')],
    enabled: open && referralIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, channel, type, source_type, promoted_to_partner_id')
        .in('id', referralIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const partnerIds = React.useMemo(
    () => Array.from(new Set((sources ?? []).map((s) => s.promoted_to_partner_id).filter(Boolean))) as string[],
    [sources],
  );
  const { data: partners } = useQuery({
    queryKey: ['sourced-via-drilldown-partners', partnerIds.sort().join(',')],
    enabled: open && partnerIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('id, name')
        .in('id', partnerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const srcById = React.useMemo(() => {
    const m = new Map<string, { name: string; channel: string | null; type: string | null; source_type: string | null; promoted_to_partner_id: string | null }>();
    for (const s of sources ?? []) m.set(s.id, s);
    return m;
  }, [sources]);
  const partnerById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const p of partners ?? []) m.set(p.id, p.name);
    return m;
  }, [partners]);

  const rows = deals
    .slice()
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .map((d) => {
      const s = d.referral_source_id ? srcById.get(d.referral_source_id) : undefined;
      return {
        id: d.id,
        company: d.company || '—',
        created: d.created_at,
        referralName: s?.name ?? d.referral_source ?? '—',
        channel: s?.channel ?? '—',
        type: s?.type ?? s?.source_type ?? '—',
        partner: s?.promoted_to_partner_id ? partnerById.get(s.promoted_to_partner_id) ?? '—' : '—',
      };
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto p-4 sm:p-6"
        style={{
          background: 'rgba(12,12,18,0.98)',
          border: `1px solid ${C.surfaceBorder}`,
          color: C.textPrimary,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: C.textPrimary }}>
            Sourced via {source}
          </DialogTitle>
          <DialogDescription style={{ color: C.textMuted }}>
            {viewLabel} · {rows.length} deal{rows.length === 1 ? '' : 's'} created
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: C.textMuted, textAlign: 'left' }}>
                <th className="py-2 pr-3 font-medium">Deal</th>
                <th className="py-2 pr-3 font-medium">Referral Source</th>
                <th className="py-2 pr-3 font-medium">Channel</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Partner</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.hairline}` }}>
                  <td className="py-2 pr-3" style={{ color: C.textPrimary }}>{r.company}</td>
                  <td className="py-2 pr-3" style={{ color: C.textMuted }}>{r.referralName}</td>
                  <td className="py-2 pr-3" style={{ color: C.textMuted }}>{r.channel}</td>
                  <td className="py-2 pr-3" style={{ color: C.textMuted }}>{r.type}</td>
                  <td className="py-2 pr-3" style={{ color: C.textMuted }}>{r.partner}</td>
                  <td className="py-2 pr-3 whitespace-nowrap" style={{ color: C.textFaint }}>
                    {new Date(r.created).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center" style={{ color: C.textMuted }}>
                    No deals to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// CUMULATIVE PACE CHART
// ============================================================
function CumulativePace() {
  const view = useView();
  const drill = useDrilldown();
  const [metric, setMetric] = React.useState<MetricKey>(() => {
    if (typeof window === 'undefined') return 'dollarsFunded';
    const saved = window.localStorage.getItem('sales-dashboard.cumulative-pace.metric');
    return (saved as MetricKey) || 'dollarsFunded';
  });
  React.useEffect(() => {
    try {
      window.localStorage.setItem('sales-dashboard.cumulative-pace.metric', metric);
    } catch {}
  }, [metric]);
  const row = ROW_ORDER.find((r) => r.key === metric) ?? ROW_ORDER[0];
  const isMoney = row.type === 'money';
  const fmt = (v: number | null | undefined) => (isMoney ? fmtMoney(v) : fmtCount(v));
  // YTD-cumulative pace: sum January-through-end-of-selected-range so the
  // "actual to date" and running totals reconcile to a true year-to-date
  // number regardless of which quarter/month is selected.
  const months = view.ytdMonths ?? view.months;
  const planArr = view.ytdPlan?.[metric] ?? view.plan[metric];
  const actualArr = view.ytdActual?.[metric] ?? view.actual[metric];
  const E = view.ytdElapsed ?? view.elapsed;
  const planCum = cumulativePlan(planArr);
  const actualCum = cumulative(actualArr);
  const data = months.map((m, i) => ({
    month: m,
    plan: planCum[i],
    actual: actualCum[i],
  }));
  const actualToDate = actualCum[E - 1] ?? 0;
  const planToDate = planCum[E - 1] ?? 0;
  const fyTarget = planCum[planCum.length - 1] ?? 0;

  return (
    <div style={glassStyle} className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: C.periwinkle }} />
          <div className="text-sm font-semibold" style={{ color: C.textPrimary }}>
            Cumulative pace
          </div>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="text-[11px] rounded-md px-2 py-1 focus:outline-none"
            style={{
              background: 'rgba(20,80,160,0.35)',
              color: '#d0eaff',
              border: `1px solid ${C.surfaceBorder}`,
              colorScheme: 'dark',
            }}
          >
            {ROW_ORDER.map((r) => (
              <option key={r.key} value={r.key} style={{ background: '#0f1c34', color: '#d0eaff' }}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="text-[11px]" style={{ color: C.textFaint }}>
            · YTD running total
          </div>
          <button
            type="button"
            onClick={() => drill.open(metric)}
            className="ml-2 text-[10px] px-2 py-0.5 rounded-md hover:brightness-125 focus-visible:outline-none focus-visible:ring-1"
            style={{ background: 'rgba(157,162,245,0.10)', color: C.periwinkle, border: `1px solid ${C.surfaceBorder}` }}
          >
            Drill in
          </button>
        </div>
        <div className="flex items-center gap-5 text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Readout label="YTD ACTUAL" value={fmt(actualToDate)} color={C.cyan} />
          <Readout label="YTD PLAN" value={fmt(planToDate)} color="#a855f7" />
          <Readout label="YTD TARGET" value={fmt(fyTarget)} color={C.textMuted} />
        </div>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cyan} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.cyan} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="planGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.hairline} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={{ stroke: C.hairline }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => (isMoney ? `$${Math.round(v)}` : `${Math.round(v)}`)}
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              cursor={{ stroke: C.textFaint, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const actual = Number(payload.find((p: any) => p.dataKey === 'actual')?.value ?? 0);
                const plan = Number(payload.find((p: any) => p.dataKey === 'plan')?.value ?? 0);
                const diff = actual - plan;
                const pct = plan !== 0 ? (diff / plan) * 100 : null;
                const positive = diff >= 0;
                const varColor = positive ? C.cyan : C.rose;
                const sign = positive ? '+' : '−';
                return (
                  <div
                    style={{
                      background: 'rgba(8,8,12,0.95)',
                      border: `1px solid ${C.surfaceBorder}`,
                      borderRadius: 8,
                      color: C.textPrimary,
                      fontSize: 12,
                      padding: '8px 10px',
                      minWidth: 160,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: C.cyan }}>YTD Actual</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(actual)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ color: '#a855f7' }}>YTD Plan</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(plan)}</span>
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: `1px solid ${C.hairline}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        color: varColor,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <span>Variance</span>
                      <span>
                        {sign}
                        {fmt(Math.abs(diff))}
                        {pct !== null ? ` (${sign}${Math.abs(pct).toFixed(1)}%)` : ''}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              x={months[E - 1] ?? ''}
              stroke={C.textFaint}
              strokeDasharray="3 3"
              label={{ value: 'today', position: 'top', fill: C.textFaint, fontSize: 10 }}
            />
            <Area
              type="monotone"
              dataKey="plan"
              name="YTD Plan"
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#planGrad)"
              dot={{ r: 2.5, fill: '#a855f7', stroke: '#a855f7' }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke={C.cyan}
              strokeWidth={2}
              fill="url(#actualGrad)"
              dot={{ r: 2.5, fill: C.cyan, stroke: C.cyan }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <div className="text-[9px] uppercase" style={{ color: C.textFaint, letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div className="text-sm font-semibold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// KEY-STAT LINE CARDS
// ============================================================
function KeyStatCard({
  title,
  metricKey,
}: {
  title: string;
  metricKey: MetricKey;
}) {
  const view = useView();
  const drill = useDrilldown();
  const planArr = view.plan[metricKey];
  const actualArr = view.actual[metricKey];
  const data = view.months.map((m, i) => ({
    month: m,
    plan: planArr[i],
    actual: actualArr[i],
  }));
  return (
    <div style={glassStyle} className="p-4">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => drill.open(metricKey)}
          className="text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-1 rounded text-left"
          style={{ color: C.textPrimary }}
        >
          {title}
        </button>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: C.textMuted }}>
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 0, borderTop: `1.5px dashed #a855f7`, display: 'inline-block' }} />
            Plan
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 12, height: 2, background: C.cyan, display: 'inline-block', borderRadius: 1 }} />
            Actual
          </span>
        </div>
      </div>
      <div style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
            onClick={(state: { activeTooltipIndex?: number } | null) => {
              if (state && typeof state.activeTooltipIndex === 'number') {
                drill.open(metricKey, state.activeTooltipIndex);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <CartesianGrid stroke={C.hairline} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: C.textFaint, fontSize: 10 }}
              axisLine={{ stroke: C.hairline }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: C.textFaint, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(8,8,12,0.95)',
                border: `1px solid ${C.surfaceBorder}`,
                borderRadius: 8,
                color: C.textPrimary,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="plan"
              stroke="#a855f7"
              strokeWidth={1.4}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={C.cyan}
              strokeWidth={2}
              dot={{ r: 2.5, fill: C.cyan }}
              activeDot={{
                r: 5,
                fill: C.cyan,
                stroke: C.cyan,
                style: { cursor: 'pointer' },
              }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================
// CONVERSION CARD (trailing-3-month ratios)
// ============================================================
function ConversionCard({
  title,
  value,
  subtitle,
  onClick,
  info,
  displayValue,
  Icon,
  deltaPct,
  deltaLabel,
  higherIsBetter = true,
  sparkData,
  sparkFormatter,
}: {
  title: string;
  value: number | null;
  subtitle?: string;
  onClick?: () => void;
  info?: React.ReactNode;
  /** Overrides the default percentage rendering (e.g. currency). */
  displayValue?: string;
  /** Optional icon rendered in the header square to match KpiCard. */
  Icon?: LucideIcon;
  /** Signed delta as a fraction (0.12 = +12%). Rendered as a chip like KpiCard. */
  deltaPct?: number | null;
  /** Optional custom label for the delta chip (e.g. "+3.4 pts"). Overrides percent formatting. */
  deltaLabel?: string | null;
  /** When false, negative deltas render green and positive red. */
  higherIsBetter?: boolean;
  /** Per-month spark values plotted underneath the big number, matching KpiCard. */
  sparkData?: { month: string; value: number | null }[];
  /** Tooltip value formatter for the sparkline. */
  sparkFormatter?: (v: number) => string;
}) {
  const display =
    displayValue !== undefined
      ? displayValue
      : value == null
        ? '—'
        : `${(value * 100).toFixed(value >= 1 ? 0 : 1)}%`;
  const clickable = !!onClick;
  const hasDelta = deltaPct != null && Number.isFinite(deltaPct);
  const positive = hasDelta ? (deltaPct as number) >= 0 : true;
  const good = higherIsBetter ? positive : !positive;
  return (
    <div
      style={glassStyle}
      className={`relative p-4 flex flex-col gap-2 overflow-hidden ${clickable ? 'cursor-pointer transition-transform hover:-translate-y-[1px] hover:brightness-110' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <div
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 28,
              height: 28,
              background: 'rgba(157,162,245,0.14)',
              color: C.periwinkle,
            }}
          >
            <Icon size={14} />
          </div>
        )}
        <div
          className="text-[10px] font-medium uppercase"
          style={{ color: C.textMuted, letterSpacing: '0.08em' }}
        >
          {title}
        </div>
        {info && (
          <TooltipProvider delayDuration={100}>
            <UITooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center rounded-sm p-0.5 text-white/40 hover:text-white/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                  aria-label={`${title} definition`}
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                {info}
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <div
          className="text-3xl font-semibold leading-none"
          style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}
        >
          {display}
        </div>
        {(hasDelta || deltaLabel) && (
          <div
            className="flex items-center gap-0.5 text-xs font-medium"
            style={{ color: good ? C.cyan : C.rose, fontVariantNumeric: 'tabular-nums' }}
          >
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {deltaLabel != null
              ? deltaLabel
              : `${positive ? '+' : '−'}${Math.abs(Math.round((deltaPct as number) * 100))}%`}
          </div>
        )}
      </div>
      {subtitle && (
        <div
          className="text-[11px]"
          style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}
        >
          {subtitle}
        </div>
      )}
      {sparkData && sparkData.length > 0 && (
        <div style={{ height: 160 }} className="mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.hairline} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: C.textFaint, fontSize: 10 }}
                axisLine={{ stroke: C.hairline }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: C.textFaint, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={32}
                tickFormatter={(v: number) =>
                  sparkFormatter ? sparkFormatter(v) : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(8,8,12,0.95)',
                  border: `1px solid ${C.surfaceBorder}`,
                  borderRadius: 8,
                  color: C.textPrimary,
                  fontSize: 12,
                }}
                formatter={(v: number) =>
                  sparkFormatter ? sparkFormatter(v) : String(v)
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={C.cyan}
                strokeWidth={2}
                dot={{ r: 2.5, fill: C.cyan }}
                activeDot={{ r: 5, fill: C.cyan, stroke: C.cyan }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Drilldown: Deals-on-Board to Proposal
// ============================================================
function OnBoardToProposalDrilldown({
  open,
  onOpenChange,
  anchorEnd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** End date of the initial trailing-12M window (usually dashboard rangeEnd). */
  anchorEnd: Date;
}) {
  type Granularity = 'month' | 'quarter' | 'year';
  const [granularity, setGranularity] = React.useState<Granularity>('year');
  const [tab, setTab] = React.useState<'nda' | 'proposal'>('nda');
  const [showBars, setShowBars] = React.useState(false);
  // Step offset from the anchor end, in units of the current granularity.
  // 0 = anchor, -1 = one step back, +1 = one step forward.
  const [step, setStep] = React.useState(0);
  React.useEffect(() => { setStep(0); }, [granularity, anchorEnd.getTime()]);

  const stepMonths = granularity === 'quarter' ? 3 : 1;
  // Window is ALWAYS trailing 12 months. Granularity only changes how far each
  // step moves the anchor (1M / 1Q / 1M for Trailing 12M) and how the range label is formatted.
  const windowMonths = 12;
  // For quarter granularity, snap the end to the end of the quarter that
  // contains the anchor's last month so the 12M window aligns to quarter
  // boundaries (e.g. Q3 25 – Q2 26 instead of May 25 – Apr 26).
  const anchorEndExclusive = React.useMemo(() => {
    const monthEndExclusive = firstDayOfMonthAfterUtc(anchorEnd);
    if (granularity !== 'quarter') return monthEndExclusive;
    // Last included month index (0-11)
    const lastMonth = new Date(monthEndExclusive.getTime());
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const qIdx = Math.floor(lastMonth.getUTCMonth() / 3); // 0..3
    const qEndMonth = qIdx * 3 + 3; // exclusive month index (may be 12)
    return new Date(Date.UTC(lastMonth.getUTCFullYear(), qEndMonth, 1));
  }, [anchorEnd, granularity]);

  // Compute [start, end) for the currently-selected period and the prior period.
  const { curStart, curEnd, prevStart, prevEnd, label, prevLabel } = React.useMemo(() => {
    const end = addMonthsClampedUtc(anchorEndExclusive, step * stepMonths);
    const start = addMonthsClampedUtc(end, -windowMonths);
    const pEnd = addMonthsClampedUtc(end, -stepMonths);
    const pStart = addMonthsClampedUtc(pEnd, -windowMonths);
    // TTM range label based on granularity. Data window is always 12 months.
    // TTM window label — show only the end period since data is always TTM.
    const fmtRange = (_rStart: Date, rEnd: Date): string => {
      const eDate = new Date(rEnd.getTime() - 1);
      if (granularity === 'quarter') {
        const eq = Math.floor(eDate.getUTCMonth() / 3) + 1;
        return `Q${eq} ${eDate.getUTCFullYear()}`;
      }
      const mFmt: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: 'UTC' };
      return eDate.toLocaleDateString('en-US', mFmt);
    };
    const lbl = fmtRange(start, end);
    const prevLbl = fmtRange(pStart, pEnd);
    return { curStart: start, curEnd: end, prevStart: pStart, prevEnd: pEnd, label: lbl, prevLabel: prevLbl };
  }, [anchorEndExclusive, step, stepMonths, windowMonths, granularity]);

  // Fetch a wide events window covering current + prior period + 12M chart trend.
  const wideStart = React.useMemo(() => {
    const chartStart = addMonthsClampedUtc(curEnd, -12);
    return chartStart < prevStart ? chartStart : prevStart;
  }, [curEnd, prevStart]);
  const wideEnd = curEnd;

  const ndaEvents = useStageEntryEvents('ndaneeds-list-sent', { start: wideStart, end: wideEnd });
  const proposalEvents = useStageEntryEvents('proposal-issued', { start: wideStart, end: wideEnd });

  const inRange = (iso: string, s: Date, e: Date) => {
    const t = new Date(iso).getTime();
    return t >= s.getTime() && t < e.getTime();
  };
  const distinctDealsInRange = (
    evts: { deal_id: string; changed_at: string }[],
    s: Date,
    e: Date,
  ) => {
    const set = new Set<string>();
    for (const ev of evts) if (inRange(ev.changed_at, s, e)) set.add(ev.deal_id);
    return set;
  };

  const ndaCur = distinctDealsInRange(ndaEvents.events, curStart, curEnd);
  const propCur = distinctDealsInRange(proposalEvents.events, curStart, curEnd);
  const ndaPrev = distinctDealsInRange(ndaEvents.events, prevStart, prevEnd);
  const propPrev = distinctDealsInRange(proposalEvents.events, prevStart, prevEnd);

  const ratio = ndaCur.size > 0 ? propCur.size / ndaCur.size : null;
  const prevRatio = ndaPrev.size > 0 ? propPrev.size / ndaPrev.size : null;
  const delta =
    ratio != null && prevRatio != null && prevRatio > 0
      ? (ratio - prevRatio) / prevRatio
      : null;

  // Monthly bucket series for the chart: last 12 months ending at curEnd.
  const chartData = React.useMemo(() => {
    const buckets: {
      key: string;
      label: string;
      nda: number;
      proposal: number;
      ratio: number | null;
    }[] = [];
    for (let i = 11; i >= 0; i--) {
      const bEnd = addMonthsClampedUtc(curEnd, -i);
      const bStart = addMonthsClampedUtc(bEnd, -1);
      const n = distinctDealsInRange(ndaEvents.events, bStart, bEnd).size;
      const p = distinctDealsInRange(proposalEvents.events, bStart, bEnd).size;
      buckets.push({
        key: `${bStart.getUTCFullYear()}-${bStart.getUTCMonth() + 1}`,
        label: new Date(bStart).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        nda: n,
        proposal: p,
        ratio: n > 0 ? Math.round((p / n) * 1000) / 10 : null,
      });
    }
    // Period-over-period % change on the ratio
    return buckets.map((b, i) => {
      const prev = i > 0 ? buckets[i - 1].ratio : null;
      let pop: number | null = null;
      if (b.ratio != null && prev != null && prev > 0) {
        pop = ((b.ratio - prev) / prev) * 100;
      }
      return { ...b, pop };
    });
  }, [curEnd, ndaEvents.events, proposalEvents.events]);

  const fmtUsd = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}MM`
      : n > 0
      ? `$${Math.round(n / 1000).toLocaleString()}K`
      : '—';
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  // Deal lists for the selected period tab.
  const tabRows = React.useMemo(() => {
    const evts = tab === 'nda' ? ndaEvents.events : proposalEvents.events;
    const seen = new Set<string>();
    const out: typeof evts = [];
    for (const ev of evts) {
      if (!inRange(ev.changed_at, curStart, curEnd)) continue;
      if (seen.has(ev.deal_id)) continue;
      seen.add(ev.deal_id);
      out.push(ev);
    }
    return out;
  }, [tab, ndaEvents.events, proposalEvents.events, curStart, curEnd]);

  const loading = ndaEvents.isLoading || proposalEvents.isLoading;
  const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
  const deltaColor =
    delta == null ? '#94a3b8' : delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#94a3b8';
  const deltaLabel =
    delta == null ? '—' : `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}% vs prior`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Deals-on-Board to Proposal (MSQL)</DialogTitle>
          <DialogDescription>
            Distinct deals entering each stage, sourced from stage-change history.
          </DialogDescription>
        </DialogHeader>

        {/* Period navigator */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-1">
            {(['month', 'quarter', 'year'] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                  granularity === g
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {g === 'year' ? 'Trailing 12M' : g}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-2 py-1 rounded text-slate-300 hover:bg-white/[0.06]"
              aria-label="Previous period"
            >
              ‹
            </button>
            <div className="text-sm font-medium text-slate-100 min-w-[160px] text-center tabular-nums">
              {label}
            </div>
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step >= 0}
              className="px-2 py-1 rounded text-slate-300 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next period"
            >
              ›
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Conversion</div>
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{pct(ratio)}</div>
            <div
              className="text-[11px] tabular-nums cursor-help"
              style={{ color: deltaColor }}
              title={`vs ${prevLabel}: ${pct(prevRatio)} (${propPrev.size} / ${ndaPrev.size})`}
            >
              {deltaLabel} ({prevLabel})
            </div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Entered NDA / Needs List</div>
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{ndaCur.size}</div>
            <div className="text-[11px] text-slate-400 tabular-nums">prior: {ndaPrev.size}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Entered Proposal Issued</div>
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{propCur.size}</div>
            <div className="text-[11px] text-slate-400 tabular-nums">prior: {propPrev.size}</div>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              Monthly trend · last 12 months
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBars}
                onChange={(e) => setShowBars(e.target.checked)}
                className="h-3 w-3 accent-blue-500"
              />
              Show stage volumes
            </label>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                {showBars && (
                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                )}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'linear-gradient(180deg, hsl(222, 47%, 18%) 0%, hsl(222, 47%, 9%) 100%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: 'hsl(0,0%,98%)',
                    fontSize: 12,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                  labelStyle={{ color: 'hsl(0,0%,98%)', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ color: 'hsl(0,0%,92%)' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(v: any, name: string) =>
                    name === 'Conversion' ? [`${v ?? '—'}%`, name] : [v, name]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#cbd5e1' }} />
                {showBars && (
                  <Bar yAxisId="left" dataKey="nda" name="Entered NDA" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                )}
                {showBars && (
                  <Bar yAxisId="left" dataKey="proposal" name="Entered Proposal" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                )}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="ratio"
                  name="Conversion"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                >
                  {!showBars && (
                    <LabelList
                      dataKey="pop"
                      position="top"
                      content={(props: any) => {
                        const { x, y, value } = props;
                        if (value == null || !isFinite(value)) return null;
                        const color = value > 0 ? '#22c55e' : value < 0 ? '#ef4444' : '#94a3b8';
                        const sign = value > 0 ? '+' : '';
                        return (
                          <text
                            x={x}
                            y={y - 6}
                            fill={color}
                            fontSize={10}
                            textAnchor="middle"
                          >
                            {`${sign}${value.toFixed(1)}%`}
                          </text>
                        );
                      }}
                    />
                  )}
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deal lists */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'nda' | 'proposal')}>
          <TabsList>
            <TabsTrigger value="nda">NDA / Needs List Sent ({ndaCur.size})</TabsTrigger>
            <TabsTrigger value="proposal">Proposal Issued ({propCur.size})</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Deal</th>
                    <th className="text-left px-3 py-2">Owner</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-right px-3 py-2">Entered</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td>
                    </tr>
                  ) : tabRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">No deals</td>
                    </tr>
                  ) : (
                    tabRows.map((d) => (
                      <tr key={d.deal_id} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <a href={`/deal/${d.deal_id}`} className="text-blue-400 hover:underline">
                            {d.company}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{d.manager ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(d.value)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{fmtDate(d.changed_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Drilldown: Call-to-Deal Conversion
// ============================================================
function CallToDealDrilldown({
  open,
  onOpenChange,
  ttmRanges,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ttmRanges: {
    ttmStart: Date;
    ttmEnd: Date;
    priorStart: Date;
    priorEnd: Date;
    periodMonths: number;
  };
}) {
  const [period, setPeriod] = React.useState<'current' | 'prior'>('current');
  const [tab, setTab] = React.useState<'deals' | 'calls'>('deals');

  // Fetch one wide window covering priorStart → ttmEnd and split client-side,
  // so toggling Current ↔ Prior TTM never triggers a refetch and both windows
  // are cached together. Same for the sales calls edge-function call.
  const wideNda = useStageEntryEvents('ndaneeds-list-sent', {
    start: ttmRanges.priorStart,
    end: ttmRanges.ttmEnd,
  });
  const wideCalls = useSalesCallsCount(ttmRanges.priorStart, ttmRanges.ttmEnd, open, 'debt');

  const ndaCurrentEvents = React.useMemo(
    () => wideNda.events.filter((e) => {
      const t = new Date(e.changed_at).getTime();
      return t >= ttmRanges.ttmStart.getTime() && t < ttmRanges.ttmEnd.getTime();
    }),
    [wideNda.events, ttmRanges.ttmStart, ttmRanges.ttmEnd],
  );
  const ndaPriorEvents = React.useMemo(
    () => wideNda.events.filter((e) => {
      const t = new Date(e.changed_at).getTime();
      return t >= ttmRanges.priorStart.getTime() && t < ttmRanges.priorEnd.getTime();
    }),
    [wideNda.events, ttmRanges.priorStart, ttmRanges.priorEnd],
  );
  const wideCallEvents = wideCalls.data?.events ?? [];
  const callsCurrentEvents = React.useMemo(
    () => wideCallEvents.filter((e) => {
      const t = e.start ? new Date(e.start).getTime() : 0;
      return t >= ttmRanges.ttmStart.getTime() && t < ttmRanges.ttmEnd.getTime();
    }),
    [wideCallEvents, ttmRanges.ttmStart, ttmRanges.ttmEnd],
  );
  const callsPriorEvents = React.useMemo(
    () => wideCallEvents.filter((e) => {
      const t = e.start ? new Date(e.start).getTime() : 0;
      return t >= ttmRanges.priorStart.getTime() && t < ttmRanges.priorEnd.getTime();
    }),
    [wideCallEvents, ttmRanges.priorStart, ttmRanges.priorEnd],
  );

  const fmtRangeLabel = (end: Date): string => {
    const e = new Date(end.getTime() - 1);
    if (ttmRanges.periodMonths === 3) {
      const q = Math.floor(e.getUTCMonth() / 3) + 1;
      return `Q${q} ${e.getUTCFullYear()}`;
    }
    if (ttmRanges.periodMonths === 12) return `${e.getUTCFullYear()}`;
    return e.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  const currentLabel = fmtRangeLabel(ttmRanges.ttmEnd);
  const priorLabel = fmtRangeLabel(ttmRanges.priorEnd);

  const activeStart = period === 'current' ? ttmRanges.ttmStart : ttmRanges.priorStart;
  const activeEnd = period === 'current' ? ttmRanges.ttmEnd : ttmRanges.priorEnd;

  const distinctDeals = React.useMemo(() => {
    const evts = period === 'current' ? ndaCurrentEvents : ndaPriorEvents;
    const seen = new Set<string>();
    const out: typeof evts = [];
    for (const ev of evts) {
      if (seen.has(ev.deal_id)) continue;
      seen.add(ev.deal_id);
      out.push(ev);
    }
    return out;
  }, [period, ndaCurrentEvents, ndaPriorEvents]);

  const callEvents = React.useMemo(() => {
    const raw = filterSalesCallEventsForVariant(
      period === 'current' ? callsCurrentEvents : callsPriorEvents,
      'debt',
    );
    // Dedupe by dedupe_key (same meeting across teammate calendars).
    const seen = new Set<string>();
    const out: typeof raw = [];
    for (const ev of raw) {
      const key = ev.dedupe_key || ev.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
    // Sort newest first.
    out.sort((a, b) => {
      const ta = a.start ? new Date(a.start).getTime() : 0;
      const tb = b.start ? new Date(b.start).getTime() : 0;
      return tb - ta;
    });
    return out;
  }, [period, callsCurrentEvents, callsPriorEvents]);

  const dealsCount = distinctDeals.length;
  const callsCount = callEvents.length;
  const ratio = callsCount > 0 ? dealsCount / callsCount : null;
  const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

  const fmtUsd = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}MM`
      : n > 0
      ? `$${Math.round(n / 1000).toLocaleString()}K`
      : '—';
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  const fmtWindow = (s: Date, e: Date) => {
    const eDate = new Date(e.getTime() - 1);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric', timeZone: 'UTC' };
    return `${s.toLocaleDateString('en-US', opts)} – ${eDate.toLocaleDateString('en-US', opts)}`;
  };

  const dealsLoading = wideNda.isLoading;
  const callsLoading = wideCalls.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Call-to-Deal Conversion</DialogTitle>
          <DialogDescription>
            Distinct deals entering “NDA / Needs List Sent” ÷ debt sales calls
            (titled “[Company] &lt;&gt; 5th Line Financing Review”) over the
            trailing 12 months.
          </DialogDescription>
        </DialogHeader>

        {/* Period toggle */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
          <div className="flex items-center gap-1">
            {(['current', 'prior'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                  period === p
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {p === 'current' ? `Current TTM · ${currentLabel}` : `Prior TTM · ${priorLabel}`}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-400 tabular-nums">
            {fmtWindow(activeStart, activeEnd)}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Conversion</div>
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{pct(ratio)}</div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              {dealsCount} deals ÷ {callsCount} calls
            </div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Deals · Numerator
            </div>
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{dealsCount}</div>
            <div className="text-[11px] text-slate-400">Entered NDA / Needs List Sent</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              Calls · Denominator
            </div>
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{callsCount}</div>
            <div className="text-[11px] text-slate-400">Debt Financing Review calls</div>
          </div>
        </div>

        {/* Deal / Call lists */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'deals' | 'calls')}>
          <TabsList>
            <TabsTrigger value="deals">Deals ({dealsCount})</TabsTrigger>
            <TabsTrigger value="calls">Calls ({callsCount})</TabsTrigger>
          </TabsList>

          <TabsContent value="deals" className="mt-3">
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Deal</th>
                    <th className="text-left px-3 py-2">Owner</th>
                    <th className="text-right px-3 py-2">Value</th>
                    <th className="text-right px-3 py-2">Entered NDA</th>
                  </tr>
                </thead>
                <tbody>
                  {dealsLoading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td>
                    </tr>
                  ) : distinctDeals.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">No deals</td>
                    </tr>
                  ) : (
                    distinctDeals.map((d) => (
                      <tr key={d.deal_id} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <a href={`/deal/${d.deal_id}`} className="text-blue-400 hover:underline">
                            {d.company}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-slate-300">{d.manager ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(d.value)}</td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{fmtDate(d.changed_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="calls" className="mt-3">
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/95 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">Call</th>
                    <th className="text-left px-3 py-2">Company</th>
                    <th className="text-left px-3 py-2">Host</th>
                    <th className="text-right px-3 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {callsLoading ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">Loading…</td>
                    </tr>
                  ) : callEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">No calls</td>
                    </tr>
                  ) : (
                    callEvents.map((ev) => {
                      const when = ev.start ? fmtDateTime(ev.start) : '—';
                      const titleCell = ev.html_link ? (
                        <a
                          href={ev.html_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          {ev.title || '(untitled)'}
                        </a>
                      ) : (
                        <span className="text-slate-200">{ev.title || '(untitled)'}</span>
                      );
                      return (
                        <tr key={ev.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                          <td className="px-3 py-2">{titleCell}</td>
                          <td className="px-3 py-2 text-slate-300">{ev.company || '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{ev.user_name || ev.user_email || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-300 tabular-nums">{when}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Sum the trailing 3 buckets ending at the most recent month with data.
// Returns null if any of those 3 buckets is null (still loading).
function trailing3(buckets: (number | null)[]): number | null {
  const today = new Date();
  let endIdx: number;
  if (today.getUTCFullYear() > 2026) endIdx = 8;
  else if (today.getUTCFullYear() < 2026) return null;
  else endIdx = Math.min(8, today.getUTCMonth());
  const startIdx = Math.max(0, endIdx - 2);
  let total = 0;
  for (let i = startIdx; i <= endIdx; i += 1) {
    const v = buckets[i];
    if (v == null) return null;
    total += v;
  }
  return total;
}

// ============================================================
// SALES MODEL SHEET
// ============================================================
type SheetTab = 'Forecast' | 'Actuals' | 'Variance';

// ---- Full-forecast draft model --------------------------------------------
// The editor operates on this shape (full year + any user-appended
// months/quarters/years) independent of the dashboard's timeframe view.
interface FullForecastColumn {
  key: string;   // "YYYY-M" (M = 0-based month)
  label: string; // e.g. "Jan '26"
}
interface FullForecastDraft {
  columns: FullForecastColumn[];
  data: Record<MetricKey, number[]>;
}

function columnKey(year: number, monthIdx: number): string {
  return `${year}-${monthIdx}`;
}
function columnLabel(year: number, monthIdx: number): string {
  const yy = String(year).slice(-2);
  return `${MONTHS_ALL[monthIdx]} '${yy}`;
}

function seedColumns(year: number): FullForecastColumn[] {
  return MONTHS_ALL.map((_, i) => ({
    key: columnKey(year, i),
    label: columnLabel(year, i),
  }));
}

function seedRowForYear(k: MetricKey, year: number): number[] {
  // For the SEED_YEAR, fill from authored PLAN where available, else 0.
  return MONTHS_ALL.map((_, monIdx) => {
    if (year === SEED_YEAR) {
      const seedIdx = SEED_MONTH_INDEXES.indexOf(monIdx);
      if (seedIdx >= 0) return PLAN[k][seedIdx] ?? 0;
    }
    return 0;
  });
}

function buildInitialFullDraft(): FullForecastDraft {
  const columns = seedColumns(SEED_YEAR);
  const data = {} as Record<MetricKey, number[]>;
  (Object.keys(PLAN) as MetricKey[]).forEach((k) => {
    data[k] = seedRowForYear(k, SEED_YEAR);
  });
  return { columns, data };
}

function appendMonthsToDraft(draft: FullForecastDraft, count: number): FullForecastDraft {
  if (count <= 0) return draft;
  const last = draft.columns[draft.columns.length - 1];
  let [y, m] = last ? last.key.split('-').map(Number) : [SEED_YEAR, -1];
  const newCols: FullForecastColumn[] = [];
  for (let i = 0; i < count; i += 1) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    newCols.push({ key: columnKey(y, m), label: columnLabel(y, m) });
  }
  const data = {} as Record<MetricKey, number[]>;
  (Object.keys(draft.data) as MetricKey[]).forEach((k) => {
    data[k] = [...draft.data[k], ...newCols.map(() => 0)];
  });
  return { columns: [...draft.columns, ...newCols], data };
}

function SalesModelSheet() {
  const [tab, setTab] = React.useState<SheetTab>('Forecast');
  const view = useView();
  const drill = useDrilldown();
  const E = view.elapsed;
  const [editorOpen, setEditorOpen] = React.useState(false);

  // Forecast draft is owned at the dashboard level so PerformancePanel and
  // the Sales Model editor share the same source of truth. `view.plan` is
  // already merged with these overrides upstream.
  const { fullDraft, setFullDraft } = useForecast();
  const effectivePlan = view.plan;

  const renderCell = (row: RowDef, i: number): React.ReactNode => {
    const planV = effectivePlan[row.key][i];
    const actualV = view.actual[row.key][i];
    if (tab === 'Forecast') {
      return (
        <span style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
          {fmtRow(planV, row.type)}
        </span>
      );
    }
    if (tab === 'Actuals') {
      if (actualV === null || actualV === undefined) {
        return <span style={{ color: C.textFaint }}>—</span>;
      }
      return (
        <span style={{ color: C.cyan, fontVariantNumeric: 'tabular-nums' }}>
          {fmtRow(actualV, row.type)}
        </span>
      );
    }
    // Variance
    if (actualV === null || actualV === undefined) {
      return <span style={{ color: C.textFaint }}>—</span>;
    }
    const v = actualV - planV;
    const color = v >= 0 ? C.cyan : C.rose;
    const formatted = row.type === 'money' ? fmtSignedMoney(v) : fmtSignedCount(v);
    return (
      <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{formatted}</span>
    );
  };

  return (
    <div style={glassStyle} className="p-5 overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} style={{ color: C.periwinkle }} />
          <div className="text-sm font-semibold" style={{ color: C.textPrimary }}>
            Sales Model
          </div>
          <div className="text-[11px]" style={{ color: C.textFaint }}>
            Monthly Forecast · {view.label}
          </div>
        </div>
        <div
          className="inline-flex p-0.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.surfaceBorder}` }}
          role="tablist"
        >
          {(['Forecast', 'Actuals', 'Variance'] as SheetTab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                className="px-3 py-1 text-[11px] font-medium rounded-md focus-visible:outline-none focus-visible:ring-2 transition-colors"
                style={{
                  color: active ? C.periwinkle : C.textMuted,
                  background: active ? 'rgba(157,162,245,0.14)' : 'transparent',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto sales-model-scroll">
        <table
          className="border-collapse"
          style={{
            width: '100%',
            minWidth: 880,
            fontSize: 12,
            color: C.textPrimary,
          }}
        >
          <thead>
            <tr>
              <th
                className="text-left px-3 py-2 sticky left-0 z-10"
                style={{
                  background: 'rgba(12,12,18,0.95)',
                  color: C.textMuted,
                  fontWeight: 500,
                  borderBottom: `1px solid ${C.hairline}`,
                  minWidth: 220,
                }}
              >
                Metric
              </th>
              {view.months.map((m, i) => {
                const isFuture = i >= E;
                return (
                  <th
                    key={m}
                    className="text-right px-3 py-2"
                    style={{
                      color: C.textMuted,
                      fontWeight: 500,
                      borderBottom: `1px solid ${C.hairline}`,
                      background: isFuture ? 'rgba(157,162,245,0.04)' : 'transparent',
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 70,
                    }}
                  >
                    {m}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROW_ORDER.map((row, rIdx) => (
              <tr
                key={row.key}
                style={{ background: rIdx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
              >
                <td
                  className="px-3 py-2 sticky left-0 z-10"
                  style={{
                    background: rIdx % 2 === 1 ? 'rgba(12,12,18,0.97)' : 'rgba(12,12,18,0.95)',
                    color: C.textPrimary,
                    fontWeight: row.bold ? 600 : 400,
                    borderBottom: `1px solid ${C.hairline}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => drill.open(row.key)}
                    className="hover:underline focus-visible:outline-none focus-visible:ring-1 rounded"
                    style={{ color: 'inherit', fontWeight: 'inherit' }}
                  >
                    {row.label}
                  </button>
                  {row.type === 'money' && (
                    <span className="ml-1 text-[10px]" style={{ color: C.textFaint }}>
                      $MM
                    </span>
                  )}
                </td>
                {view.months.map((m, i) => {
                  const isFuture = i >= E;
                  return (
                    <td
                      key={m}
                      className="px-3 py-2 text-right cursor-pointer hover:bg-white/[0.04]"
                      onClick={() => drill.open(row.key, i)}
                      style={{
                        borderBottom: `1px solid ${C.hairline}`,
                        background: isFuture ? 'rgba(157,162,245,0.04)' : 'transparent',
                      }}
                    >
                      {renderCell(row, i)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px]" style={{ color: C.textMuted }}>
        {E > 0 && (
          <>
            <span style={{ color: C.cyan }}>
              {view.months[0]}–{view.months[E - 1]} actuals tracked
            </span>
            {E < view.months.length && <span> · </span>}
          </>
        )}
        {E < view.months.length && (
          <span style={{ color: C.periwinkle }}>
            {view.months[E]}–{view.months[view.months.length - 1]} forecast
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
          style={{
            color: C.textPrimary,
            background: 'rgba(157,162,245,0.10)',
            border: `1px solid ${C.surfaceBorder}`,
          }}
        >
          <Table2 size={12} style={{ color: C.periwinkle }} />
          Edit Forecast
        </button>
      </div>

      {editorOpen && (
        <SalesModelForecastEditor
          initialDraft={fullDraft}
          onClose={() => setEditorOpen(false)}
          onSave={(next) => {
            setFullDraft(next);
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// SALES MODEL — FORECAST EDITOR (Excel-style)
// Edits are held locally to the Sales Model widget's Forecast column.
// ============================================================
function SalesModelForecastEditor({
  initialDraft,
  onClose,
  onSave,
}: {
  initialDraft: FullForecastDraft;
  onClose: () => void;
  onSave: (next: FullForecastDraft) => void;
}) {
  const cloneDraft = (d: FullForecastDraft): FullForecastDraft => {
    const data = {} as Record<MetricKey, number[]>;
    (Object.keys(d.data) as MetricKey[]).forEach((k) => { data[k] = [...d.data[k]]; });
    return { columns: [...d.columns], data };
  };
  const [draft, setDraft] = React.useState<FullForecastDraft>(() => cloneDraft(initialDraft));
  const columns = draft.columns;
  const months = React.useMemo(() => columns.map((c) => c.label), [columns]);
  const [active, setActive] = React.useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const inputsRef = React.useRef<(HTMLInputElement | null)[][]>([]);

  React.useEffect(() => {
    inputsRef.current = ROW_ORDER.map(() => months.map(() => null));
  }, [months]);

  React.useEffect(() => {
    const el = inputsRef.current[active.r]?.[active.c];
    if (el) el.focus();
  }, [active]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const move = (r: number, c: number) => {
    const nr = Math.max(0, Math.min(ROW_ORDER.length - 1, r));
    const nc = Math.max(0, Math.min(months.length - 1, c));
    setActive({ r: nr, c: nc });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); move(r - 1, c); }
    else if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); move(r + 1, c); }
    else if (e.key === 'Tab') { e.preventDefault(); move(r, c + (e.shiftKey ? -1 : 1)); }
  };

  const commit = (r: number, c: number, raw: string) => {
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    setDraft((prev) => {
      const next = cloneDraft(prev);
      next.data[ROW_ORDER[r].key][c] = num;
      return next;
    });
  };

  const addMonths = (count: number) => {
    setDraft((prev) => appendMonthsToDraft(prev, count));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="relative w-full max-w-[1200px] max-h-[88vh] flex flex-col rounded-lg border shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          background: 'linear-gradient(180deg, hsl(240 15% 8%), hsl(240 20% 5%))',
          borderColor: C.surfaceBorder,
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.hairline }}>
          <div>
            <h2 className="text-base font-semibold tracking-tight" style={{ color: C.textPrimary }}>
              Sales Model — Edit Forecast
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: C.textFaint }}>
              Edits apply to the Sales Model widget's Forecast column.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 hover:bg-white/[0.08]"
            style={{ color: C.textMuted }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <table className="border-separate border-spacing-0 text-xs" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 text-left font-medium px-3 py-2 border-b border-r min-w-[210px]"
                  style={{ background: 'hsl(240 18% 10%)', color: C.textMuted, borderColor: C.hairline, fontFamily: 'Inter, sans-serif' }}
                >
                  Metric
                </th>
                {months.map((m, i) => (
                  <th
                    key={`${m}-${i}`}
                    className="sticky top-0 z-20 text-right font-medium px-3 py-2 border-b whitespace-nowrap min-w-[110px]"
                    style={{
                      background: 'hsl(240 18% 10%)',
                      color: active.c === i ? C.cyan : C.textMuted,
                      borderColor: C.hairline,
                    }}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_ORDER.map((row, r) => (
                <tr key={row.key}>
                  <td
                    className="sticky left-0 z-10 px-3 py-1.5 border-b border-r whitespace-nowrap"
                    style={{
                      background: 'hsl(240 18% 10%)',
                      color: active.r === r ? C.periwinkle : C.textPrimary,
                      borderColor: C.hairline,
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {row.label}
                    {row.type === 'money' && (
                      <span className="ml-1 text-[10px]" style={{ color: C.textFaint }}>$MM</span>
                    )}
                  </td>
                  {months.map((_, c) => {
                    const isActive = active.r === r && active.c === c;
                    return (
                      <td
                        key={c}
                        className="border-b p-0"
                        style={{
                          borderColor: C.hairline,
                          background: isActive ? 'rgba(157,162,245,0.08)' : 'transparent',
                        }}
                      >
                        <input
                          ref={(el) => {
                            if (!inputsRef.current[r]) inputsRef.current[r] = [];
                            inputsRef.current[r][c] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          defaultValue={String(draft.data[row.key][c] ?? 0)}
                          key={`${r}-${c}-${draft.data[row.key][c]}-${columns[c].key}`}
                          onFocus={() => setActive({ r, c })}
                          onKeyDown={(e) => handleKey(e, r, c)}
                          onBlur={(e) => commit(r, c, e.target.value)}
                          className="w-full bg-transparent text-right tabular-nums px-3 py-1.5 outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-400/60"
                          style={{ color: C.textPrimary }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px]" style={{ color: C.textFaint }}>
            Tip: Arrow keys / Tab / Enter to navigate · dollar rows are stored as raw numbers and displayed as $MM.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t" style={{ borderColor: C.hairline, background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: C.textFaint }}>Add</span>
            {([['+ Month', 1], ['+ Quarter', 3], ['+ Year', 12]] as const).map(([label, n]) => (
              <button
                key={label}
                type="button"
                onClick={() => addMonths(n)}
                className="px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                style={{
                  color: C.textPrimary,
                  background: 'rgba(157,162,245,0.10)',
                  border: `1px solid ${C.surfaceBorder}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-[12px]"
            style={{ color: C.textMuted }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white"
            style={{ background: 'linear-gradient(90deg, #6366F1, #22D3EE)' }}
          >
            <Save size={13} />
            Save
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// METRIC DRILLDOWN DIALOG
// ============================================================
interface SalesCallEvent {
  title?: string;
  start?: string;
  end?: string;
  organizer?: string;
  attendees?: unknown;
  calendar_owner?: string;
  ical_uid?: string | null;
}

function MetricDrilldownDialog({
  focus,
  onClose,
  countView,
  valueView,
  pipelineVariant,
  initialValueMode,
  salesCallEvents,
  salesCallsLoading,
  salesCallsError,
  dealsOnBoard,
  dealsOnBoardLoading,
  dealsOnBoardError,
  proposalsIssued,
  proposalsIssuedLoading,
  proposalsIssuedError,
}: {
  focus: DrilldownFocus | null;
  onClose: () => void;
  countView: DashboardView;
  valueView: DashboardView;
  pipelineVariant: 'debt' | 'finserv';
  initialValueMode: 'count' | 'value';
  salesCallEvents: SalesCallEvent[];
  salesCallsLoading?: boolean;
  salesCallsError?: Error | null;
  dealsOnBoard: Array<DealOnBoardEntry | FinservStageEntry>;
  dealsOnBoardLoading?: boolean;
  dealsOnBoardError?: Error | null;
  proposalsIssued: Array<ProposalIssuedEntry | FinservStageEntry>;
  proposalsIssuedLoading?: boolean;
  proposalsIssuedError?: Error | null;
}) {
  if (!focus) return null;
  const row = ROW_ORDER.find((r) => r.key === focus.metricKey);
  if (!row) return null;

  // Local toggle so the user can flip between # and $ without closing the dialog.
  // Sales Calls has no dollar equivalent — force count.
  const canToggleValue = row.key === 'dealsOnBoard' || row.key === 'proposalsIssued';
  const [valueMode, setValueMode] = React.useState<'count' | 'value'>(
    canToggleValue ? initialValueMode : 'count',
  );
  React.useEffect(() => {
    setValueMode(canToggleValue ? initialValueMode : 'count');
    // Reset when focus changes so the toggle re-syncs with the parent choice.
  }, [focus.metricKey, canToggleValue, initialValueMode]);

  const view = valueMode === 'value' ? valueView : countView;
  const effectiveRowType: 'count' | 'money' =
    valueMode === 'value' && canToggleValue ? 'money' : row.type;

  const planArr = view.plan[row.key];
  const actualArr = view.actual[row.key];
  const E = view.elapsed;

  const totalActual = actualArr.slice(0, E).reduce<number>((a, b) => a + (b ?? 0), 0);
  const totalPlan = planArr.slice(0, E).reduce((a, b) => a + b, 0);
  const variance = totalActual - totalPlan;
  const attainment = totalPlan === 0 ? 0 : totalActual / totalPlan;

  // Optional: list of underlying sales-call events for the focused month/period
  const showCallEvents = row.key === 'salesCalls';
  let eventsInPeriod: SalesCallEvent[] = [];
  if (showCallEvents) {
    const start = view.rangeStart;
    const end = view.rangeEnd;
    eventsInPeriod = salesCallEvents.filter((ev) => {
      if (!isSalesCallEventForVariant(ev.title || '', pipelineVariant)) return false;
      if (!ev.start) return false;
      const d = new Date(ev.start);
      return d >= start && d <= end;
    });
    if (focus.monthIndex !== undefined && focus.monthIndex >= 0) {
      const f = new Date(view.rangeStart);
      f.setUTCMonth(f.getUTCMonth() + focus.monthIndex);
      const fy = f.getUTCFullYear();
      const fm = f.getUTCMonth();
      eventsInPeriod = eventsInPeriod.filter((ev) => {
        if (!ev.start) return false;
        const d = new Date(ev.start);
        return d.getUTCFullYear() === fy && d.getUTCMonth() === fm;
      });
    }
    eventsInPeriod = eventsInPeriod.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  }

  // Optional: list of underlying Deals on Board for the focused month/period
  const showDealsOnBoard = row.key === 'dealsOnBoard';
  let dealsInPeriod: Array<DealOnBoardEntry | FinservStageEntry> = [];
  if (showDealsOnBoard) {
    const start = view.rangeStart;
    const end = view.rangeEnd;
    dealsInPeriod = dealsOnBoard.filter((d) => {
      const c = new Date('created_at' in d ? d.created_at : d.entered_at);
      return c >= start && c <= end;
    });
    if (focus.monthIndex !== undefined && focus.monthIndex >= 0) {
      const f = new Date(view.rangeStart);
      f.setUTCMonth(f.getUTCMonth() + focus.monthIndex);
      const fy = f.getUTCFullYear();
      const fm = f.getUTCMonth();
      dealsInPeriod = dealsInPeriod.filter((d) => {
        const c = new Date('created_at' in d ? d.created_at : d.entered_at);
        return c.getUTCFullYear() === fy && c.getUTCMonth() === fm;
      });
    }
    dealsInPeriod = dealsInPeriod.sort((a, b) =>
      (('created_at' in a ? a.created_at : a.entered_at) ?? '').localeCompare(
        ('created_at' in b ? b.created_at : b.entered_at) ?? '',
      ),
    );
  }

  // Optional: list of underlying Proposals Issued for the focused month/period
  const showProposalsIssued = row.key === 'proposalsIssued';
  let proposalsInPeriod: Array<ProposalIssuedEntry | FinservStageEntry> = [];
  if (showProposalsIssued) {
    const start = view.rangeStart;
    const end = view.rangeEnd;
    proposalsInPeriod = proposalsIssued.filter((d) => {
      const c = new Date(d.entered_at);
      return c >= start && c <= end;
    });
    if (focus.monthIndex !== undefined && focus.monthIndex >= 0) {
      const f = new Date(view.rangeStart);
      f.setUTCMonth(f.getUTCMonth() + focus.monthIndex);
      const fy = f.getUTCFullYear();
      const fm = f.getUTCMonth();
      proposalsInPeriod = proposalsInPeriod.filter((d) => {
        const c = new Date(d.entered_at);
        return c.getUTCFullYear() === fy && c.getUTCMonth() === fm;
      });
    }
    proposalsInPeriod = proposalsInPeriod.sort((a, b) =>
      (a.entered_at ?? '').localeCompare(b.entered_at ?? ''),
    );
  }

  const focusedMonthLabel =
    focus.monthIndex !== undefined ? view.months[focus.monthIndex] : null;

  return (
    <Dialog open={!!focus} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto p-4 sm:p-6"
        style={{
          background: 'rgba(12,12,18,0.98)',
          border: `1px solid ${C.surfaceBorder}`,
          color: C.textPrimary,
        }}
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle style={{ color: C.textPrimary }}>
              {row.label}
              {focusedMonthLabel && (
                <span className="ml-2 text-xs font-normal" style={{ color: C.textMuted }}>
                  · {focusedMonthLabel}
                </span>
              )}
            </DialogTitle>
            {canToggleValue && (
              <div
                role="group"
                aria-label="Toggle count or dollar value"
                className="inline-flex items-center rounded-md overflow-hidden shrink-0"
                style={{ border: `1px solid ${C.surfaceBorder}`, background: 'rgba(255,255,255,0.04)' }}
              >
                {(['count', 'value'] as const).map((m) => {
                  const active = valueMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setValueMode(m)}
                      className="px-2.5 py-1 text-[11px] font-semibold transition-colors"
                      style={{
                        color: active ? C.textPrimary : C.textMuted,
                        background: active ? 'rgba(157,162,245,0.18)' : 'transparent',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {m === 'count' ? '#' : '$'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogDescription style={{ color: C.textMuted }}>
            {view.label} · breakdown of the underlying data
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stats" className="mt-3">
          <TabsList
            className="mb-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.surfaceBorder}` }}
          >
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>
          <TabsContent value="stats" className="mt-0">
        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-3">
          <SummaryTile label="Actual" value={fmtRow(totalActual, effectiveRowType)} color={C.cyan} />
          <SummaryTile label="Plan" value={fmtRow(totalPlan, effectiveRowType)} color="#a855f7" />
          <SummaryTile
            label="Variance"
            value={effectiveRowType === 'money' ? fmtSignedMoney(variance) : fmtSignedCount(variance)}
            color={variance >= 0 ? C.cyan : C.rose}
          />
          <SummaryTile label="Attainment" value={fmtPct(attainment)} color={statusColor(attainment)} />
        </div>

        {/* Monthly breakdown */}
        <div className="mt-4 overflow-x-auto sales-model-scroll">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: C.textMuted, fontSize: 11 }}>
                <th className="text-left px-3 py-2">Month</th>
                <th className="text-right px-3 py-2">Plan</th>
                <th className="text-right px-3 py-2">Actual</th>
                <th className="text-right px-3 py-2">Variance</th>
                <th className="text-right px-3 py-2">Attainment</th>
              </tr>
            </thead>
            <tbody>
              {view.months.map((m, i) => {
                const p = planArr[i] ?? 0;
                const a = actualArr[i];
                const v = a === null || a === undefined ? null : a - p;
                const att = a === null || a === undefined || p === 0 ? null : a / p;
                const isFocused = focus.monthIndex === i;
                const isFuture = i >= E;
                return (
                  <tr
                    key={m}
                    style={{
                      borderTop: `1px solid ${C.hairline}`,
                      background: isFocused ? 'rgba(157,162,245,0.10)' : 'transparent',
                      fontVariantNumeric: 'tabular-nums',
                      color: isFuture ? C.textMuted : C.textPrimary,
                    }}
                  >
                    <td className="px-3 py-2">{m}</td>
                    <td className="text-right px-3 py-2">{fmtRow(p, effectiveRowType)}</td>
                    <td className="text-right px-3 py-2" style={{ color: a == null ? C.textFaint : C.cyan }}>
                      {a == null ? '—' : fmtRow(a, effectiveRowType)}
                    </td>
                    <td
                      className="text-right px-3 py-2"
                      style={{ color: v == null ? C.textFaint : v >= 0 ? C.cyan : C.rose }}
                    >
                      {v == null
                        ? '—'
                        : effectiveRowType === 'money'
                          ? fmtSignedMoney(v)
                          : fmtSignedCount(v)}
                    </td>
                    <td
                      className="text-right px-3 py-2"
                      style={{ color: att == null ? C.textFaint : statusColor(att) }}
                    >
                      {att == null ? '—' : fmtPct(att)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sales-call event list (live data) */}
        {showCallEvents && (
          <div className="mt-5">
            <div
              className="text-[10px] font-medium uppercase mb-2"
              style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
            >
              Qualifying calendar events ({eventsInPeriod.length})
            </div>
            <div
              className="max-h-64 overflow-y-auto rounded-md"
              style={{ border: `1px solid ${C.surfaceBorder}` }}
            >
              {eventsInPeriod.length === 0 ? (
                <div className="px-3 py-4 text-xs" style={{ color: C.textMuted }}>
                  {salesCallsLoading
                    ? 'Loading qualifying calendar events…'
                    : salesCallsError
                      ? 'Could not load qualifying calendar events. The metric is unavailable until the calendar scan succeeds.'
                      : pipelineVariant === 'finserv'
                        ? 'No qualifying "5th Line <> [Company] Financial Review" events in this period.'
                        : 'No qualifying "[Company] <> 5th Line Financing Review" events in this period.'}
                </div>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: C.textMuted, fontSize: 10 }}>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider">Call Title</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-32">Date</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-56">5th Line Attendees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsInPeriod.map((ev, i) => {
                      const d = ev.start ? new Date(ev.start) : null;
                      const when = d
                        ? d.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—';
                      const attendeeNames =
                        ((ev.attendees ?? []) as { email: string | null; name: string | null }[])
                          .map((a) => a.name || (a.email ? a.email.split('@')[0] : null))
                          .filter((n): n is string => !!n)
                          .join(', ') || '—';
                      return (
                        <tr
                          key={`${ev.ical_uid ?? i}-${ev.start ?? i}`}
                          style={{ borderTop: `1px solid ${C.hairline}`, color: C.textPrimary }}
                        >
                          <td className="px-3 py-2 font-medium">{ev.title ?? '(untitled)'}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: C.textMuted }}>{when}</td>
                          <td className="px-3 py-2" style={{ color: C.textMuted }}>{attendeeNames}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Deals on Board list (live data) */}
        {showDealsOnBoard && (
          <div className="mt-5">
            <div
              className="text-[10px] font-medium uppercase mb-2"
              style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
            >
              Deals counted ({dealsInPeriod.length})
            </div>
            <div
              className="max-h-64 overflow-y-auto rounded-md"
              style={{ border: `1px solid ${C.surfaceBorder}` }}
            >
              {dealsInPeriod.length === 0 ? (
                <div className="px-3 py-4 text-xs" style={{ color: C.textMuted }}>
                  {dealsOnBoardLoading
                    ? 'Loading deals…'
                    : dealsOnBoardError
                      ? `Could not load deals from the ${pipelineVariant === 'finserv' ? 'FinServ' : 'Active'} Pipeline.`
                      : pipelineVariant === 'finserv'
                        ? 'No FinServ deals entered Qualification in this period.'
                        : 'No deals added to the Active Pipeline in this period.'}
                </div>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: C.textMuted, fontSize: 10 }}>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider">Deal</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-32">{pipelineVariant === 'finserv' ? 'Entered' : 'Added'}</th>
                      <th className="text-right px-3 py-2 font-medium uppercase tracking-wider w-32">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealsInPeriod.map((d) => {
                      const eventDate = 'created_at' in d ? d.created_at : d.entered_at;
                      const when = new Date(eventDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                      const v = d.value
                        ? `$${(d.value / 1_000_000).toFixed(1)}MM`
                        : '—';
                      return (
                        <tr
                          key={d.id}
                          style={{ borderTop: `1px solid ${C.hairline}`, color: C.textPrimary }}
                        >
                          <td className="px-3 py-2 font-medium">{d.company}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: C.textMuted }}>{when}</td>
                          <td className="px-3 py-2 text-right" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Proposals Issued list (live data) */}
        {showProposalsIssued && (
          <div className="mt-5">
            <div
              className="text-[10px] font-medium uppercase mb-2"
              style={{ color: C.periwinkle, letterSpacing: '0.08em' }}
            >
              Proposals counted ({proposalsInPeriod.length})
            </div>
            <div
              className="max-h-64 overflow-y-auto rounded-md"
              style={{ border: `1px solid ${C.surfaceBorder}` }}
            >
              {proposalsInPeriod.length === 0 ? (
                <div className="px-3 py-4 text-xs" style={{ color: C.textMuted }}>
                  {proposalsIssuedLoading
                    ? 'Loading proposals…'
                    : proposalsIssuedError
                      ? `Could not load proposals from the ${pipelineVariant === 'finserv' ? 'FinServ' : 'Active'} Pipeline.`
                      : pipelineVariant === 'finserv'
                        ? 'No FinServ deals entered "Proposal Sent" in this period.'
                        : 'No deals entered "Proposal Issued" in this period.'}
                </div>
              ) : (
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: C.textMuted, fontSize: 10 }}>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider">Deal</th>
                      <th className="text-left px-3 py-2 font-medium uppercase tracking-wider w-32">Issued</th>
                      <th className="text-right px-3 py-2 font-medium uppercase tracking-wider w-32">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposalsInPeriod.map((d) => {
                      const when = new Date(d.entered_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                      const v = d.value
                        ? `$${(d.value / 1_000_000).toFixed(1)}MM`
                        : '—';
                      return (
                        <tr
                          key={d.id}
                          style={{ borderTop: `1px solid ${C.hairline}`, color: C.textPrimary }}
                        >
                          <td className="px-3 py-2 font-medium">{d.company}</td>
                          <td className="px-3 py-2 whitespace-nowrap" style={{ color: C.textMuted }}>{when}</td>
                          <td className="px-3 py-2 text-right" style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
          </TabsContent>
          <TabsContent value="charts" className="mt-0">
            <div
              className="p-3 rounded-md"
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.surfaceBorder}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold" style={{ color: C.textPrimary }}>
                  {row.label} · Plan vs Actual
                </div>
                <div className="flex items-center gap-3 text-[10px]" style={{ color: C.textMuted }}>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 14, height: 0, borderTop: `1.5px dashed #a855f7`, display: 'inline-block' }} />
                    Plan
                  </span>
                  <span className="flex items-center gap-1">
                    <span style={{ width: 14, height: 2, background: C.cyan, display: 'inline-block', borderRadius: 1 }} />
                    Actual
                  </span>
                </div>
              </div>
              <div style={{ height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={view.months.map((m, i) => ({ month: m, plan: planArr[i], actual: actualArr[i] }))}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={C.hairline} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={{ stroke: C.hairline }} tickLine={false} />
                    <YAxis tick={{ fill: C.textFaint, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(8,8,12,0.95)',
                        border: `1px solid ${C.surfaceBorder}`,
                        borderRadius: 8,
                        color: C.textPrimary,
                        fontSize: 12,
                      }}
                    />
                    {E > 0 && E < view.months.length && (
                      <ReferenceLine x={view.months[E - 1]} stroke={C.periwinkle} strokeDasharray="2 3" strokeOpacity={0.5} />
                    )}
                    <Line type="monotone" dataKey="plan" stroke="#a855f7" strokeWidth={1.6} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="actual" stroke={C.cyan} strokeWidth={2.4} dot={{ r: 3, fill: C.cyan }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-3">
                <SummaryTile label="Actual" value={fmtRow(totalActual, effectiveRowType)} color={C.cyan} />
                <SummaryTile label="Plan" value={fmtRow(totalPlan, effectiveRowType)} color="#a855f7" />
                <SummaryTile
                  label="Variance"
                  value={effectiveRowType === 'money' ? fmtSignedMoney(variance) : fmtSignedCount(variance)}
                  color={variance >= 0 ? C.cyan : C.rose}
                />
                <SummaryTile label="Attainment" value={fmtPct(attainment)} color={statusColor(attainment)} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="p-3 rounded-md"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${C.surfaceBorder}`,
      }}
    >
      <div
        className="text-[9px] uppercase mb-1"
        style={{ color: C.textFaint, letterSpacing: '0.08em' }}
      >
        {label}
      </div>
      <div
        className="text-base font-semibold"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================
export function SalesDashboardV2({ reportMode = false }: { reportMode?: boolean } = {}) {
  const [shareReportOpen, setShareReportOpen] = React.useState(false);
  // Timeframe is driven by the shared Insights header picker
  // (Quick Presets / Quarter / Month). Fall back to a local persisted
  // selection only if this dashboard is ever rendered outside the
  // InsightsTimeframeProvider.
  const insightsTf = useInsightsTimeframeOptional();
  const fallback = useDashboardPeriod('sales-dashboard-v2-period', 'quarter');
  const selectedQuarter = insightsTf?.selectedQuarter ?? fallback.quarterOption;

  // Derive the year span from the active timeframe so every "Last N months /
  // quarter / custom" selection in the header drives the queries below.
  // Falls back to the current calendar year if anything is missing.
  const { activeYears, rangeStart, rangeEnd } = React.useMemo(() => {
    const startStr = selectedQuarter.startDate || `${new Date().getFullYear()}-01-01`;
    const endStr = selectedQuarter.endDate || `${new Date().getFullYear()}-12-31`;
    const sy = Number(startStr.slice(0, 4));
    const ey = Number(endStr.slice(0, 4));
    const years: number[] = [];
    for (let y = sy; y <= ey; y += 1) years.push(y);
    return {
      activeYears: years.length ? years : [new Date().getFullYear()],
      rangeStart: new Date(`${startStr}T00:00:00Z`),
      rangeEnd: new Date(`${endStr}T23:59:59Z`),
    };
  }, [selectedQuarter.startDate, selectedQuarter.endDate]);

  // When a single month is selected, widen the KPI data fetch by 2 prior
  // months so the top KPI sparklines render a trailing 3-month window.
  const isSingleMonthTf = selectedQuarter.months.length === 1;
  const dataRangeStart = React.useMemo(() => {
    if (!isSingleMonthTf) return rangeStart;
    return new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() - 2, 1));
  }, [isSingleMonthTf, rangeStart]);
  const dataYears = React.useMemo(() => {
    const s = dataRangeStart.getUTCFullYear();
    const e = rangeEnd.getUTCFullYear();
    const arr: number[] = [];
    for (let y = s; y <= e; y += 1) arr.push(y);
    return arr.length ? arr : activeYears;
  }, [dataRangeStart, rangeEnd, activeYears]);

  // Live Sales Calls — fetch for the active range so the per-month bucketing
  // below picks up every month in the selected timeframe.
  const yearStart = dataRangeStart;
  const yearEnd = rangeEnd;
  const salesCallsQuery = useSalesCallsCount(yearStart, yearEnd);
  const rawSalesCallEvents = salesCallsQuery.data?.events ?? [];
  const salesCallEvents = React.useMemo(
    () => filterSalesCallEventsForVariant(rawSalesCallEvents, 'debt'),
    [rawSalesCallEvents],
  );

  // ---- KPI pipeline variant toggle (Debt vs FinServ) ---------------------
  // Only affects the top three KPI cards; the rest of the dashboard keeps
  // its existing Debt-pipeline sourcing.
  const [kpiVariant, setKpiVariant] = React.useState<'debt' | 'finserv'>('debt');
  const [kpiValueMode, setKpiValueMode] = React.useState<'count' | 'value'>('count');

  // FinServ Sales Calls — matches titles like
  // "5th Line <> [COMPANY] Financial Review" across teammate calendars.
  const salesCallsFinservQuery = useSalesCallsCount(
    yearStart,
    yearEnd,
    kpiVariant === 'finserv',
    'finserv',
  );
  const rawSalesCallEventsFinserv = salesCallsFinservQuery.data?.events ?? [];
  const salesCallEventsFinserv = React.useMemo(
    () => filterSalesCallEventsForVariant(rawSalesCallEventsFinserv, 'finserv'),
    [rawSalesCallEventsFinserv],
  );
  const salesCallsFinservByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (salesCallsFinservQuery.isLoading || salesCallsFinservQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const ev of salesCallEventsFinserv) {
      if (!ev.start) continue;
      const d = new Date(ev.start);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }, [salesCallsFinservQuery.isFetching, salesCallsFinservQuery.isLoading, salesCallEventsFinserv]);

  // FinServ Deals on Board — deals entering the "Qualification" stage on
  // the FinServ pipeline.
  const dealsOnBoardFinservQuery = useFinservDealsOnBoardByMonth(dataYears);
  const dealsOnBoardFinservByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(dealsOnBoardFinservQuery.byMonthKey)) {
      out[k] = arr.length;
    }
    return out;
  }, [
    dealsOnBoardFinservQuery.isLoading,
    dealsOnBoardFinservQuery.isFetching,
    dealsOnBoardFinservQuery.byMonthKey,
  ]);

  // FinServ Proposals Issued — deals entering the "Proposal Sent" stage on
  // the FinServ pipeline.
  const proposalsIssuedFinservQuery = useFinservProposalsIssuedByMonth(dataYears);
  const proposalsIssuedFinservByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(proposalsIssuedFinservQuery.byMonthKey)) {
      out[k] = arr.length;
    }
    return out;
  }, [
    proposalsIssuedFinservQuery.isLoading,
    proposalsIssuedFinservQuery.isFetching,
    proposalsIssuedFinservQuery.byMonthKey,
  ]);

  /**
   * Live actuals keyed by absolute YYYY-MM so any selected window (within or
   * across calendar years) maps directly through buildView's month keys.
   */
  const salesCallsByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (salesCallsQuery.isLoading || salesCallsQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const ev of salesCallEvents) {
      if (!ev.start) continue;
      const d = new Date(ev.start);
      const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }, [salesCallsQuery.isFetching, salesCallsQuery.isLoading, salesCallEvents]);

  // Live Deals on Board — mirrors Consolidated Debt Pipeline Board logic
  const dealsOnBoardQuery = useDealsOnBoardByMonth(dataYears);
  // Stage-entry counts (from deal_stage_history) driving the
  // "Deals-on-Board to Proposal" conversion card, scoped to the selected
  // timeframe so the ratio matches the header period label.
  const stageEntryRange = React.useMemo(() => {
    const end = firstDayOfMonthAfterUtc(rangeEnd);
    const start = new Date(Date.UTC(
      rangeStart.getUTCFullYear(),
      rangeStart.getUTCMonth(),
      1,
    ));
    return { start, end };
  }, [rangeStart, rangeEnd]);
  // Prior period of equal length (in whole months) for variance comparison.
  const priorStageEntryRange = React.useMemo(() => {
    const months =
      (stageEntryRange.end.getUTCFullYear() - stageEntryRange.start.getUTCFullYear()) * 12 +
      (stageEntryRange.end.getUTCMonth() - stageEntryRange.start.getUTCMonth());
    const priorEnd = stageEntryRange.start;
    const priorStart = new Date(Date.UTC(
      priorEnd.getUTCFullYear(),
      priorEnd.getUTCMonth() - months,
      1,
    ));
    return { start: priorStart, end: priorEnd };
  }, [stageEntryRange]);
  const ndaEnteredInRange = useStageEntryCount('ndaneeds-list-sent', stageEntryRange);
  const proposalEnteredInRange = useStageEntryCount('proposal-issued', stageEntryRange);
  const ndaEnteredPrior = useStageEntryCount('ndaneeds-list-sent', priorStageEntryRange);
  const proposalEnteredPrior = useStageEntryCount('proposal-issued', priorStageEntryRange);
  // TTM funnel conversion for "Deals-on-Board to Proposal":
  // Denominator = distinct deals that entered NDA / Needs List Sent in the
  // trailing 12 months (anchored on the dashboard's rangeEnd).
  // Numerator   = of those same deals, how many ever entered Proposal Issued
  // (at any time from the TTM window start through today).
  const ttmRanges = React.useMemo(() => {
    const end = firstDayOfMonthAfterUtc(rangeEnd);
    const ttmStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1));
    // Prior TTM ends at the end of the PRIOR reporting period (not 12 months
    // back). Period length = current timeframe length in whole months
    // (Q = 3, month = 1, year = 12, etc.). So if Q2 2026 is selected, the
    // comparison window is the TTM ending Q1 2026.
    const rsStart = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
    const periodMonths = Math.max(
      1,
      (end.getUTCFullYear() - rsStart.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - rsStart.getUTCMonth()),
    );
    const priorEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - periodMonths, 1));
    const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth() - 12, 1));
    // Proposal lookup window covers both TTM windows through today so we can
    // check any downstream conversion regardless of when it occurred.
    const now = new Date();
    const propEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { ttmStart, ttmEnd: end, priorStart, priorEnd, propStart: priorStart, propEnd, periodMonths };
  }, [rangeStart, rangeEnd]);
  const ndaTtmEvents = useStageEntryEvents('ndaneeds-list-sent', { start: ttmRanges.ttmStart, end: ttmRanges.ttmEnd });
  const ndaPriorTtmEvents = useStageEntryEvents('ndaneeds-list-sent', { start: ttmRanges.priorStart, end: ttmRanges.priorEnd });
  const proposalLookupEvents = useStageEntryEvents('proposal-issued', { start: ttmRanges.propStart, end: ttmRanges.propEnd });
  // TTM debt sales calls (denominator of the Call-to-Deal Conversion card).
  // Titled like "[COMPANY] <> 5th Line Financing Review". Uses the same
  // TTM windows as the deals-on-board conversion so the two cards stay
  // consistent, plus a prior-period TTM window for variance.
  const ttmSalesCallsQuery = useSalesCallsCount(ttmRanges.ttmStart, ttmRanges.ttmEnd, true, 'debt');
  const ttmSalesCallsPriorQuery = useSalesCallsCount(ttmRanges.priorStart, ttmRanges.priorEnd, true, 'debt');
  const ttmSalesCallsCount = React.useMemo(() => {
    if (ttmSalesCallsQuery.isLoading || ttmSalesCallsQuery.isFetching) return null;
    return filterSalesCallEventsForVariant(ttmSalesCallsQuery.data?.events ?? [], 'debt').length;
  }, [ttmSalesCallsQuery.isLoading, ttmSalesCallsQuery.isFetching, ttmSalesCallsQuery.data]);
  const ttmSalesCallsPriorCount = React.useMemo(() => {
    if (ttmSalesCallsPriorQuery.isLoading || ttmSalesCallsPriorQuery.isFetching) return null;
    return filterSalesCallEventsForVariant(ttmSalesCallsPriorQuery.data?.events ?? [], 'debt').length;
  }, [ttmSalesCallsPriorQuery.isLoading, ttmSalesCallsPriorQuery.isFetching, ttmSalesCallsPriorQuery.data]);
  const ttmConversion = React.useMemo(() => {
    const loading = ndaTtmEvents.isLoading || ndaPriorTtmEvents.isLoading || proposalLookupEvents.isLoading;
    const proposalDeals = new Set<string>();
    for (const ev of proposalLookupEvents.events) proposalDeals.add(ev.deal_id);
    const ndaSet = new Set<string>();
    for (const ev of ndaTtmEvents.events) ndaSet.add(ev.deal_id);
    const ndaPriorSet = new Set<string>();
    for (const ev of ndaPriorTtmEvents.events) ndaPriorSet.add(ev.deal_id);
    let converted = 0;
    ndaSet.forEach((id) => { if (proposalDeals.has(id)) converted += 1; });
    let convertedPrior = 0;
    ndaPriorSet.forEach((id) => { if (proposalDeals.has(id)) convertedPrior += 1; });
    return {
      loading,
      ndaCount: ndaSet.size,
      converted,
      ndaPriorCount: ndaPriorSet.size,
      convertedPrior,
    };
  }, [ndaTtmEvents.events, ndaTtmEvents.isLoading, ndaPriorTtmEvents.events, ndaPriorTtmEvents.isLoading, proposalLookupEvents.events, proposalLookupEvents.isLoading]);
  const [onBoardToProposalOpen, setOnBoardToProposalOpen] = React.useState(false);
  const [callToDealOpen, setCallToDealOpen] = React.useState(false);
  // --- Sparkline data for the three conversion cards ---
  const monthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthLabel = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

  // Avg. New Deal on Board — per-month avg value across the selected timeframe.
  const avgNewDealSpark = React.useMemo(() => {
    const buckets = new Map<string, { sum: number; n: number; label: string }>();
    const cursor = new Date(stageEntryRange.start);
    while (cursor < stageEntryRange.end) {
      buckets.set(monthKey(cursor), { sum: 0, n: 0, label: monthLabel(cursor) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const d of ndaEnteredInRange.deals) {
      const dt = new Date(d.changed_at);
      const k = monthKey(dt);
      const bucket = buckets.get(k);
      if (!bucket) continue;
      const v = Number(d.value) || 0;
      if (v <= 0) continue;
      bucket.sum += v;
      bucket.n += 1;
    }
    return Array.from(buckets.values()).map((b) => ({
      month: b.label,
      value: b.n === 0 ? null : b.sum / b.n,
    }));
  }, [stageEntryRange, ndaEnteredInRange.deals]);

  // Call-to-Deal Conversion — per-month ratio across TTM (12 months).
  const callToDealSpark = React.useMemo(() => {
    if (ttmSalesCallsQuery.isLoading || ttmSalesCallsQuery.isFetching || ndaTtmEvents.isLoading) {
      return [];
    }
    const callEvents = filterSalesCallEventsForVariant(
      ttmSalesCallsQuery.data?.events ?? [],
      'debt',
    );
    const buckets = new Map<string, { calls: number; deals: Set<string>; label: string }>();
    const cursor = new Date(ttmRanges.ttmStart);
    while (cursor < ttmRanges.ttmEnd) {
      buckets.set(monthKey(cursor), { calls: 0, deals: new Set(), label: monthLabel(cursor) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const c of callEvents) {
      if (!c.start) continue;
      const k = monthKey(new Date(c.start));
      const b = buckets.get(k);
      if (b) b.calls += 1;
    }
    for (const ev of ndaTtmEvents.events) {
      const k = monthKey(new Date(ev.changed_at));
      const b = buckets.get(k);
      if (b) b.deals.add(ev.deal_id);
    }
    return Array.from(buckets.values()).map((b) => ({
      month: b.label,
      value: b.calls === 0 ? null : b.deals.size / b.calls,
    }));
  }, [ttmRanges, ttmSalesCallsQuery.isLoading, ttmSalesCallsQuery.isFetching, ttmSalesCallsQuery.data, ndaTtmEvents.events, ndaTtmEvents.isLoading]);

  // Deals-on-Board to Proposal — per-month conversion across TTM.
  const onBoardToProposalSpark = React.useMemo(() => {
    if (ndaTtmEvents.isLoading || proposalLookupEvents.isLoading) return [];
    const proposalDeals = new Set<string>();
    for (const ev of proposalLookupEvents.events) proposalDeals.add(ev.deal_id);
    const buckets = new Map<string, { total: Set<string>; converted: Set<string>; label: string }>();
    const cursor = new Date(ttmRanges.ttmStart);
    while (cursor < ttmRanges.ttmEnd) {
      buckets.set(monthKey(cursor), { total: new Set(), converted: new Set(), label: monthLabel(cursor) });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const ev of ndaTtmEvents.events) {
      const k = monthKey(new Date(ev.changed_at));
      const b = buckets.get(k);
      if (!b || b.total.has(ev.deal_id)) continue;
      b.total.add(ev.deal_id);
      if (proposalDeals.has(ev.deal_id)) b.converted.add(ev.deal_id);
    }
    return Array.from(buckets.values()).map((b) => ({
      month: b.label,
      value: b.total.size === 0 ? null : b.converted.size / b.total.size,
    }));
  }, [ttmRanges, ndaTtmEvents.events, ndaTtmEvents.isLoading, proposalLookupEvents.events, proposalLookupEvents.isLoading]);
  const dealsOnBoardByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(dealsOnBoardQuery.byMonthKey)) {
      out[k] = arr.length;
    }
    return out;
  }, [
    dealsOnBoardQuery.isLoading,
    dealsOnBoardQuery.isFetching,
    dealsOnBoardQuery.byMonthKey,
  ]);

  // Live Proposals Issued — mirrors Consolidated Debt Pipeline Board logic
  const proposalsIssuedQuery = useProposalsIssuedByMonth(dataYears);
  const proposalsIssuedByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(proposalsIssuedQuery.byMonthKey)) {
      out[k] = arr.length;
    }
    return out;
  }, [
    proposalsIssuedQuery.isLoading,
    proposalsIssuedQuery.isFetching,
    proposalsIssuedQuery.byMonthKey,
  ]);

  // Live Dollars Signed — mirrors Consolidated Debt Pipeline Board's
  const dollarsSignedQuery = useDollarsSignedByMonth(dataYears);
  const dollarsSignedByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (dollarsSignedQuery.isLoading || dollarsSignedQuery.isFetching) return {};
    return dollarsSignedQuery.dollarsByMonthKeyMM ?? {};
  }, [
    dollarsSignedQuery.isLoading,
    dollarsSignedQuery.isFetching,
    dollarsSignedQuery.dollarsByMonthKeyMM,
  ]);

  // Map each month in the selected timeframe (via QuarterOption.months[].key)
  // to its actual bucket. Months outside the live data range render as null
  // so charts visibly indicate "no data" instead of falsely-zero.
  const monthKeys = React.useMemo(
    () => selectedQuarter.months.map((m) => m.key),
    [selectedQuarter.months],
  );
  const lookup = (map: Record<string, number>, isLoading: boolean) =>
    monthKeys.map((k) => (isLoading ? null : map[k] ?? 0));

  // Master Plan monthly targets are the source of truth for plan values shown
  // in KPI cards, gap/performance-to-plan rows, and cumulative pace charts.
  const masterPlanMonthly = useMasterPlanMonthly(MASTER_PLAN_WIDGET_KEYS);

  const liveSalesCallsActual = React.useMemo(
    () => lookup(salesCallsByMonthKey, salesCallsQuery.isLoading || salesCallsQuery.isFetching),
    [salesCallsByMonthKey, salesCallsQuery.isLoading, salesCallsQuery.isFetching, monthKeys],
  );
  const liveDealsOnBoardActual = React.useMemo(
    () => lookup(dealsOnBoardByMonthKey, dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching),
    [dealsOnBoardByMonthKey, dealsOnBoardQuery.isLoading, dealsOnBoardQuery.isFetching, monthKeys],
  );
  const liveProposalsIssuedActual = React.useMemo(
    () => lookup(proposalsIssuedByMonthKey, proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching),
    [proposalsIssuedByMonthKey, proposalsIssuedQuery.isLoading, proposalsIssuedQuery.isFetching, monthKeys],
  );
  const liveDollarsSignedActual = React.useMemo(
    () => lookup(dollarsSignedByMonthKey, dollarsSignedQuery.isLoading || dollarsSignedQuery.isFetching),
    [dollarsSignedByMonthKey, dollarsSignedQuery.isLoading, dollarsSignedQuery.isFetching, monthKeys],
  );

  const baseView = React.useMemo(() => buildView(selectedQuarter), [selectedQuarter]);
  // Forecast draft — owned here so both PerformancePanel and the Sales Model
  // editor read/write the same overrides. Persists across timeframe changes.
  const [fullDraft, setFullDraft] = React.useState<FullForecastDraft>(() => buildInitialFullDraft());
  const forecastCtxValue = React.useMemo<ForecastCtxValue>(
    () => ({ fullDraft, setFullDraft }),
    [fullDraft],
  );

  const view = React.useMemo<DashboardView>(() => {
    // Merge user's forecast edits into the visible plan slice by mapping
    // each month back to its calendar year/month key. Master Plan values win
    // over local forecast defaults so widgets immediately reflect saved plans.
    const startY = baseView.rangeStart.getUTCFullYear();
    const startM = baseView.rangeStart.getUTCMonth();
    const mergedPlan = {} as Record<MetricKey, number[]>;
    (Object.keys(baseView.plan) as MetricKey[]).forEach((k) => {
      mergedPlan[k] = baseView.plan[k].map((base, i) => {
        const d = new Date(Date.UTC(startY, startM + i, 1));
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const overlay = PLAN_OVERLAY_MAP[k];
        const masterPlanValue = overlay ? masterPlanMonthly.values[overlay.widgetKey]?.[ym] : undefined;
        if (masterPlanValue !== undefined && Number.isFinite(masterPlanValue)) {
          return masterPlanValue / overlay!.divisor;
        }
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        const idx = fullDraft.columns.findIndex((c) => c.key === key);
        const override = idx >= 0 ? fullDraft.data[k]?.[idx] : undefined;
        return override === undefined ? base : override;
      });
    });
    return {
      ...baseView,
      plan: mergedPlan,
      actual: {
        ...baseView.actual,
        // Live actuals are already indexed 1:1 with the active timeframe months.
        salesCalls: liveSalesCallsActual,
        dealsOnBoard: liveDealsOnBoardActual,
        proposalsIssued: liveProposalsIssuedActual,
        dollarsSigned: liveDollarsSignedActual,
      },
    };
  }, [baseView, fullDraft, masterPlanMonthly.values, liveSalesCallsActual, liveDealsOnBoardActual, liveProposalsIssuedActual, liveDollarsSignedActual]);

  // FinServ-scoped actuals for the top three KPI cards, indexed to the
  // active timeframe months just like the Debt actuals above.
  const liveSalesCallsActualFinserv = React.useMemo(
    () => lookup(salesCallsFinservByMonthKey, salesCallsFinservQuery.isLoading || salesCallsFinservQuery.isFetching),
    [salesCallsFinservByMonthKey, salesCallsFinservQuery.isLoading, salesCallsFinservQuery.isFetching, monthKeys],
  );
  const liveDealsOnBoardActualFinserv = React.useMemo(
    () => lookup(dealsOnBoardFinservByMonthKey, dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching),
    [dealsOnBoardFinservByMonthKey, dealsOnBoardFinservQuery.isLoading, dealsOnBoardFinservQuery.isFetching, monthKeys],
  );
  const liveProposalsIssuedActualFinserv = React.useMemo(
    () => lookup(proposalsIssuedFinservByMonthKey, proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching),
    [proposalsIssuedFinservByMonthKey, proposalsIssuedFinservQuery.isLoading, proposalsIssuedFinservQuery.isFetching, monthKeys],
  );

  // ---- Dollar-value actuals (in $MM) for the top three KPI cards --------
  const sumDollarsMM = (deals: { value: number }[]): number =>
    deals.reduce((s, d) => s + (Number(d.value) || 0), 0) / 1_000_000;

  const dollarsOnBoardByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(dealsOnBoardQuery.byMonthKey)) {
      out[k] = sumDollarsMM(arr);
    }
    return out;
  }, [dealsOnBoardQuery.isLoading, dealsOnBoardQuery.isFetching, dealsOnBoardQuery.byMonthKey]);
  const dollarsProposedByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(proposalsIssuedQuery.byMonthKey)) {
      out[k] = sumDollarsMM(arr);
    }
    return out;
  }, [proposalsIssuedQuery.isLoading, proposalsIssuedQuery.isFetching, proposalsIssuedQuery.byMonthKey]);
  const dollarsOnBoardFinservByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(dealsOnBoardFinservQuery.byMonthKey)) {
      out[k] = sumDollarsMM(arr);
    }
    return out;
  }, [dealsOnBoardFinservQuery.isLoading, dealsOnBoardFinservQuery.isFetching, dealsOnBoardFinservQuery.byMonthKey]);
  const dollarsProposedFinservByMonthKey = React.useMemo<Record<string, number>>(() => {
    if (proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching) return {};
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(proposalsIssuedFinservQuery.byMonthKey)) {
      out[k] = sumDollarsMM(arr);
    }
    return out;
  }, [proposalsIssuedFinservQuery.isLoading, proposalsIssuedFinservQuery.isFetching, proposalsIssuedFinservQuery.byMonthKey]);

  const liveDollarsOnBoardActual = React.useMemo(
    () => lookup(dollarsOnBoardByMonthKey, dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching),
    [dollarsOnBoardByMonthKey, dealsOnBoardQuery.isLoading, dealsOnBoardQuery.isFetching, monthKeys],
  );
  const liveDollarsProposedActual = React.useMemo(
    () => lookup(dollarsProposedByMonthKey, proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching),
    [dollarsProposedByMonthKey, proposalsIssuedQuery.isLoading, proposalsIssuedQuery.isFetching, monthKeys],
  );
  const liveDollarsOnBoardActualFinserv = React.useMemo(
    () => lookup(dollarsOnBoardFinservByMonthKey, dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching),
    [dollarsOnBoardFinservByMonthKey, dealsOnBoardFinservQuery.isLoading, dealsOnBoardFinservQuery.isFetching, monthKeys],
  );
  const liveDollarsProposedActualFinserv = React.useMemo(
    () => lookup(dollarsProposedFinservByMonthKey, proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching),
    [dollarsProposedFinservByMonthKey, proposalsIssuedFinservQuery.isLoading, proposalsIssuedFinservQuery.isFetching, monthKeys],
  );

  // Count-mode view scoped to the top three KPI cards, with variant swap.
  const kpiCountView = React.useMemo<DashboardView>(() => {
    if (kpiVariant !== 'finserv') return view;
    return {
      ...view,
      actual: {
        ...view.actual,
        salesCalls: liveSalesCallsActualFinserv,
        dealsOnBoard: liveDealsOnBoardActualFinserv,
        proposalsIssued: liveProposalsIssuedActualFinserv,
      },
    };
  }, [
    view,
    kpiVariant,
    liveSalesCallsActualFinserv,
    liveDealsOnBoardActualFinserv,
    liveProposalsIssuedActualFinserv,
  ]);

  // Value-mode view: swaps dealsOnBoard/proposalsIssued actuals + plan for $MM.
  const kpiValueView = React.useMemo<DashboardView>(() => {
    const dollarsOnBoardArr =
      kpiVariant === 'finserv' ? liveDollarsOnBoardActualFinserv : liveDollarsOnBoardActual;
    const dollarsProposedArr =
      kpiVariant === 'finserv' ? liveDollarsProposedActualFinserv : liveDollarsProposedActual;
    return {
      ...kpiCountView,
      actual: {
        ...kpiCountView.actual,
        dealsOnBoard: dollarsOnBoardArr,
        proposalsIssued: dollarsProposedArr,
      },
      plan: {
        ...kpiCountView.plan,
        dealsOnBoard: kpiCountView.plan.dollarsOnBoard,
        proposalsIssued: kpiCountView.plan.dollarsProposed,
      },
    };
  }, [
    kpiCountView,
    kpiVariant,
    liveDollarsOnBoardActual,
    liveDollarsProposedActual,
    liveDollarsOnBoardActualFinserv,
    liveDollarsProposedActualFinserv,
  ]);

  // Backwards-compatible active view for the KPI cards themselves (outside dialog).
  const kpiView = kpiValueMode === 'value' ? kpiValueView : kpiCountView;

  // Dedicated FinServ KPI views so we can render a second row of FinServ
  // cards below the Debt row (instead of a Debt/FinServ toggle).
  const finservCountView = React.useMemo<DashboardView>(() => ({
    ...view,
    actual: {
      ...view.actual,
      salesCalls: liveSalesCallsActualFinserv,
      dealsOnBoard: liveDealsOnBoardActualFinserv,
      proposalsIssued: liveProposalsIssuedActualFinserv,
    },
  }), [view, liveSalesCallsActualFinserv, liveDealsOnBoardActualFinserv, liveProposalsIssuedActualFinserv]);
  const finservValueView = React.useMemo<DashboardView>(() => ({
    ...finservCountView,
    actual: {
      ...finservCountView.actual,
      dealsOnBoard: liveDollarsOnBoardActualFinserv,
      proposalsIssued: liveDollarsProposedActualFinserv,
    },
    plan: {
      ...finservCountView.plan,
      dealsOnBoard: finservCountView.plan.dollarsOnBoard,
      proposalsIssued: finservCountView.plan.dollarsProposed,
    },
  }), [finservCountView, liveDollarsOnBoardActualFinserv, liveDollarsProposedActualFinserv]);
  const finservKpiView = kpiValueMode === 'value' ? finservValueView : finservCountView;

  // ---- Trailing 3-month spark window for the top KPI cards ---------------
  // When a single month is selected, extend the sparkline to include the two
  // prior months (current + prev 2). No effect when a quarter is selected.
  const sparkMonthKeys = React.useMemo<string[]>(() => {
    if (!isSingleMonthTf) return monthKeys;
    const [yStr, mStr] = selectedQuarter.months[0].key.split('-');
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    const keys: string[] = [];
    for (let off = -2; off <= 0; off += 1) {
      const d = new Date(Date.UTC(y, m + off, 1));
      keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
  }, [isSingleMonthTf, selectedQuarter.months, monthKeys]);
  const sparkMonthLabels = React.useMemo<string[]>(() =>
    sparkMonthKeys.map((k) => {
      const [y, m] = k.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
    }),
  [sparkMonthKeys]);

  const sparkPlanLookup = React.useCallback((metric: MetricKey): number[] =>
    sparkMonthKeys.map((k) => {
      const [yStr, mStr] = k.split('-');
      const y = Number(yStr);
      const monIdx = Number(mStr) - 1;
      const overlay = PLAN_OVERLAY_MAP[metric];
      const masterPlanValue = overlay ? masterPlanMonthly.values[overlay.widgetKey]?.[k] : undefined;
      if (masterPlanValue !== undefined && Number.isFinite(masterPlanValue)) {
        return masterPlanValue / overlay!.divisor;
      }
      const dk = `${y}-${monIdx}`;
      const colIdx = fullDraft.columns.findIndex((c) => c.key === dk);
      const override = colIdx >= 0 ? fullDraft.data[metric]?.[colIdx] : undefined;
      if (override !== undefined) return override;
      if (y !== SEED_YEAR) return 0;
      const pos = SEED_MONTH_INDEXES.indexOf(monIdx);
      return pos >= 0 ? (PLAN[metric][pos] ?? 0) : 0;
    }),
  [sparkMonthKeys, fullDraft, masterPlanMonthly.values]);

  const sparkLookup = React.useCallback(
    (map: Record<string, number>, isLoading: boolean): (number | null)[] =>
      sparkMonthKeys.map((k) => (isLoading ? null : map[k] ?? 0)),
    [sparkMonthKeys],
  );

  const buildSparkFields = React.useCallback(
    (
      salesMap: { map: Record<string, number>; loading: boolean },
      dealsMap: { map: Record<string, number>; loading: boolean },
      propsMap: { map: Record<string, number>; loading: boolean },
      opts?: { dealsPlanMetric?: MetricKey; propsPlanMetric?: MetricKey },
    ): Pick<DashboardView, 'sparkMonths' | 'sparkPlan' | 'sparkActual'> => {
      const plan = {} as Record<MetricKey, number[]>;
      (Object.keys(PLAN) as MetricKey[]).forEach((k) => {
        plan[k] = sparkPlanLookup(k);
      });
      if (opts?.dealsPlanMetric) plan.dealsOnBoard = sparkPlanLookup(opts.dealsPlanMetric);
      if (opts?.propsPlanMetric) plan.proposalsIssued = sparkPlanLookup(opts.propsPlanMetric);
      const actual = {} as Record<MetricKey, (number | null)[]>;
      (Object.keys(ACTUAL) as MetricKey[]).forEach((k) => {
        actual[k] = sparkMonthKeys.map(() => null);
      });
      actual.salesCalls = sparkLookup(salesMap.map, salesMap.loading);
      actual.dealsOnBoard = sparkLookup(dealsMap.map, dealsMap.loading);
      actual.proposalsIssued = sparkLookup(propsMap.map, propsMap.loading);
      return { sparkMonths: sparkMonthLabels, sparkPlan: plan, sparkActual: actual };
    },
    [sparkPlanLookup, sparkLookup, sparkMonthKeys, sparkMonthLabels],
  );

  // Counts-of-deals maps (arr.length) needed for spark actuals.
  const dealsOnBoardCountByMonthKey = React.useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(dealsOnBoardQuery.byMonthKey)) out[k] = arr.length;
    return out;
  }, [dealsOnBoardQuery.byMonthKey]);
  const proposalsIssuedCountByMonthKey = React.useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [k, arr] of Object.entries(proposalsIssuedQuery.byMonthKey)) out[k] = arr.length;
    return out;
  }, [proposalsIssuedQuery.byMonthKey]);

  const kpiCountSpark = React.useMemo(() =>
    buildSparkFields(
      { map: salesCallsByMonthKey, loading: salesCallsQuery.isLoading || salesCallsQuery.isFetching },
      { map: dealsOnBoardCountByMonthKey, loading: dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching },
      { map: proposalsIssuedCountByMonthKey, loading: proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching },
    ),
  [buildSparkFields, salesCallsByMonthKey, salesCallsQuery.isLoading, salesCallsQuery.isFetching, dealsOnBoardCountByMonthKey, dealsOnBoardQuery.isLoading, dealsOnBoardQuery.isFetching, proposalsIssuedCountByMonthKey, proposalsIssuedQuery.isLoading, proposalsIssuedQuery.isFetching]);

  const kpiValueSpark = React.useMemo(() =>
    buildSparkFields(
      { map: salesCallsByMonthKey, loading: salesCallsQuery.isLoading || salesCallsQuery.isFetching },
      { map: dollarsOnBoardByMonthKey, loading: dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching },
      { map: dollarsProposedByMonthKey, loading: proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching },
      { dealsPlanMetric: 'dollarsOnBoard', propsPlanMetric: 'dollarsProposed' },
    ),
  [buildSparkFields, salesCallsByMonthKey, salesCallsQuery.isLoading, salesCallsQuery.isFetching, dollarsOnBoardByMonthKey, dollarsProposedByMonthKey, dealsOnBoardQuery.isLoading, dealsOnBoardQuery.isFetching, proposalsIssuedQuery.isLoading, proposalsIssuedQuery.isFetching]);

  const finservCountSpark = React.useMemo(() =>
    buildSparkFields(
      { map: salesCallsFinservByMonthKey, loading: salesCallsFinservQuery.isLoading || salesCallsFinservQuery.isFetching },
      { map: dealsOnBoardFinservByMonthKey, loading: dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching },
      { map: proposalsIssuedFinservByMonthKey, loading: proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching },
    ),
  [buildSparkFields, salesCallsFinservByMonthKey, salesCallsFinservQuery.isLoading, salesCallsFinservQuery.isFetching, dealsOnBoardFinservByMonthKey, dealsOnBoardFinservQuery.isLoading, dealsOnBoardFinservQuery.isFetching, proposalsIssuedFinservByMonthKey, proposalsIssuedFinservQuery.isLoading, proposalsIssuedFinservQuery.isFetching]);

  const finservValueSpark = React.useMemo(() =>
    buildSparkFields(
      { map: salesCallsFinservByMonthKey, loading: salesCallsFinservQuery.isLoading || salesCallsFinservQuery.isFetching },
      { map: dollarsOnBoardFinservByMonthKey, loading: dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching },
      { map: dollarsProposedFinservByMonthKey, loading: proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching },
      { dealsPlanMetric: 'dollarsOnBoard', propsPlanMetric: 'dollarsProposed' },
    ),
  [buildSparkFields, salesCallsFinservByMonthKey, salesCallsFinservQuery.isLoading, salesCallsFinservQuery.isFetching, dollarsOnBoardFinservByMonthKey, dollarsProposedFinservByMonthKey, dealsOnBoardFinservQuery.isLoading, dealsOnBoardFinservQuery.isFetching, proposalsIssuedFinservQuery.isLoading, proposalsIssuedFinservQuery.isFetching]);

  const kpiCountViewWithSpark = React.useMemo<DashboardView>(
    () => ({ ...kpiCountView, ...kpiCountSpark }),
    [kpiCountView, kpiCountSpark],
  );
  const kpiValueViewWithSpark = React.useMemo<DashboardView>(
    () => ({ ...kpiValueView, ...kpiValueSpark }),
    [kpiValueView, kpiValueSpark],
  );
  const finservCountViewWithSpark = React.useMemo<DashboardView>(
    () => ({ ...finservCountView, ...finservCountSpark }),
    [finservCountView, finservCountSpark],
  );
  const finservValueViewWithSpark = React.useMemo<DashboardView>(
    () => ({ ...finservValueView, ...finservValueSpark }),
    [finservValueView, finservValueSpark],
  );
  const kpiViewWithSpark = kpiValueMode === 'value' ? kpiValueViewWithSpark : kpiCountViewWithSpark;
  const finservKpiViewWithSpark = kpiValueMode === 'value' ? finservValueViewWithSpark : finservCountViewWithSpark;

  // Overlay live FinServ Proposals actuals + Master Plan monthly targets
  // onto the view consumed by the PerformancePanel drivers list.
  const viewWithFinserv = React.useMemo<DashboardView>(() => {
    const startY = view.rangeStart.getUTCFullYear();
    const startM = view.rangeStart.getUTCMonth();
    const overlayPlan = (widgetKey: string, base: number[], divisor = 1): number[] =>
      base.map((b, i) => {
        const d = new Date(Date.UTC(startY, startM + i, 1));
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const mp = masterPlanMonthly.values[widgetKey]?.[ym];
        return mp !== undefined ? mp / divisor : b;
      });

    // ---- YTD (Jan → end of selected range) arrays for CumulativePace ----
    const ytdYear = view.rangeEnd.getUTCFullYear();
    const endMonthIdx = view.rangeEnd.getUTCMonth(); // 0..11
    const ytdMonths: string[] = [];
    const ytdMonthKeys: string[] = [];
    for (let m = 0; m <= endMonthIdx; m++) {
      ytdMonths.push(MONTHS_ALL[m]);
      ytdMonthKeys.push(`${ytdYear}-${String(m + 1).padStart(2, '0')}`);
    }
    const today = new Date();
    let ytdElapsed = 0;
    for (let m = 0; m <= endMonthIdx; m++) {
      const start = new Date(ytdYear, m, 1);
      if (start <= today) ytdElapsed += 1;
      else break;
    }
    if (ytdElapsed < 1) ytdElapsed = Math.min(1, ytdMonths.length);

    const liveMaps: Partial<Record<MetricKey, Record<string, number>>> = {
      salesCalls: salesCallsByMonthKey,
      dealsOnBoard: dealsOnBoardByMonthKey,
      dollarsOnBoard: dollarsOnBoardByMonthKey,
      proposalsIssued: proposalsIssuedByMonthKey,
      dollarsProposed: dollarsProposedByMonthKey,
      dollarsSigned: dollarsSignedByMonthKey,
    };
    const ytdPlan = {} as Record<MetricKey, number[]>;
    const ytdActual = {} as Record<MetricKey, (number | null)[]>;
    (Object.keys(PLAN) as MetricKey[]).forEach((k) => {
      ytdPlan[k] = [];
      ytdActual[k] = [];
      for (let m = 0; m <= endMonthIdx; m++) {
        // Plan — user forecast override wins, then seeded PLAN (SEED_YEAR only).
        const draftKey = `${ytdYear}-${m}`;
        const idx = fullDraft.columns.findIndex((c) => c.key === draftKey);
        const override = idx >= 0 ? fullDraft.data[k]?.[idx] : undefined;
        let planVal = 0;
        if (override !== undefined) planVal = override;
        else if (ytdYear === SEED_YEAR) {
          const seedIdx = SEED_MONTH_INDEXES.indexOf(m);
          planVal = seedIdx >= 0 ? PLAN[k][seedIdx] : 0;
        }
        ytdPlan[k].push(planVal);

        // Actual — live monthKey map if we have one, else seeded ACTUAL (SEED_YEAR).
        const map = liveMaps[k];
        if (map) {
          ytdActual[k].push(m < ytdElapsed ? (map[ytdMonthKeys[m]] ?? 0) : null);
        } else if (ytdYear === SEED_YEAR) {
          const seedIdx = SEED_MONTH_INDEXES.indexOf(m);
          ytdActual[k].push(seedIdx >= 0 ? ACTUAL[k][seedIdx] : null);
        } else {
          ytdActual[k].push(null);
        }
      }
    });

    // Overlay Master Plan monthly targets onto FinServ plan rows for YTD too.
    const overlayYtdPlan = (widgetKey: string, arr: number[], divisor = 1): number[] =>
      arr.map((base, m) => {
        const ym = ytdMonthKeys[m];
        const mp = masterPlanMonthly.values[widgetKey]?.[ym];
        return mp !== undefined ? mp / divisor : base;
      });
    // Overlay Master Plan monthly targets onto ALL mapped metrics for YTD.
    (Object.keys(PLAN_OVERLAY_MAP) as MetricKey[]).forEach((mk) => {
      const m = PLAN_OVERLAY_MAP[mk]!;
      ytdPlan[mk] = overlayYtdPlan(m.widgetKey, ytdPlan[mk], m.divisor);
    });

    return {
      ...view,
      actual: {
        ...view.actual,
        finservProposalsIssued: liveProposalsIssuedActualFinserv,
        finservDollarsProposed: liveDollarsProposedActualFinserv,
      },
      plan: (() => {
        const nextPlan = { ...view.plan };
        (Object.keys(PLAN_OVERLAY_MAP) as MetricKey[]).forEach((mk) => {
          const m = PLAN_OVERLAY_MAP[mk]!;
          nextPlan[mk] = overlayPlan(m.widgetKey, view.plan[mk], m.divisor);
        });
        return nextPlan;
      })(),
      ytdMonths,
      ytdPlan,
      ytdActual,
      ytdElapsed,
    };
  }, [
    view,
    liveProposalsIssuedActualFinserv,
    liveDollarsProposedActualFinserv,
    masterPlanMonthly.values,
    fullDraft,
    salesCallsByMonthKey,
    dealsOnBoardByMonthKey,
    dollarsOnBoardByMonthKey,
    proposalsIssuedByMonthKey,
    dollarsProposedByMonthKey,
    dollarsSignedByMonthKey,
  ]);

  // Drilldown state
  const [drillFocus, setDrillFocus] = React.useState<DrilldownFocus | null>(null);
  const drillApi = React.useMemo<DrilldownApi>(
    () => ({ open: (metricKey, monthIndex) => setDrillFocus({ metricKey, monthIndex }) }),
    [],
  );

  return (
    <ViewCtx.Provider value={viewWithFinserv}>
    <ForecastCtx.Provider value={forecastCtxValue}>
    <DrilldownCtx.Provider value={drillApi}>
    <div
      className="sales-dashboard-v2 relative w-full"
      style={{
        color: C.textPrimary,
        overflow: 'hidden',
        minHeight: 600,
      }}
    >
      <style>{`
        .sales-dashboard-v2 .sales-model-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .sales-dashboard-v2 .sales-model-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12); border-radius: 4px;
        }
        .sales-dashboard-v2 .sales-model-scroll::-webkit-scrollbar-track { background: transparent; }
        @media (prefers-reduced-motion: reduce) {
          .sales-dashboard-v2 * { transition: none !important; animation: none !important; }
        }
      `}</style>
      <div className="relative flex">
        {/* NavRail removed per request */}
        <div className="flex-1 min-w-0" style={{ padding: '22px 26px', maxWidth: 1240, margin: '0 auto' }}>
          {/* Timeframe lives in the shared /insights page header. */}

          {/* KPI strip */}
          <div className="mb-6">
            <div className="flex items-center justify-end gap-2 mb-2">
              {!reportMode && (
                <button
                  type="button"
                  onClick={() => setShareReportOpen(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white/85 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors"
                >
                  <Share2 size={13} />
                  Share Report
                </button>
              )}
              <ValueModeToggle
                value={kpiValueMode}
                onChange={setKpiValueMode}
              />
            </div>
            <ViewCtx.Provider value={kpiViewWithSpark}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {kpiValueMode === 'value' ? (
                  <BlankKpiCard label="Sales Calls" />
                ) : (
                  <KpiCard
                    label="Sales Calls"
                    Icon={Phone}
                    type="count"
                    metricKey="salesCalls"
                    mode="sum"
                  />
                )}
                <KpiCard
                  label={
                    kpiValueMode === 'value'
                      ? 'Dollars on Board'
                      : 'Deals on Board'
                  }
                  Icon={Layers}
                  type={kpiValueMode === 'value' ? 'money' : 'count'}
                  metricKey="dealsOnBoard"
                  mode="sum"
                />
                <KpiCard
                  label={kpiValueMode === 'value' ? 'Dollars Proposed' : 'Proposals Issued'}
                  Icon={FileText}
                  type={kpiValueMode === 'value' ? 'money' : 'count'}
                  metricKey="proposalsIssued"
                  mode="sum"
                />
              </div>
            </ViewCtx.Provider>
            <ViewCtx.Provider value={finservKpiViewWithSpark}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {kpiValueMode === 'value' ? (
                  <BlankKpiCard label="FinServ Sales Calls" />
                ) : (
                  <KpiCard
                    label="FinServ Sales Calls"
                    Icon={Phone}
                    type="count"
                    metricKey="salesCalls"
                    mode="sum"
                  />
                )}
                <KpiCard
                  label={kpiValueMode === 'value' ? 'FinServ Dollars on Board' : 'FinServ Deals on Board'}
                  Icon={Layers}
                  type={kpiValueMode === 'value' ? 'money' : 'count'}
                  metricKey="dealsOnBoard"
                  mode="sum"
                />
                <KpiCard
                  label={kpiValueMode === 'value' ? 'FinServ Dollars Proposed' : 'FinServ Proposals Issued'}
                  Icon={FileText}
                  type={kpiValueMode === 'value' ? 'money' : 'count'}
                  metricKey="proposalsIssued"
                  mode="sum"
                />
              </div>
            </ViewCtx.Provider>
          </div>

          {/* Performance-to-plan panel */}
          <div className="mb-6">
            <PerformancePanel />
          </div>

          <div className="mb-6">
            <SalesTeamBoardKpiGrid quarter={selectedQuarter} />
          </div>

          {/* Conversion metric cards (trailing 3 months) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {(() => {
              const currDeals = ndaEnteredInRange.deals;
              const priorDeals = ndaEnteredPrior.deals;
              // Average deal size for deals entering "NDA / Needs List Sent" in
              // the Active pipeline. Excludes deals with no value so the average
              // is not dragged toward zero by unsized deals (matches sparkline).
              const avg = (arr: typeof currDeals) => {
                const sized = arr
                  .map((d) => Number(d.value) || 0)
                  .filter((v) => v > 0);
                if (!sized.length) return null;
                return sized.reduce((s, v) => s + v, 0) / sized.length;
              };
              const currAvg = avg(currDeals);
              const priorAvg = avg(priorDeals);
              const fmt = (n: number | null) =>
                n == null
                  ? '—'
                  : n >= 1_000_000
                    ? `$${(n / 1_000_000).toFixed(2)}MM`
                    : `$${Math.round(n / 1000).toLocaleString()}K`;
              const loading = ndaEnteredInRange.isLoading || ndaEnteredPrior.isLoading;
              const delta =
                currAvg != null && priorAvg != null && priorAvg !== 0
                  ? (currAvg - priorAvg) / priorAvg
                  : null;
              const sizedCount = currDeals.filter((d) => (Number(d.value) || 0) > 0).length;
              const subtitle = loading
                ? 'Loading…'
                : currAvg == null
                  ? 'No sized deals in period'
                  : `${sizedCount} sized deals · prior ${fmt(priorAvg)}`;
              return (
                <ConversionCard
                  title="Avg. New Deal on Board"
                  value={null}
                  displayValue={fmt(currAvg)}
                  subtitle={subtitle}
                  Icon={TrendingUp}
                  deltaPct={delta}
                  sparkData={avgNewDealSpark}
                  sparkFormatter={(v) => fmt(v)}
                  info={
                    <div className="space-y-1.5">
                      <div>
                        <span className="font-semibold">Metric:</span> average deal value for deals that entered the “NDA / Needs List Sent” stage during the selected timeframe.
                      </div>
                      <div>
                        <span className="font-semibold">Variance:</span> % change vs. the prior period of equal length.
                      </div>
                    </div>
                  }
                />
              );
            })()}
            <ConversionCard
              title="Call-to-Deal Conversion"
              onClick={() => setCallToDealOpen(true)}
              Icon={Phone}
              sparkData={callToDealSpark}
              sparkFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              info={
                <div className="space-y-1.5">
                  <div>
                    <span className="font-semibold">Numerator:</span> distinct deals that entered the “NDA / Needs List Sent” stage in the trailing 12 months (TTM) ending at the selected period.
                  </div>
                  <div>
                    <span className="font-semibold">Denominator:</span> debt sales calls in the same TTM window — calendar events titled “[Company] &lt;&gt; 5th Line Financing Review”.
                  </div>
                  <div>
                    <span className="font-semibold">Variance:</span> percentage-point delta vs. the prior TTM (shifted back one full selected timeframe — e.g. one quarter when a quarter is selected, one month when a month is selected).
                  </div>
                </div>
              }
              value={(() => {
                if (ttmConversion.loading || ttmSalesCallsCount == null) return null;
                const deals = ttmConversion.ndaCount;
                const calls = ttmSalesCallsCount;
                if (!calls) return null;
                return deals / calls;
              })()}
              deltaLabel={(() => {
                if (ttmConversion.loading || ttmSalesCallsCount == null) return null;
                const calls = ttmSalesCallsCount;
                const prevCalls = ttmSalesCallsPriorCount;
                if (!calls || prevCalls == null || !prevCalls) return null;
                const cur = ttmConversion.ndaCount / calls;
                const prev = ttmConversion.ndaPriorCount / prevCalls;
                const deltaPts = (cur - prev) * 100;
                const sign = deltaPts > 0 ? '+' : deltaPts < 0 ? '−' : '';
                return `${sign}${Math.abs(deltaPts).toFixed(1)} pts`;
              })()}
              deltaPct={(() => {
                if (ttmConversion.loading || ttmSalesCallsCount == null) return null;
                const calls = ttmSalesCallsCount;
                const prevCalls = ttmSalesCallsPriorCount;
                if (!calls || prevCalls == null || !prevCalls) return null;
                const cur = ttmConversion.ndaCount / calls;
                const prev = ttmConversion.ndaPriorCount / prevCalls;
                return cur - prev; // sign only; label formatting via deltaLabel
              })()}
              subtitle={(() => {
                if (ttmConversion.loading || ttmSalesCallsCount == null) return 'Loading…';
                const deals = ttmConversion.ndaCount;
                const calls = ttmSalesCallsCount;
                const base = `${deals} deals ÷ ${calls} calls · TTM`;
                if (!calls) return `No debt sales calls · TTM`;
                const priorLabel = (() => {
                  const e = new Date(ttmRanges.priorEnd.getTime() - 1);
                  if (ttmRanges.periodMonths === 3) {
                    const q = Math.floor(e.getUTCMonth() / 3) + 1;
                    return `Q${q} ${e.getUTCFullYear()}`;
                  }
                  if (ttmRanges.periodMonths === 12) return `${e.getUTCFullYear()}`;
                  return e.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
                })();
                const prevCalls = ttmSalesCallsPriorCount;
                const prevDeals = ttmConversion.ndaPriorCount;
                if (prevCalls == null || !prevCalls) return `${base} · no ${priorLabel} baseline`;
                const prev = prevDeals / prevCalls;
                return `${base} · vs ${priorLabel} TTM (${(prev * 100).toFixed(1)}%)`;
              })()}
            />
            <ConversionCard
              title="Deals-on-Board to Proposal (MSQL)"
              Icon={FileText}
              sparkData={onBoardToProposalSpark}
              sparkFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              value={(() => {
                if (ttmConversion.loading) return null;
                if (!ttmConversion.ndaCount) return null;
                return ttmConversion.converted / ttmConversion.ndaCount;
              })()}
              deltaLabel={(() => {
                if (ttmConversion.loading) return null;
                const { ndaCount, converted, ndaPriorCount, convertedPrior } = ttmConversion;
                if (!ndaCount || !ndaPriorCount) return null;
                const deltaPts = (converted / ndaCount - convertedPrior / ndaPriorCount) * 100;
                const sign = deltaPts > 0 ? '+' : deltaPts < 0 ? '−' : '';
                return `${sign}${Math.abs(deltaPts).toFixed(1)} pts`;
              })()}
              deltaPct={(() => {
                if (ttmConversion.loading) return null;
                const { ndaCount, converted, ndaPriorCount, convertedPrior } = ttmConversion;
                if (!ndaCount || !ndaPriorCount) return null;
                return converted / ndaCount - convertedPrior / ndaPriorCount;
              })()}
              subtitle={(() => {
                if (ttmConversion.loading) return 'Loading…';
                const { ndaCount, converted, ndaPriorCount, convertedPrior } = ttmConversion;
                const base = `${converted} of ${ndaCount} deals · TTM`;
                if (!ndaCount) return `No NDAs entered · TTM`;
                const prev = ndaPriorCount ? convertedPrior / ndaPriorCount : null;
                // Label the prior period based on where the prior TTM ends
                // (one full timeframe-length back from the current end).
                const priorLabel = (() => {
                  const e = new Date(ttmRanges.priorEnd.getTime() - 1);
                  if (ttmRanges.periodMonths === 3) {
                    const q = Math.floor(e.getUTCMonth() / 3) + 1;
                    return `Q${q} ${e.getUTCFullYear()}`;
                  }
                  if (ttmRanges.periodMonths === 12) return `${e.getUTCFullYear()}`;
                  return e.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
                })();
                if (prev == null) return `${base} · no ${priorLabel} baseline`;
                return `${base} · vs ${priorLabel} TTM (${(prev * 100).toFixed(1)}%)`;
              })()}
              onClick={() => setOnBoardToProposalOpen(true)}
            />
          </div>
          <OnBoardToProposalDrilldown
            open={onBoardToProposalOpen}
            onOpenChange={setOnBoardToProposalOpen}
            anchorEnd={rangeEnd}
          />
          <CallToDealDrilldown
            open={callToDealOpen}
            onOpenChange={setCallToDealOpen}
            ttmRanges={ttmRanges}
          />

          {/* Top "Sourced Via" for deals created in the selected timeframe */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopSourcedViaWidget />
            <BdCallsMeetingsWidget />
          </div>

          {/* Cumulative pace */}
          <div className="mb-6 sales-model-scroll overflow-x-auto">
            <div style={{ minWidth: 600 }}>
              <CumulativePace />
            </div>
          </div>

          {/* Sales model sheet */}
          {!reportMode && <SalesModelSheet />}
        </div>
      </div>
    </div>
    {!reportMode && (
      <ShareReportDialog open={shareReportOpen} onOpenChange={setShareReportOpen} />
    )}
    <MetricDrilldownDialog
      focus={drillFocus}
      onClose={() => setDrillFocus(null)}
      countView={kpiVariant === 'finserv' ? kpiCountView : view}
      valueView={kpiValueView}
      pipelineVariant={kpiVariant}
      initialValueMode={kpiValueMode}
      salesCallEvents={kpiVariant === 'finserv' ? salesCallEventsFinserv : salesCallEvents}
      salesCallsLoading={
        kpiVariant === 'finserv'
          ? salesCallsFinservQuery.isLoading || salesCallsFinservQuery.isFetching
          : salesCallsQuery.isLoading || salesCallsQuery.isFetching
      }
      salesCallsError={(kpiVariant === 'finserv' ? salesCallsFinservQuery.error : salesCallsQuery.error) ?? null}
      dealsOnBoard={kpiVariant === 'finserv' ? dealsOnBoardFinservQuery.deals : dealsOnBoardQuery.deals}
      dealsOnBoardLoading={
        kpiVariant === 'finserv'
          ? dealsOnBoardFinservQuery.isLoading || dealsOnBoardFinservQuery.isFetching
          : dealsOnBoardQuery.isLoading || dealsOnBoardQuery.isFetching
      }
      dealsOnBoardError={kpiVariant === 'finserv' ? dealsOnBoardFinservQuery.error : dealsOnBoardQuery.error}
      proposalsIssued={kpiVariant === 'finserv' ? proposalsIssuedFinservQuery.deals : proposalsIssuedQuery.deals}
      proposalsIssuedLoading={
        kpiVariant === 'finserv'
          ? proposalsIssuedFinservQuery.isLoading || proposalsIssuedFinservQuery.isFetching
          : proposalsIssuedQuery.isLoading || proposalsIssuedQuery.isFetching
      }
      proposalsIssuedError={kpiVariant === 'finserv' ? proposalsIssuedFinservQuery.error : proposalsIssuedQuery.error}
    />
    </DrilldownCtx.Provider>
    </ForecastCtx.Provider>
    </ViewCtx.Provider>
  );
}

export default SalesDashboardV2;