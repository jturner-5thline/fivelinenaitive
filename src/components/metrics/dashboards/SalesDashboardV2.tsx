import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useStageEntryCount } from '@/hooks/useStageEntryCounts';
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
} from 'lucide-react';

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
  | 'dollarsFunded';

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
  { key: 'dealsClosed', label: 'Deals Closed', type: 'count' },
  { key: 'dollarsFunded', label: 'Dollars Funded', type: 'money', bold: true },
];

const PLAN: Record<MetricKey, number[]> = {
  salesCalls: [44, 46, 48, 48, 50, 50, 52, 52, 54],
  dealsOnBoard: [11, 11, 11, 11, 11, 11, 11, 11, 11],
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
};

function pad(actuals: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(9).fill(null);
  actuals.forEach((v, i) => (out[i] = v));
  return out;
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
  textPrimary: '#ECECF4',
  textMuted: '#8A8AA6',
  textFaint: '#5A5A72',
  periwinkle: '#9DA2F5',
  cyan: '#5EEAD4',
  violet: '#A78BFA',
  rose: '#FB7185',
  amber: '#FBBF24',
  surface: 'rgba(255,255,255,0.035)',
  surfaceBorder: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.06)',
};

const glassStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.surfaceBorder}`,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: 8,
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

  const sparkData = view.months.map((m, i) => ({
    month: m,
    plan: planArr[i],
    actual: actualArr[i],
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
            <span style={{ width: 12, height: 0, borderTop: `1.5px dashed ${C.periwinkle}`, display: 'inline-block' }} />
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
              stroke={C.periwinkle}
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
    { label: 'Deals on Board', metricKey: 'dealsOnBoard', note: '· current', actual: view.actual.dealsOnBoard[E - 1] ?? 0, plan: view.plan.dealsOnBoard[E - 1] ?? 0, type: 'count' },
    { label: 'Dollars Signed', metricKey: 'dollarsSigned', actual: sum(view.actual.dollarsSigned, E), plan: view.plan.dollarsSigned.slice(0, E).reduce((a, b) => a + b, 0), type: 'money' },
    { label: 'Deals Closed', metricKey: 'dealsClosed', actual: sum(view.actual.dealsClosed, E), plan: view.plan.dealsClosed.slice(0, E).reduce((a, b) => a + b, 0), type: 'count' },
    { label: 'Dollars Funded', metricKey: 'dollarsFunded', actual: sum(view.actual.dollarsFunded, E), plan: view.plan.dollarsFunded.slice(0, E).reduce((a, b) => a + b, 0), type: 'money' },
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
              <span style={{ color: C.textFaint }}>· By Driver</span>
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

function TopSourcedViaWidget() {
  const view = useView();
  const { company } = useCompany();
  const startIso = view.rangeStart.toISOString();
  const endIso = view.rangeEnd.toISOString();
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['top-sourced-via', company?.id, startIso, endIso],
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, sourced_via, created_at, referral_source, referral_source_id')
        .eq('company_id', company!.id)
        .neq('status', 'archived')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .not('sourced_via', 'is', null);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        company: string | null;
        sourced_via: string | null;
        referral_source: string | null;
        referral_source_id: string | null;
        created_at: string;
      }>;
    },
  });

  const rows = React.useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const d of data ?? []) {
      if (isExcludedDeal(d.company)) continue;
      const key = (d.sourced_via || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));
    return { rows: sorted, total };
  }, [data]);

  const max = rows.rows[0]?.count ?? 0;

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
      ) : rows.rows.length === 0 ? (
        <div className="text-[12px]" style={{ color: C.textMuted }}>
          No deals with a "Sourced Via" value were created in this period.
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.rows.map((r, idx) => {
            const widthPct = max === 0 ? 0 : (r.count / max) * 100;
            const share = rows.total === 0 ? 0 : r.count / rows.total;
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
                    style={{
                      height: 6,
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
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
        </div>
      )}
    </div>
    <SourcedViaDrilldownDialog
      source={selectedSource}
      deals={(data ?? []).filter(
        (d) => !isExcludedDeal(d.company) && (d.sourced_via || '').trim() === selectedSource,
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
  const E = view.elapsed;
  const planCum = cumulativePlan(view.plan.dollarsFunded);
  const actualCum = cumulative(view.actual.dollarsFunded);
  const data = view.months.map((m, i) => ({
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
          <div className="text-[11px]" style={{ color: C.textFaint }}>
            Dollars Funded · running total
          </div>
          <button
            type="button"
            onClick={() => drill.open('dollarsFunded')}
            className="ml-2 text-[10px] px-2 py-0.5 rounded-md hover:brightness-125 focus-visible:outline-none focus-visible:ring-1"
            style={{ background: 'rgba(157,162,245,0.10)', color: C.periwinkle, border: `1px solid ${C.surfaceBorder}` }}
          >
            Drill in
          </button>
        </div>
        <div className="flex items-center gap-5 text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <Readout label="ACTUAL TO DATE" value={fmtMoney(actualToDate)} color={C.cyan} />
          <Readout label="PLAN TO DATE" value={fmtMoney(planToDate)} color={C.periwinkle} />
          <Readout label="FY TARGET" value={fmtMoney(fyTarget)} color={C.textMuted} />
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
            </defs>
            <CartesianGrid stroke={C.hairline} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={{ stroke: C.hairline }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${Math.round(v)}`}
              tick={{ fill: C.textFaint, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(8,8,12,0.95)',
                border: `1px solid ${C.surfaceBorder}`,
                borderRadius: 8,
                color: C.textPrimary,
                fontSize: 12,
              }}
              formatter={(v: number, n: string) => [`$${v.toFixed(1)}MM`, n === 'plan' ? 'Plan' : 'Actual']}
            />
            <ReferenceLine
              x={view.months[E - 1] ?? ''}
              stroke={C.textFaint}
              strokeDasharray="3 3"
              label={{ value: 'today', position: 'top', fill: C.textFaint, fontSize: 10 }}
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
            <Line
              type="monotone"
              dataKey="plan"
              stroke={C.periwinkle}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
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
            <span style={{ width: 12, height: 0, borderTop: `1.5px dashed ${C.periwinkle}`, display: 'inline-block' }} />
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
              stroke={C.periwinkle}
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
}: {
  title: string;
  value: number | null;
  subtitle?: string;
  onClick?: () => void;
}) {
  const display =
    value == null
      ? '—'
      : `${(value * 100).toFixed(value >= 1 ? 0 : 1)}%`;
  const clickable = !!onClick;
  return (
    <div
      style={glassStyle}
      className={`p-4 flex flex-col gap-2 ${clickable ? 'cursor-pointer transition-colors hover:bg-white/[0.04]' : ''}`}
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
      <div
        className="text-[10px] font-medium uppercase"
        style={{ color: C.textMuted, letterSpacing: '0.08em' }}
      >
        {title}
      </div>
      <div
        className="text-3xl font-semibold leading-none"
        style={{ color: C.textPrimary, fontVariantNumeric: 'tabular-nums' }}
      >
        {display}
      </div>
      {subtitle && (
        <div
          className="text-[11px]"
          style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}
        >
          {subtitle}
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
  nda,
  proposal,
  timeframeLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nda: ReturnType<typeof useStageEntryCount>;
  proposal: ReturnType<typeof useStageEntryCount>;
  timeframeLabel: string;
}) {
  const [tab, setTab] = React.useState<'nda' | 'proposal'>('nda');
  const fmtUsd = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(2)}MM`
      : n > 0
      ? `$${Math.round(n / 1000).toLocaleString()}K`
      : '—';
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const ratio =
    nda.count > 0 ? `${((proposal.count / nda.count) * 100).toFixed(1)}%` : '—';

  const rows = tab === 'nda' ? nda.deals : proposal.deals;
  const loading = tab === 'nda' ? nda.isLoading : proposal.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Deals-on-Board to Proposal · {timeframeLabel}</DialogTitle>
          <DialogDescription>
            {proposal.count} entered Proposal Issued ÷ {nda.count} entered NDA/Needs List Sent · {ratio}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'nda' | 'proposal')}>
          <TabsList>
            <TabsTrigger value="nda">NDA/Needs List Sent ({nda.count})</TabsTrigger>
            <TabsTrigger value="proposal">Proposal Issued ({proposal.count})</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3">
            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-white/10">
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
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-400">No deals</td>
                    </tr>
                  ) : (
                    rows.map((d) => (
                      <tr key={d.deal_id} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-2">
                          <a
                            href={`/deal/${d.deal_id}`}
                            className="text-blue-400 hover:underline"
                          >
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
          <SummaryTile label="Plan" value={fmtRow(totalPlan, effectiveRowType)} color={C.periwinkle} />
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
                    <span style={{ width: 14, height: 0, borderTop: `1.5px dashed ${C.periwinkle}`, display: 'inline-block' }} />
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
                    <Line type="monotone" dataKey="plan" stroke={C.periwinkle} strokeWidth={1.6} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="actual" stroke={C.cyan} strokeWidth={2.4} dot={{ r: 3, fill: C.cyan }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-3">
                <SummaryTile label="Actual" value={fmtRow(totalActual, effectiveRowType)} color={C.cyan} />
                <SummaryTile label="Plan" value={fmtRow(totalPlan, effectiveRowType)} color={C.periwinkle} />
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
export function SalesDashboardV2() {
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

  // Live Sales Calls — fetch for the active range so the per-month bucketing
  // below picks up every month in the selected timeframe.
  const yearStart = rangeStart;
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
  const dealsOnBoardFinservQuery = useFinservDealsOnBoardByMonth(activeYears);
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
  const proposalsIssuedFinservQuery = useFinservProposalsIssuedByMonth(activeYears);
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
  const dealsOnBoardQuery = useDealsOnBoardByMonth(activeYears);
  // Stage-entry counts (from deal_stage_history) driving the
  // "Deals-on-Board to Proposal" conversion card. Always trailing 12 months
  // ending at the selected timeframe's end date so the ratio stays comparable
  // regardless of how narrow the header timeframe is.
  const stageEntryRange = React.useMemo(() => {
    const end = rangeEnd;
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - 12);
    return { start, end };
  }, [rangeEnd]);
  const ndaEnteredInRange = useStageEntryCount('ndaneeds-list-sent', stageEntryRange);
  const proposalEnteredInRange = useStageEntryCount('proposal-issued', stageEntryRange);
  const [onBoardToProposalOpen, setOnBoardToProposalOpen] = React.useState(false);
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
  const proposalsIssuedQuery = useProposalsIssuedByMonth(activeYears);
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
  const dollarsSignedQuery = useDollarsSignedByMonth(activeYears);
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
    // each month back to its calendar year/month key.
    const startY = baseView.rangeStart.getUTCFullYear();
    const startM = baseView.rangeStart.getUTCMonth();
    const mergedPlan = {} as Record<MetricKey, number[]>;
    (Object.keys(baseView.plan) as MetricKey[]).forEach((k) => {
      mergedPlan[k] = baseView.plan[k].map((base, i) => {
        const d = new Date(Date.UTC(startY, startM + i, 1));
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
  }, [baseView, fullDraft, liveSalesCallsActual, liveDealsOnBoardActual, liveProposalsIssuedActual, liveDollarsSignedActual]);

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

  // Drilldown state
  const [drillFocus, setDrillFocus] = React.useState<DrilldownFocus | null>(null);
  const drillApi = React.useMemo<DrilldownApi>(
    () => ({ open: (metricKey, monthIndex) => setDrillFocus({ metricKey, monthIndex }) }),
    [],
  );

  return (
    <ViewCtx.Provider value={view}>
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
              <PipelineVariantToggle
                value={kpiVariant}
                onChange={setKpiVariant}
              />
              <ValueModeToggle
                value={kpiValueMode}
                onChange={setKpiValueMode}
              />
            </div>
            <ViewCtx.Provider value={kpiView}>
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
                      ? kpiVariant === 'finserv'
                        ? 'Dollars on Board (FinServ)'
                        : 'Dollars on Board'
                      : kpiVariant === 'finserv'
                        ? 'Deals on Board (FinServ)'
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
          </div>

          {/* Performance-to-plan panel */}
          <div className="mb-6">
            <PerformancePanel />
          </div>

          {/* Top "Sourced Via" for deals created in the selected timeframe */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopSourcedViaWidget />
          </div>

          {/* Cumulative pace */}
          <div className="mb-6">
            <SalesTeamBoardKpiGrid quarter={selectedQuarter} />
          </div>
          <div className="mb-6 sales-model-scroll overflow-x-auto">
            <div style={{ minWidth: 600 }}>
              <CumulativePace />
            </div>
          </div>

          {/* Conversion metric cards (trailing 3 months) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <ConversionCard title="TBD" value={null} subtitle="—" />
            <ConversionCard
              title="Call-to-Deal Conversion"
              value={(() => {
                const calls = trailing3(liveSalesCallsActual);
                const deals = trailing3(liveDealsOnBoardActual);
                if (calls == null || deals == null || calls === 0) return null;
                return deals / calls;
              })()}
              subtitle={(() => {
                const calls = trailing3(liveSalesCallsActual);
                const deals = trailing3(liveDealsOnBoardActual);
                if (calls == null || deals == null) return 'Loading…';
                return `${deals} deals ÷ ${calls} calls · last 3 months`;
              })()}
            />
            <ConversionCard
              title="Deals-on-Board to Proposal"
              value={(() => {
                if (ndaEnteredInRange.isLoading || proposalEnteredInRange.isLoading) return null;
                const nda = ndaEnteredInRange.count;
                const props = proposalEnteredInRange.count;
                if (!nda) return null;
                return props / nda;
              })()}
              subtitle={(() => {
                if (ndaEnteredInRange.isLoading || proposalEnteredInRange.isLoading) return 'Loading…';
                const nda = ndaEnteredInRange.count;
                const props = proposalEnteredInRange.count;
                return `${props} entered Proposal Issued ÷ ${nda} entered NDA/Needs List Sent · ${selectedQuarter.label}`;
              })()}
              onClick={() => setOnBoardToProposalOpen(true)}
            />
          </div>
          <OnBoardToProposalDrilldown
            open={onBoardToProposalOpen}
            onOpenChange={setOnBoardToProposalOpen}
            nda={ndaEnteredInRange}
            proposal={proposalEnteredInRange}
            timeframeLabel={selectedQuarter.label}
          />

          {/* Sales model sheet */}
          <SalesModelSheet />
        </div>
      </div>
    </div>
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