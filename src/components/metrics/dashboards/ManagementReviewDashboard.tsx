import { useEffect, useMemo, useRef, useState } from 'react';
import ChartJS from 'chart.js/auto';
import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  subMonths,
  subQuarters,
} from 'date-fns';
import { RefreshCw, Loader2, Save, RotateCcw, X } from 'lucide-react';
import WhatWorkingSections from './WhatWorkingSections';
import { useQueryClient } from '@tanstack/react-query';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useInsightsTimeframe } from '@/contexts/InsightsTimeframeContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { AsanaGoalsPortfoliosSection } from './AsanaGoalsPortfoliosSection';
import { DraggableGridLayout } from '@/components/metrics/DraggableGridLayout';
import { useGridLayout, GridLayoutItem } from '@/hooks/useGridLayout';
import { QuarterlyRevenueGrowthCard } from '@/components/insights/QuarterlyRevenueGrowthCard';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { InsightsDrilldownDrawer, type DrilldownColumn, type DrilldownContext, type DrilldownTrend } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { useTwelveWeekCashflowForecast } from '@/hooks/useTwelveWeekCashflowForecast';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const setChartDefaults = () => {
  ChartJS.defaults.color = 'rgba(255,255,255,0.5)';
  ChartJS.defaults.borderColor = 'rgba(255,255,255,0.08)';
  ChartJS.defaults.font.size = 9;
  ChartJS.defaults.font.family = 'system-ui, sans-serif';
};

const gx: any = { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
const gy: any = { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.08)' }, border: { display: false } };
const def: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
const NA_COLOR = 'rgba(255,255,255,0.35)';

const renderDelta = (current: number | null, prior: number | null, label: string) => {
  if (current === null || prior === null) {
    return <span style={{ color: 'rgba(255,255,255,0.45)' }}>No prior {label} comparison</span>;
  }
  const delta = current - prior;
  const pct = prior === 0 ? null : (delta / Math.abs(prior)) * 100;
  const positive = delta >= 0;
  const color = positive ? '#3de89a' : '#ff6b7a';
  const arrow = positive ? '▲' : '▼';
  const sign = positive ? '+' : '−';
  const absDelta = Math.abs(delta);
  const dollar = `${sign}${fmtUSD(absDelta)}`;
  const pctStr = pct === null ? '—' : `${sign}${Math.abs(pct).toFixed(1)}%`;
  return (
    <span style={{ color, fontWeight: 600 }}>
      {arrow} {dollar} <span style={{ opacity: 0.85, fontWeight: 500 }}>({pctStr}) vs prior {label}</span>
    </span>
  );
};

type DateRange = { start: Date; end: Date };
type MonthBucket = { key: string; label: string; start: Date; end: Date };
type RevenueSeriesPoint = {
  key: string;
  month: string;
  revenue: number;
  payments: number;
  expenses: number;
  invoiceCount: number;
};

const fmtUSD = (v: number | null | undefined, opts: { unit?: 'auto' | 'k' | 'M' } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const unit = opts.unit ?? 'auto';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (unit === 'M' || (unit === 'auto' && abs >= 1_000_000)) return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
  if (unit === 'k' || (unit === 'auto' && abs >= 1_000)) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const fmtDelta = (curr: number | null, prev: number | null, basis = 'vs prior period'): { label: string; positive: boolean } | null => {
  if (curr === null || prev === null) return null;
  const d = curr - prev;
  return { label: `${d >= 0 ? '+' : '−'} ${fmtUSD(Math.abs(d))} ${basis}`, positive: d >= 0 };
};

const parseValueDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toDateRange = (start: string, end: string): DateRange => ({
  start: startOfDay(parseValueDate(start) ?? new Date()),
  end: endOfDay(parseValueDate(end) ?? new Date()),
});

const isDateInRange = (value: string | null | undefined, range: DateRange) => {
  const d = parseValueDate(value);
  return d ? isWithinInterval(d, range) : false;
};

const sumAmountInRange = <T,>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string | null | undefined,
  getAmount: (item: T) => number | null | undefined,
) => items.reduce((sum, item) => sum + (isDateInRange(getDate(item), range) ? Number(getAmount(item) ?? 0) : 0), 0);

const countInRange = <T,>(
  items: T[],
  range: DateRange,
  getDate: (item: T) => string | null | undefined,
) => items.reduce((count, item) => count + (isDateInRange(getDate(item), range) ? 1 : 0), 0);

const buildMonthBuckets = (start: Date, end: Date): MonthBucket[] => {
  const buckets: MonthBucket[] = [];
  let cursor = startOfMonth(start);
  const finalMonth = startOfMonth(end);
  while (cursor <= finalMonth) {
    const bucketStart = startOfMonth(cursor);
    const bucketEnd = endOfMonth(cursor);
    buckets.push({
      key: format(bucketStart, 'yyyy-MM'),
      label: format(bucketStart, 'MMM-yy'),
      start: bucketStart,
      end: bucketEnd,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return buckets;
};

const buildTrailingMonthBuckets = (anchorEnd: Date, count = 12) => {
  const start = startOfMonth(subMonths(anchorEnd, count - 1));
  return buildMonthBuckets(start, anchorEnd).slice(-count);
};

const buildPreviousRange = (range: DateRange, view?: 'month' | 'quarter' | null): DateRange => {
  if (view === 'month') {
    const prevStart = startOfMonth(subMonths(range.start, 1));
    return { start: startOfDay(prevStart), end: endOfDay(endOfMonth(prevStart)) };
  }
  if (view === 'quarter') {
    const prevStart = startOfQuarter(subQuarters(range.start, 1));
    return { start: startOfDay(prevStart), end: endOfDay(endOfQuarter(prevStart)) };
  }
  const duration = range.end.getTime() - range.start.getTime();
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  return { start: startOfDay(prevStart), end: endOfDay(prevEnd) };
};

const formatRangeLabel = (range: DateRange) => `${format(range.start, 'yyyy-MM-dd')} → ${format(range.end, 'yyyy-MM-dd')}`;

function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`relative overflow-hidden rounded-[10px] ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...style }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,hsla(213,90%,70%,0.4),transparent)' }} />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>{children}</div>;
}

function Sep() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)', margin: '8px 0' }} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 11 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ fontWeight: 500, color: 'hsl(0,0%,100%)' }}>{children}</span>
    </div>
  );
}

function NaPlaceholder({ height = 90, label = 'Data unavailable' }: { height?: number; label?: string }) {
  return (
    <div style={{
      height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.03)',
      border: '1px dashed rgba(255,255,255,0.10)',
      color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, letterSpacing: '0.6px',
      textAlign: 'center',
      padding: '0 12px',
    }}>{label}</div>
  );
}

function CashflowForecastWidget() {
  const { weeks, isLoading } = useTwelveWeekCashflowForecast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useChart(
    canvasRef,
    weeks.length === 0
      ? null
      : {
          type: 'bar',
          data: {
            labels: weeks.map((w) => format(new Date(w.weekEnding + 'T00:00:00'), 'MMM d')),
            datasets: [
              {
                label: 'Ending Cash',
                data: weeks.map((w) => w.endingCash),
                backgroundColor: 'hsla(213,90%,70%,0.55)',
                borderColor: 'hsla(213,90%,70%,0.85)',
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          },
          options: {
            ...def,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items: any[]) => {
                    const i = items?.[0]?.dataIndex ?? 0;
                    const w = weeks[i];
                    if (!w) return '';
                    return `Week ending ${format(new Date(w.weekEnding + 'T00:00:00'), 'EEE, MMM d, yyyy')}`;
                  },
                  label: (ctx: any) => `Ending Cash: ${fmtUSD(Number(ctx.parsed?.y ?? 0))}`,
                },
              },
            },
            scales: {
              x: gx,
              y: {
                ...gy,
                ticks: {
                  ...gy.ticks,
                  callback: (v: any) => fmtUSD(Number(v)),
                },
              },
            },
          },
        },
    [weeks],
  );

  if (isLoading) {
    return <NaPlaceholder height={170} label="Loading 12-week forecast…" />;
  }
  if (!weeks || weeks.length === 0) {
    return <NaPlaceholder height={170} label="No forecast data — add scheduled cash flows in Finance > Cash Flow" />;
  }

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} />
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.4px' }}>
        Source: Finance &gt; Cash Flow — ENDING CASH per week
      </div>
    </div>
  );
}

function GridShell({
  isEditMode,
  title,
  children,
  headerExtra,
  dragHandleMode = 'header',
  titleAlign = 'left',
}: {
  isEditMode: boolean;
  title: string;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  dragHandleMode?: 'header' | 'manual';
  titleAlign?: 'left' | 'center';
}) {
  return (
    <div className="h-full w-full flex flex-col rounded-[10px] overflow-hidden relative"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,hsla(213,90%,70%,0.4),transparent)' }} />
      <div
        className={`px-3 py-2 flex items-center justify-between ${dragHandleMode === 'header' && isEditMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '1.2px',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)',
          flex: titleAlign === 'center' ? 1 : undefined,
          textAlign: titleAlign === 'center' ? 'center' : 'left',
        }}>
          {title}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {dragHandleMode === 'header' && isEditMode && (
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>⋮⋮ drag</div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 p-3 overflow-hidden">{children}</div>
    </div>
  );
}

function useChart(
  ref: React.RefObject<HTMLCanvasElement | null>,
  config: any,
  deps: any[],
  onPointClick?: (index: number, label: string, value: number) => void,
) {
  useEffect(() => {
    if (!ref.current || !config) return;
    setChartDefaults();
    const finalConfig = onPointClick
      ? {
          ...config,
          options: {
            ...(config.options || {}),
            onHover: (evt: any, els: any[]) => {
              const target = evt?.native?.target as HTMLElement | undefined;
              if (target) target.style.cursor = els && els.length ? 'pointer' : 'default';
            },
            onClick: (_evt: any, elements: any[], chart: any) => {
              if (!elements || elements.length === 0) return;
              const el = elements[0];
              const idx = el.index ?? 0;
              const label = String(chart.data.labels?.[idx] ?? '');
              const value = Number(chart.data.datasets?.[el.datasetIndex ?? 0]?.data?.[idx] ?? 0);
              onPointClick(idx, label, value);
            },
          },
        }
      : config;
    const chart = new ChartJS(ref.current, finalConfig);
    return () => chart.destroy();
  }, deps);
}

const STANDALONE_KPI_IDS = [
  'kpi-total-revenue-curr',
  'kpi-operating-profit-curr',
  'kpi-outstanding-ar',
  'kpi-active-pipeline-value',
  'kpi-ttm-revenue',
  'kpi-ytd-revenue',
] as const;

const STANDALONE_KPI_TO_REGISTRY: Record<string, string> = {
  'kpi-total-revenue-curr': 'total-revenue-curr',
  'kpi-operating-profit-curr': 'operating-profit-curr',
  'kpi-outstanding-ar': 'outstanding-ar',
  'kpi-active-pipeline-value': 'active-pipeline-value',
  'kpi-ttm-revenue': 'ttm-revenue',
  'kpi-ytd-revenue': 'ytd-revenue',
};

const INSIGHTS_DEFAULT_LAYOUT: GridLayoutItem[] = [
  ...STANDALONE_KPI_IDS.map((id, i) => ({
    i: id, x: i * 2, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxH: 4,
  } as GridLayoutItem)),
  { i: 'monthly-revenue', x: 0, y: 2, w: 6, h: 4, minW: 4, minH: 3 },
  { i: 'ar-aging', x: 6, y: 2, w: 6, h: 4, minW: 3, minH: 3 },
  { i: 'active-deals-list', x: 0, y: 6, w: 12, h: 5, minW: 6, minH: 3 },
  { i: 'bank-balances', x: 0, y: 11, w: 4, h: 3, minW: 3, minH: 2 },
  { i: 'liabilities', x: 4, y: 11, w: 4, h: 3, minW: 3, minH: 2 },
  { i: 'dscr', x: 8, y: 11, w: 4, h: 3, minW: 3, minH: 2 },
  { i: 'cashflow-12w', x: 0, y: 14, w: 6, h: 4, minW: 4, minH: 3 },
  { i: 'debt-rating', x: 6, y: 14, w: 6, h: 4, minW: 4, minH: 3 },
  { i: 'asana-goals', x: 0, y: 18, w: 12, h: 6, minW: 6, minH: 4 },
];

const INSIGHTS_LAYOUT_IDS = INSIGHTS_DEFAULT_LAYOUT.map(i => i.i);

interface ManagementReviewDashboardProps {
  isEditMode?: boolean;
  onExitEditMode?: () => void;
}

export function ManagementReviewDashboard({ isEditMode = false, onExitEditMode }: ManagementReviewDashboardProps = {}) {
  const queryClient = useQueryClient();
  const qb = useQuickBooksMetrics();
  const metrics = useMetricsData();
  const { reportingPeriod, timeframe } = useInsightsTimeframe();
  const { activePipelineId } = usePipelineContext();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [drilldown, setDrilldown] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn<Record<string, any>>[];
    rows: Record<string, any>[];
    emptyHint?: string;
    trend?: DrilldownTrend;
  } | null>(null);
  const closeDrilldown = () => setDrilldown(null);

  const {
    layout,
    saveLayout,
    resetLayout,
  } = useGridLayout('insights-management-review-v2', INSIGHTS_LAYOUT_IDS, {
    allowAllMembers: true,
    layoutDefaults: INSIGHTS_DEFAULT_LAYOUT,
  });

  const editSnapshotRef = useRef<GridLayoutItem[] | null>(null);
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (isEditMode && !wasEditingRef.current) {
      editSnapshotRef.current = layout;
    }
    wasEditingRef.current = isEditMode;
  }, [isEditMode, layout]);

  const handleSaveLayout = () => {
    saveLayout(layout, true);
    editSnapshotRef.current = null;
    toast.success('Layout saved');
    onExitEditMode?.();
  };

  const handleCancelLayout = () => {
    if (editSnapshotRef.current) {
      saveLayout(editSnapshotRef.current, true);
    }
    editSnapshotRef.current = null;
    onExitEditMode?.();
  };

  const handleResetLayout = async () => {
    await resetLayout();
    toast.success('Layout reset to default');
  };

  const periodRange = useMemo(
    () => toDateRange(reportingPeriod?.start ?? timeframe.start, reportingPeriod?.end ?? timeframe.end),
    [reportingPeriod?.start, reportingPeriod?.end, timeframe.start, timeframe.end],
  );
  const previousRange = useMemo(
    () => buildPreviousRange(periodRange, reportingPeriod?.view ?? null),
    [periodRange, reportingPeriod?.view],
  );
  const comparisonBasis = reportingPeriod?.view === 'quarter' ? 'vs prior quarter' : 'vs prior month';
  const periodLabel = reportingPeriod?.label ?? timeframe.label;
  const periodToken = reportingPeriod?.period ?? `${timeframe.start}_${timeframe.end}`;

  const isCurrentReportingPeriod = useMemo(() => {
    if (!reportingPeriod) return false;
    const now = new Date();
    if (reportingPeriod.view === 'month') {
      return reportingPeriod.period === format(now, 'yyyy-MM');
    }
    return reportingPeriod.period === `${format(now, 'yyyy')}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  }, [reportingPeriod]);

  useEffect(() => {
    if (!qb.isLoading && !metrics.isLoading) setLastUpdated(new Date());
  }, [qb.isLoading, metrics.isLoading, periodToken]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quickbooks-invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-customers'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['qb-quickbooks_expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['qb-quickbooks_bills'] }),
        queryClient.invalidateQueries({ queryKey: ['qb-quickbooks_accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['metrics-deals'] }),
        metrics.refetch(),
      ]);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const isLoading = qb.isLoading || metrics.isLoading;
  const qbConnected = (qb.rawInvoices?.length ?? 0) > 0 || (qb.rawPayments?.length ?? 0) > 0 || (qb.rawExpenses?.length ?? 0) > 0;
  const qbInvoices = qb.rawInvoices ?? [];
  const qbPayments = qb.rawPayments ?? [];
  const qbExpenses = qb.rawExpenses ?? [];

  const allDeals = useMemo(
    () => (metrics.rawDeals || []).filter(d => !isExcludedDealName(d.company)),
    [metrics.rawDeals],
  );

  const revenueSeries: RevenueSeriesPoint[] = useMemo(() => {
    const buckets = reportingPeriod?.view === 'quarter'
      ? buildMonthBuckets(periodRange.start, periodRange.end)
      : buildTrailingMonthBuckets(periodRange.end, 12);

    return buckets.map((bucket) => ({
      key: bucket.key,
      month: bucket.label,
      revenue: sumAmountInRange(qbInvoices, bucket, inv => inv.txn_date, inv => inv.total_amt),
      payments: sumAmountInRange(qbPayments, bucket, payment => payment.txn_date, payment => payment.total_amt),
      expenses: sumAmountInRange(qbExpenses, bucket, expense => expense.txn_date, expense => expense.total_amt),
      invoiceCount: countInRange(qbInvoices, bucket, inv => inv.txn_date),
    }));
  }, [periodRange, qbInvoices, qbPayments, qbExpenses, reportingPeriod?.view]);

  const ytdRange = useMemo<DateRange>(() => ({
    start: startOfDay(new Date(periodRange.end.getFullYear(), 0, 1)),
    end: periodRange.end,
  }), [periodRange.end]);

  const ttmRange = useMemo<DateRange>(() => {
    const end = periodRange.end;
    // Trailing 12 months ending on the selected period end.
    // e.g. period end 2026-04-30 → start 2025-05-01.
    const start = startOfDay(new Date(end.getFullYear() - 1, end.getMonth() + 1, 1));
    return { start, end };
  }, [periodRange.end]);

  // Prior comparable TTM: the immediately preceding 12-month window
  // (e.g. current TTM May 2025–Apr 2026 → prior TTM May 2024–Apr 2025).
  const priorTtmRange = useMemo<DateRange>(() => {
    const end = startOfDay(new Date(ttmRange.start.getFullYear(), ttmRange.start.getMonth(), 0));
    const start = startOfDay(new Date(end.getFullYear() - 1, end.getMonth() + 1, 1));
    return { start, end };
  }, [ttmRange.start]);

  // Prior YTD: same Jan 1 → same month/day cutoff in the prior year.
  const priorYtdRange = useMemo<DateRange>(() => {
    const end = startOfDay(new Date(periodRange.end.getFullYear() - 1, periodRange.end.getMonth(), periodRange.end.getDate()));
    const start = startOfDay(new Date(end.getFullYear(), 0, 1));
    return { start, end };
  }, [periodRange.end]);

  const ytdSeries = useMemo(() => {
    const buckets = buildMonthBuckets(ytdRange.start, ytdRange.end);
    return buckets.map((bucket) => ({
      month: bucket.label,
      revenue: sumAmountInRange(qbInvoices, bucket, inv => inv.txn_date, inv => inv.total_amt),
    }));
  }, [qbInvoices, ytdRange]);

  const periodRevenue = useMemo(
    () => sumAmountInRange(qbInvoices, periodRange, inv => inv.txn_date, inv => inv.total_amt),
    [qbInvoices, periodRange],
  );
  const previousRevenue = useMemo(
    () => sumAmountInRange(qbInvoices, previousRange, inv => inv.txn_date, inv => inv.total_amt),
    [qbInvoices, previousRange],
  );
  const periodExpenses = useMemo(
    () => sumAmountInRange(qbExpenses, periodRange, exp => exp.txn_date, exp => exp.total_amt),
    [qbExpenses, periodRange],
  );
  const previousExpenses = useMemo(
    () => sumAmountInRange(qbExpenses, previousRange, exp => exp.txn_date, exp => exp.total_amt),
    [qbExpenses, previousRange],
  );
  const periodPayments = useMemo(
    () => sumAmountInRange(qbPayments, periodRange, payment => payment.txn_date, payment => payment.total_amt),
    [qbPayments, periodRange],
  );

  const totalRevCurr = qbConnected ? periodRevenue : null;
  const totalRevPrev = qbConnected ? previousRevenue : null;
  const opProfitCurr = qbConnected ? periodRevenue - periodExpenses : null;
  const opProfitPrev = qbConnected ? previousRevenue - previousExpenses : null;
  const ytdRevenue = qbConnected ? ytdSeries.reduce((sum, row) => sum + row.revenue, 0) : null;
  const ttmSeries = useMemo(() => {
    const buckets = buildMonthBuckets(ttmRange.start, ttmRange.end);
    return buckets.map((bucket) => ({
      month: bucket.label,
      revenue: sumAmountInRange(qbInvoices, bucket, inv => inv.txn_date, inv => inv.total_amt),
    }));
  }, [qbInvoices, ttmRange]);
  const ttmRevenue = qbConnected ? ttmSeries.reduce((sum, row) => sum + row.revenue, 0) : null;

  const priorTtmRevenue = useMemo(
    () => qbConnected ? sumAmountInRange(qbInvoices, priorTtmRange, inv => inv.txn_date, inv => inv.total_amt) : null,
    [qbConnected, qbInvoices, priorTtmRange],
  );
  const priorYtdRevenue = useMemo(
    () => qbConnected ? sumAmountInRange(qbInvoices, priorYtdRange, inv => inv.txn_date, inv => inv.total_amt) : null,
    [qbConnected, qbInvoices, priorYtdRange],
  );

  const chartMode = reportingPeriod?.view === 'quarter' ? 'quarter' : 'rolling';
  const chartWindowLabel = chartMode === 'quarter'
    ? `${periodLabel} · monthly live data`
    : `12 months ending ${periodLabel}`;

  const monthLabels = revenueSeries.map(point => point.month);
  const monthRevenue = revenueSeries.map(point => point.revenue);
  const monthExpenses = revenueSeries.map(point => point.expenses);
  const monthNet = revenueSeries.map(point => point.revenue - point.expenses);

  // TTM Revenue trend: for each bucket in revenueSeries, plot the trailing
  // 12-month total revenue ending at that bucket's end (sum across all QBO
  // entities). Each point recalculates its own rolling 12-month window.
  const ttmTrendSeries = useMemo(() => {
    const buckets = reportingPeriod?.view === 'quarter'
      ? buildMonthBuckets(periodRange.start, periodRange.end)
      : buildTrailingMonthBuckets(periodRange.end, 12);
    return buckets.map((bucket) => {
      const end = bucket.end;
      const start = startOfMonth(subMonths(end, 11));
      const revenue = sumAmountInRange(
        qbInvoices,
        { start, end },
        inv => inv.txn_date,
        inv => inv.total_amt,
      );
      return {
        key: bucket.key,
        month: bucket.label,
        windowStart: start,
        windowEnd: end,
        revenue,
      };
    });
  }, [periodRange, qbInvoices, reportingPeriod?.view]);
  const ttmTrendValues = ttmTrendSeries.map(p => p.revenue);

  const pipelineUnavailableReason = isCurrentReportingPeriod
    ? 'No active pipeline records found for the current snapshot.'
    : `Unavailable for ${periodLabel} — no historical pipeline snapshot source exists.`;
  const arUnavailableReason = isCurrentReportingPeriod
    ? 'No receivables snapshot available.'
    : `Unavailable for ${periodLabel} — no historical A/R snapshot source exists.`;

  const activeDeals = useMemo(
    () => (isCurrentReportingPeriod
      ? allDeals.filter(d => d.status !== 'archived' && d.stage !== 'closed-won' && d.stage !== 'closed-lost')
      : []),
    [allDeals, isCurrentReportingPeriod],
  );

  // Focused active deals list for the "Active Deals" widget:
  // - Only deals in the active pipeline
  // - Stages between Final Credit Items and In Due Diligence (inclusive)
  // - Exclude On Hold and Archived statuses
  // Centralized stage normalization shared by inclusion logic + display.
  // Accepts slug, human label, or legacy variants and returns a canonical slug.
  const normalizeDebtPipelineStage = (raw: unknown): string => {
    const s = String(raw ?? '').toLowerCase().trim().replace(/[\s/]+/g, '-').replace(/-+/g, '-');
    const aliases: Record<string, string> = {
      'final-credit-items': 'final-credit-items',
      'final-credit-item': 'final-credit-items',
      'submitted-to-lenders': 'submitted-to-lenders',
      'submitted': 'submitted-to-lenders',
      'lenders-in-review': 'lenders-in-review',
      'lender-review': 'lenders-in-review',
      'in-lender-review': 'lenders-in-review',
      'terms-issued': 'terms-issued',
      'term-sheet': 'terms-issued',
      'term-sheets': 'terms-issued',
      'in-due-diligence': 'in-due-diligence',
      'due-diligence': 'in-due-diligence',
      'diligence': 'in-due-diligence',
    };
    return aliases[s] ?? s;
  };

  const ACTIVE_DEAL_LIST_STAGES = useMemo(() => new Set([
    'final-credit-items',
    'submitted-to-lenders',
    'lenders-in-review',
    'terms-issued',
    'in-due-diligence',
  ]), []);

  const activeDealsList = useMemo(() => {
    const excluded: Array<{ name: string; rawStage: unknown; normalized: string; reason: string }> = [];
    const included = allDeals.filter((d: any) => {
      const normalized = normalizeDebtPipelineStage(d.stage);
      if (!ACTIVE_DEAL_LIST_STAGES.has(normalized)) {
        excluded.push({ name: d.company, rawStage: d.stage, normalized, reason: 'stage-out-of-range' });
        return false;
      }
      if (d.status === 'archived' || d.status === 'on-hold') {
        excluded.push({ name: d.company, rawStage: d.stage, normalized, reason: `status:${d.status}` });
        return false;
      }
      if (activePipelineId && d.pipeline_id && d.pipeline_id !== activePipelineId) {
        excluded.push({ name: d.company, rawStage: d.stage, normalized, reason: `wrong-pipeline:${d.pipeline_id}` });
        return false;
      }
      return true;
    });
    if (import.meta.env.DEV) {
      const interesting = excluded.filter(e =>
        /upflex|athyna/i.test(e.name || '') || e.normalized === 'in-due-diligence' || e.normalized === 'final-credit-items'
      );
      if (interesting.length) {
        // eslint-disable-next-line no-console
        console.info('[DebtPipeline] excluded candidates', interesting);
      }
      // eslint-disable-next-line no-console
      console.info('[DebtPipeline] included', included.map((d: any) => ({ name: d.company, stage: d.stage, pipeline: d.pipeline_id })));
    }
    return included.sort((a: any, b: any) => {
      const ad = a.projected_close_date ? new Date(a.projected_close_date).getTime() : Infinity;
      const bd = b.projected_close_date ? new Date(b.projected_close_date).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return String(a.company || '').localeCompare(String(b.company || ''));
    });
  }, [allDeals, activePipelineId, ACTIVE_DEAL_LIST_STAGES]);

  // Latest status note per deal (for hover tooltips on Deal Name + Status)
  const [debtPipelineStatusNotes, setDebtPipelineStatusNotes] = useState<Record<string, string>>({});
  const debtPipelineDealIds = useMemo(
    () => activeDealsList.map((d: any) => d.id),
    [activeDealsList],
  );
  const debtPipelineDealIdsKey = debtPipelineDealIds.join(',');
  useEffect(() => {
    let cancelled = false;
    if (debtPipelineDealIds.length === 0) {
      setDebtPipelineStatusNotes({});
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('deal_status_notes')
        .select('deal_id, note, created_at')
        .in('deal_id', debtPipelineDealIds)
        .order('created_at', { ascending: false });
      if (cancelled || error || !data) return;
      const latest: Record<string, string> = {};
      for (const row of data as any[]) {
        if (!latest[row.deal_id]) latest[row.deal_id] = row.note;
      }
      setDebtPipelineStatusNotes(latest);
    })();
    return () => { cancelled = true; };
  }, [debtPipelineDealIdsKey]);

  // 6-month revenue chart: selected month + 5 following months.
  // Revenue per month = sum of total_fee for active-pipeline deals whose
  // projected_close_date falls in that month.
  const debtPipelineChart = useMemo(() => {
    const anchor = reportingPeriod?.view === 'month'
      ? startOfMonth(periodRange.start)
      : startOfMonth(periodRange.end);
    const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 0; i < 6; i++) {
      const s = startOfMonth(new Date(anchor.getFullYear(), anchor.getMonth() + i, 1));
      const e = endOfMonth(s);
      buckets.push({ key: format(s, 'yyyy-MM'), label: format(s, 'MMM yy'), start: s, end: e });
    }
    const totals = buckets.map(b => {
      const sum = activeDealsList.reduce((acc: number, d: any) => {
        if (!d.projected_close_date) return acc;
        const dt = new Date(d.projected_close_date);
        if (Number.isNaN(dt.getTime())) return acc;
        if (dt >= b.start && dt <= b.end) return acc + Number(d.total_fee || 0);
        return acc;
      }, 0);
      return sum;
    });
    return { labels: buckets.map(b => b.label), values: totals };
  }, [activeDealsList, periodRange, reportingPeriod?.view]);

  const debtPipelineChartRef = useRef<HTMLCanvasElement>(null);
  useChart(
    debtPipelineChartRef,
    debtPipelineChart.labels.length > 0
      ? {
          type: 'bar',
          data: {
            labels: debtPipelineChart.labels,
            datasets: [{
              data: debtPipelineChart.values,
              backgroundColor: 'hsla(213,90%,70%,0.65)',
              borderColor: 'hsl(213,90%,70%)',
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            ...def,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx: any) => fmtUSD(Number(ctx.parsed.y || 0)) } },
            },
            scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } },
          },
        }
      : null,
    [JSON.stringify(debtPipelineChart.labels), JSON.stringify(debtPipelineChart.values)],
  );

  const statusDisplay = (status: string): { label: string; color: string } | null => {
    if (status === 'on-track') return { label: 'On Track', color: '#3de89a' };
    if (status === 'at-risk') return { label: 'At Risk', color: '#ffbe1e' };
    if (status === 'off-track') return { label: 'Off Track', color: '#ff6b7a' };
    return null;
  };

  const formatCloseMonth = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    const d = parseValueDate(dateStr);
    return d ? format(d, 'MMM yyyy') : '—';
  };
  const activeDealCount = activeDeals.length;
  const activePipelineValue = activeDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const avgDealSize = activeDealCount > 0 ? activePipelineValue / activeDealCount : 0;

  const stageBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of activeDeals) {
      const stage = (d.stage || 'unknown')
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      m.set(stage, (m.get(stage) || 0) + Number(d.value || 0));
    }
    return Array.from(m.entries())
      .map(([stage, value]) => ({ stage, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [activeDeals]);

  const totalAR = useMemo(() => {
    if (!isCurrentReportingPeriod) return null;
    return qbInvoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
  }, [qbInvoices, isCurrentReportingPeriod]);

  const overdueInvoices = useMemo(() => {
    if (!isCurrentReportingPeriod) return [];
    const now = new Date();
    return qbInvoices.filter(inv => {
      const due = parseValueDate(inv.due_date);
      return !!due && Number(inv.balance || 0) > 0 && due < now;
    });
  }, [qbInvoices, isCurrentReportingPeriod]);

  const overdueAR = useMemo(
    () => (isCurrentReportingPeriod ? overdueInvoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0) : null),
    [isCurrentReportingPeriod, overdueInvoices],
  );

  const arBuckets = useMemo(() => {
    if (!isCurrentReportingPeriod) return [] as { bucket: string; value: number }[];
    const now = new Date();
    const agingBuckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    qbInvoices.forEach(inv => {
      const balance = Number(inv.balance || 0);
      if (balance <= 0) return;
      const dueDate = parseValueDate(inv.due_date);
      if (!dueDate) {
        agingBuckets.current += balance;
        return;
      }
      const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPast <= 0) agingBuckets.current += balance;
      else if (daysPast <= 30) agingBuckets['1-30'] += balance;
      else if (daysPast <= 60) agingBuckets['31-60'] += balance;
      else if (daysPast <= 90) agingBuckets['61-90'] += balance;
      else agingBuckets['90+'] += balance;
    });
    return Object.entries(agingBuckets).map(([bucket, value]) => ({ bucket, value }));
  }, [qbInvoices, isCurrentReportingPeriod]);

  const rcRef = useRef<HTMLCanvasElement>(null);
  const ncRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<HTMLCanvasElement>(null);
  const arRef = useRef<HTMLCanvasElement>(null);

  const lastIdx = monthLabels.length - 1;
  const bcol = monthLabels.map((_, i) => i === lastIdx ? 'hsla(213,90%,70%,0.85)' : 'hsla(213,90%,70%,0.55)');
  const bbrd = monthLabels.map((_, i) => i === lastIdx ? 'hsl(213,90%,70%)' : 'rgba(255,255,255,0.08)');

  useChart(
    rcRef,
    qbConnected && monthLabels.length > 0
      ? {
          type: 'bar',
          data: { labels: monthLabels, datasets: [{ data: monthRevenue, backgroundColor: bcol, borderColor: bbrd, borderWidth: 1, borderRadius: 4 }] },
          options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } },
        }
      : null,
    [qbConnected, JSON.stringify(monthLabels), JSON.stringify(monthRevenue), periodToken],
    (idx, label, value) => {
      const row = revenueSeries[idx];
      setDrilldown({
        context: {
          sourceId: 'chart:monthly-revenue',
          sourceLabel: 'Revenue · QuickBooks',
          selection: label,
          periodLabel,
          filters: [
            { label: 'Reporting period', value: periodLabel },
            { label: 'Chart window', value: chartWindowLabel },
          ],
        },
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
          { key: 'payments', label: 'Payments', align: 'right', render: (r) => fmtUSD(r.payments) },
          { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => fmtUSD(r.expenses) },
          { key: 'invoiceCount', label: 'Invoices', align: 'right' },
        ],
        rows: row ? [row] : [{ month: label, revenue: value, payments: 0, expenses: 0, invoiceCount: 0 }],
        emptyHint: 'No QuickBooks invoice activity recorded for this month.',
      });
    },
  );

  const ttmLabels = ttmTrendSeries.map(p => p.month);
  const ttmCol = ttmTrendSeries.map((_p, i) => i === ttmTrendSeries.length - 1 ? 'hsla(213,90%,70%,0.85)' : 'hsla(213,90%,70%,0.55)');
  const ttmBrd = ttmTrendSeries.map((_p, i) => i === ttmTrendSeries.length - 1 ? 'hsl(213,90%,70%)' : 'rgba(255,255,255,0.08)');
  const [trendMode, setTrendMode] = useState<'ttm' | 'monthly' | 'quarterly-yoy'>('ttm');
  const monthlyTrendLabels = ttmSeries.map(p => p.month);
  const monthlyTrendValues = ttmSeries.map(p => p.revenue);
  const monthlyCol = monthlyTrendLabels.map((_l, i) => i === monthlyTrendLabels.length - 1 ? 'hsla(213,90%,70%,0.85)' : 'hsla(213,90%,70%,0.55)');
  const monthlyBrd = monthlyTrendLabels.map((_l, i) => i === monthlyTrendLabels.length - 1 ? 'hsl(213,90%,70%)' : 'rgba(255,255,255,0.08)');
  useChart(
    ncRef,
    qbConnected && (trendMode === 'ttm' ? ttmLabels.length > 0 : monthlyTrendLabels.length > 0)
      ? {
          type: 'bar',
          data: trendMode === 'ttm'
            ? { labels: ttmLabels, datasets: [{ label: 'TTM Revenue', data: ttmTrendValues, backgroundColor: ttmCol, borderColor: ttmBrd, borderWidth: 1, borderRadius: 4 }] }
            : { labels: monthlyTrendLabels, datasets: [{ label: 'Monthly Revenue', data: monthlyTrendValues, backgroundColor: monthlyCol, borderColor: monthlyBrd, borderWidth: 1, borderRadius: 4 }] },
          options: {
            ...def,
            plugins: {
              ...((def as any).plugins || {}),
              tooltip: {
                callbacks: {
                  title: (items: any[]) => {
                    const idx = items?.[0]?.dataIndex ?? 0;
                    if (trendMode === 'ttm') {
                      const p = ttmTrendSeries[idx];
                      if (!p) return '';
                      return `12 mo ending ${format(p.windowEnd, 'MMM yyyy')}`;
                    }
                    return monthlyTrendLabels[idx] ?? '';
                  },
                  label: (item: any) => {
                    if (trendMode === 'ttm') {
                      const p = ttmTrendSeries[item.dataIndex];
                      const range = p ? `${format(p.windowStart, 'MMM d, yyyy')} – ${format(p.windowEnd, 'MMM d, yyyy')}` : '';
                      return `TTM Revenue: ${fmtUSD(item.parsed.y)}${range ? `  (${range})` : ''}`;
                    }
                    return `Monthly Revenue: ${fmtUSD(item.parsed.y)}`;
                  },
                },
              },
            },
            scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } },
          },
        }
      : null,
    [qbConnected, trendMode, JSON.stringify(ttmLabels), JSON.stringify(ttmTrendValues), JSON.stringify(monthlyTrendLabels), JSON.stringify(monthlyTrendValues), periodToken],
    (idx, label, value) => {
      if (trendMode === 'monthly') {
        setDrilldown({
          context: {
            sourceId: 'chart:monthly-revenue-trend',
            sourceLabel: 'Monthly Revenue · QuickBooks',
            selection: label,
            periodLabel,
            filters: [{ label: 'Metric', value: 'Monthly revenue (all entities)' }],
          },
          columns: [
            { key: 'month', label: 'Month' },
            { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
          ],
          rows: [{ month: label, revenue: value }],
          emptyHint: 'No QuickBooks invoice activity recorded for this month.',
        });
        return;
      }
      const p = ttmTrendSeries[idx];
      setDrilldown({
        context: {
          sourceId: 'chart:ttm-revenue',
          sourceLabel: 'TTM Revenue · QuickBooks',
          selection: label,
          periodLabel,
          filters: [
            { label: 'Reporting period', value: periodLabel },
            { label: 'Metric', value: 'Trailing 12-month revenue (all entities)' },
            ...(p ? [{ label: 'Window', value: `${format(p.windowStart, 'MMM d, yyyy')} – ${format(p.windowEnd, 'MMM d, yyyy')}` }] : []),
          ],
        },
        columns: [
          { key: 'window', label: 'Window' },
          { key: 'revenue', label: 'TTM Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
        ],
        rows: p
          ? [{ window: `${format(p.windowStart, 'MMM d, yyyy')} – ${format(p.windowEnd, 'MMM d, yyyy')}`, revenue: p.revenue }]
          : [{ window: label, revenue: value }],
        emptyHint: 'No QuickBooks invoice activity recorded for this trailing 12-month window.',
      });
    },
  );

  useChart(
    pcRef,
    stageBreakdown.length > 0
      ? {
          type: 'bar',
          data: { labels: stageBreakdown.map(s => s.stage), datasets: [{ data: stageBreakdown.map(s => s.value), backgroundColor: 'hsla(213,90%,70%,0.7)', borderColor: 'hsl(213,90%,70%)', borderWidth: 1, borderRadius: 4 }] },
          options: { ...def, indexAxis: 'y' as const, scales: { x: { ...gx, ticks: { ...gx.ticks, callback: (v: number) => fmtUSD(v) } }, y: { ...gy } } },
        }
      : null,
    [JSON.stringify(stageBreakdown), periodToken],
    (_idx, label) => {
      const stageKey = label.toLowerCase().replace(/\s+/g, '-');
      const dealsInStage = activeDeals.filter(d => {
        const pretty = (d.stage || 'unknown').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return pretty === label || d.stage === stageKey;
      });
      setDrilldown({
        context: {
          sourceId: 'chart:pipeline-by-stage',
          sourceLabel: 'Active Pipeline by Stage',
          selection: label,
          periodLabel,
          filters: [{ label: 'Snapshot source', value: 'Current live pipeline only' }],
        },
        columns: [
          { key: 'company', label: 'Deal' },
          { key: 'stage', label: 'Stage' },
          { key: 'value', label: 'Value', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
        ],
        rows: dealsInStage,
        emptyHint: pipelineUnavailableReason,
      });
    },
  );

  useChart(
    arRef,
    arBuckets.length > 0
      ? {
          type: 'bar',
          data: { labels: arBuckets.map(b => b.bucket), datasets: [{ data: arBuckets.map(b => b.value), backgroundColor: arBuckets.map(b => b.bucket === 'current' ? 'rgba(40,220,140,0.6)' : b.bucket === '90+' ? 'rgba(255,90,100,0.7)' : 'rgba(255,190,30,0.6)'), borderWidth: 1, borderRadius: 3 }] },
          options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } },
        }
      : null,
    [JSON.stringify(arBuckets), periodToken],
    (_idx, label, value) => {
      setDrilldown({
        context: {
          sourceId: 'chart:ar-aging',
          sourceLabel: 'A/R Aging · QuickBooks',
          selection: label,
          periodLabel,
          filters: [{ label: 'Snapshot source', value: 'Current receivables only' }],
        },
        columns: [
          { key: 'bucket', label: 'Bucket' },
          { key: 'value', label: 'Outstanding', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
        ],
        rows: [{ bucket: label, value }],
        emptyHint: arUnavailableReason,
      });
    },
  );

  type KpiTile = { id: string; l: string; v: string; sub: React.ReactNode; live: boolean; emptyHint?: string };
  const kpiRegistry: KpiTile[] = [
    {
      id: 'total-revenue-curr',
      l: 'Revenue (selected period)',
      live: qbConnected,
      v: fmtUSD(totalRevCurr),
      sub: (() => {
        const d = fmtDelta(totalRevCurr, totalRevPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'operating-profit-curr',
      l: 'Operating Profit (selected period)',
      live: qbConnected,
      v: fmtUSD(opProfitCurr),
      sub: (() => {
        const d = fmtDelta(opProfitCurr, opProfitPrev, comparisonBasis);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'outstanding-ar',
      l: 'Outstanding A/R',
      live: qbConnected && isCurrentReportingPeriod,
      v: fmtUSD(totalAR),
      sub: <span style={{ color: overdueAR && overdueAR > 0 ? '#ff6b7a' : '#3de89a' }}>{overdueAR !== null ? `Overdue ${fmtUSD(overdueAR)}` : '—'}</span>,
      emptyHint: arUnavailableReason,
    },
    {
      id: 'active-pipeline-value',
      l: 'Active Pipeline Value',
      live: isCurrentReportingPeriod,
      v: fmtUSD(activePipelineValue),
      sub: <span style={{ color: 'rgba(255,255,255,0.55)' }}>{activeDealCount} active deal{activeDealCount === 1 ? '' : 's'}</span>,
      emptyHint: pipelineUnavailableReason,
    },
    {
      id: 'ttm-revenue',
      l: 'TTM Revenue',
      live: qbConnected,
      v: fmtUSD(ttmRevenue),
      sub: renderDelta(ttmRevenue, priorTtmRevenue, 'TTM'),
      emptyHint: 'TTM revenue unavailable — connect QuickBooks to populate finance data.',
    },
    {
      id: 'ytd-revenue',
      l: 'YTD Revenue',
      live: qbConnected,
      v: fmtUSD(ytdRevenue),
      sub: renderDelta(ytdRevenue, priorYtdRevenue, 'YTD'),
    },
  ];

  const kpiById = useMemo(() => {
    const m = new Map<string, KpiTile>();
    kpiRegistry.forEach(k => m.set(k.id, k));
    return m;
  }, [kpiRegistry]);

  const auditRows = useMemo(() => ([
    {
      widget: 'Revenue (selected period)',
      dataSource: 'quickbooks_invoices',
      queryParams: `txn_date in ${formatRangeLabel(periodRange)} (client-filtered live query)`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Operating Profit (selected period)',
      dataSource: 'quickbooks_invoices + quickbooks_expenses',
      queryParams: `txn_date in ${formatRangeLabel(periodRange)}; compare ${formatRangeLabel(previousRange)}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Outstanding A/R',
      dataSource: 'quickbooks_invoices balances',
      queryParams: isCurrentReportingPeriod ? 'current receivables snapshot' : 'no historical A/R snapshot source',
      reportingPeriod: periodLabel,
      state: isCurrentReportingPeriod ? 'live-snapshot' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Active Pipeline Value / Active Pipeline by Stage',
      dataSource: 'deals current snapshot',
      queryParams: isCurrentReportingPeriod ? 'current live pipeline snapshot' : 'no historical pipeline snapshot source',
      reportingPeriod: periodLabel,
      state: isCurrentReportingPeriod ? 'live-snapshot' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'TTM Revenue',
      dataSource: 'quickbooks_invoices (all entities)',
      queryParams: `txn_date in ${formatRangeLabel(ttmRange)}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'TTM Revenue Trend chart',
      dataSource: 'quickbooks_invoices (all entities)',
      queryParams: chartMode === 'quarter'
        ? `rolling 12-mo windows for each month in ${formatRangeLabel(periodRange)}`
        : `rolling 12-mo windows for 12 months ending ${format(periodRange.end, 'yyyy-MM-dd')}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'YTD Revenue',
      dataSource: 'quickbooks_invoices',
      queryParams: `txn_date in ${formatRangeLabel(ytdRange)}`,
      reportingPeriod: periodLabel,
      state: qbConnected ? 'live-query-cached-recomputed' : 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Bank Account Balances / Liabilities / DSCR / Cashflow / Debt Rating',
      dataSource: 'none',
      queryParams: 'no live source wired',
      reportingPeriod: periodLabel,
      state: 'truthful-empty',
      recomputesOnPeriodChange: true,
    },
    {
      widget: 'Asana Goals & Portfolios',
      dataSource: 'Asana live integration',
      queryParams: 'operational widget; not reporting-period-scoped',
      reportingPeriod: periodLabel,
      state: 'live-nonfinancial',
      recomputesOnPeriodChange: true,
    },
  ]), [chartMode, isCurrentReportingPeriod, periodLabel, periodRange, previousRange, qbConnected, ytdRange, ttmRange]);

  useEffect(() => {
    console.groupCollapsed(`[Insights period audit] ${periodLabel}`);
    console.table(auditRows);
    console.groupEnd();
  }, [auditRows, periodLabel]);

  return (
    <div style={{ background: 'transparent', color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isEditMode && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Layout edit mode — drag titles to move, drag corners to resize
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={handleResetLayout}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to Default
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelLayout}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSaveLayout}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save Layout
            </Button>
          </div>
        </div>
      )}

      <DraggableGridLayout
        layout={layout}
        onLayoutChange={saveLayout}
        isEditMode={isEditMode}
        rowHeight={70}
        draggableHandle=".widget-drag-handle"
        draggableCancel=".react-resizable-handle"
      >
        {STANDALONE_KPI_IDS.map((widgetId) => {
          const k = kpiById.get(STANDALONE_KPI_TO_REGISTRY[widgetId]);
          return (
            <div key={widgetId} className="h-full">
              <GridShell isEditMode={isEditMode} title={k?.l ?? widgetId} titleAlign="center">
                {k ? (
                  <div
                    onClick={() => {
                      if (isEditMode || !k.live) return;
                      const reg = STANDALONE_KPI_TO_REGISTRY[widgetId];
                      let columns: DrilldownColumn<Record<string, any>>[] = [
                        { key: 'metric', label: 'Metric' },
                        { key: 'value', label: 'Value', align: 'right' },
                      ];
                      let rows: Record<string, any>[] = [{ metric: k.l, value: k.v }];
                      let emptyHint: string | undefined = k.emptyHint;
                      let trend: DrilldownTrend | undefined = undefined;
                      if (reg === 'total-revenue-curr' || reg === 'operating-profit-curr') {
                        columns = [
                          { key: 'month', label: 'Month' },
                          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
                          { key: 'payments', label: 'Payments', align: 'right', render: (r) => fmtUSD(r.payments) },
                          { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => fmtUSD(r.expenses) },
                          { key: 'net', label: 'Net', align: 'right', render: (r) => fmtUSD((r.revenue || 0) - (r.expenses || 0)) },
                        ];
                        rows = revenueSeries.map(row => ({ ...row, net: row.revenue - row.expenses }));
                        const isOp = reg === 'operating-profit-curr';
                        trend = {
                          unit: 'currency',
                          seriesLabel: isOp ? 'Operating Profit' : 'Revenue',
                          data: revenueSeries.map(row => ({
                            label: row.month,
                            value: isOp ? (row.revenue || 0) - (row.expenses || 0) : (row.revenue || 0),
                          })),
                        };
                      } else if (reg === 'outstanding-ar') {
                        columns = [
                          { key: 'bucket', label: 'Bucket' },
                          { key: 'value', label: 'Outstanding', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
                        ];
                        rows = arBuckets;
                      } else if (reg === 'active-pipeline-value') {
                        columns = [
                          { key: 'company', label: 'Deal' },
                          { key: 'stage', label: 'Stage' },
                          { key: 'value', label: 'Value', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
                        ];
                        rows = activeDeals;
                      } else if (reg === 'ttm-revenue') {
                        columns = [
                          { key: 'month', label: 'Month' },
                          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
                        ];
                        rows = ttmSeries;
                        trend = {
                          unit: 'currency',
                          seriesLabel: 'TTM Revenue',
                          data: ttmSeries.map(p => ({ label: p.month, value: Number(p.revenue) || 0 })),
                        };
                      } else if (reg === 'ytd-revenue') {
                        columns = [
                          { key: 'month', label: 'Month' },
                          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
                        ];
                        rows = ytdSeries;
                        trend = {
                          unit: 'currency',
                          seriesLabel: 'YTD Revenue',
                          data: ytdSeries.map(p => ({ label: p.month, value: Number(p.revenue) || 0 })),
                        };
                      }
                      setDrilldown({
                        context: {
                          sourceId: `kpi:${reg}`,
                          sourceLabel: k.l,
                          selection: k.v,
                          periodLabel,
                        },
                        columns,
                        rows,
                        emptyHint,
                        trend,
                      });
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 4, height: '100%',
                      justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                      cursor: !isEditMode && k.live ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 700, color: k.live ? '#e8f6ff' : NA_COLOR, lineHeight: 1.1, textAlign: 'center' }}>
                      {k.live ? k.v : 'Unavailable'}
                    </div>
                    <div style={{ fontSize: 11, textAlign: 'center', color: k.live ? undefined : NA_COLOR }}>
                      {k.live ? k.sub : (k.emptyHint ?? 'No live source')}
                    </div>
                  </div>
                ) : (
                  <NaPlaceholder height={100} label="Metric unavailable" />
                )}
              </GridShell>
            </div>
          );
        })}

        <div key="monthly-revenue" className="h-full">
          <GridShell
            isEditMode={isEditMode}
            title={
              trendMode === 'ttm'
                ? `TTM Revenue Trend (${chartWindowLabel})`
                : trendMode === 'monthly'
                ? 'Monthly Revenue Trend'
                : 'Quarterly Revenue Growth (YoY)'
            }
            headerExtra={
              <div style={{ display: 'inline-flex', padding: 2, borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {(['ttm', 'monthly', 'quarterly-yoy'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setTrendMode(m); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase',
                      padding: '3px 9px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      color: trendMode === m ? 'hsl(228,22%,14%)' : 'rgba(255,255,255,0.75)',
                      background: trendMode === m ? 'linear-gradient(180deg, hsl(213,90%,75%), hsl(213,90%,70%))' : 'transparent',
                    }}
                  >
                    {m === 'ttm' ? 'TTM' : m === 'monthly' ? 'Monthly' : 'Quarterly Growth'}
                  </button>
                ))}
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
              {trendMode !== 'quarterly-yoy' && (
                <SectionLabel>
                  {trendMode === 'ttm'
                    ? 'TTM Revenue (rolling 12 months) — each point shows total revenue for the 12 months ending in that period; all QuickBooks entities combined'
                    : 'Monthly Revenue — each bar shows total revenue for that calendar month across all QuickBooks entities'}
                </SectionLabel>
              )}
              {trendMode === 'quarterly-yoy' ? (
                <div style={{ flex: 1, minHeight: 180, display: 'flex' }}><QuarterlyRevenueGrowthCard bare /></div>
              ) : qbConnected && (trendMode === 'ttm' ? ttmLabels.length > 0 : monthlyTrendLabels.length > 0)
                ? <div style={{ position: 'relative', flex: 1, minHeight: 180 }}><canvas ref={ncRef} /></div>
                : <NaPlaceholder height={200} label={isLoading ? 'Loading…' : 'Revenue unavailable — connect QuickBooks to populate finance data.'} />}
            </div>
          </GridShell>
        </div>

        <div key="ar-aging" className="h-full">
          <GridShell isEditMode={isEditMode} title={`A/R Aging${isCurrentReportingPeriod ? '' : ' · unavailable for selected period'}`}>
            {arBuckets.length > 0
              ? <div style={{ position: 'relative', height: 130 }}><canvas ref={arRef} /></div>
              : <NaPlaceholder height={130} label={isLoading ? 'Loading…' : arUnavailableReason} />}
            <Sep />
            <Row label="Total A/R">{isCurrentReportingPeriod ? fmtUSD(totalAR) : '—'}</Row>
            <Row label="Overdue">
              <span style={{ color: overdueAR && overdueAR > 0 ? '#ff6b7a' : '#3de89a' }}>{isCurrentReportingPeriod ? fmtUSD(overdueAR) : '—'}</span>
            </Row>
            <Row label="Open Invoices">
              <span style={{ color: 'hsl(0,0%,100%)' }}>{isCurrentReportingPeriod ? qbInvoices.filter(inv => Number(inv.balance || 0) > 0).length : '—'}</span>
            </Row>
            <Row label="Payments in Period">
              <span style={{ color: 'hsl(0,0%,100%)' }}>{qbConnected ? fmtUSD(periodPayments) : '—'}</span>
            </Row>
          </GridShell>
        </div>

        <div key="active-deals-list" className="h-full">
          <GridShell isEditMode={isEditMode} title="Debt Pipeline">
            <TooltipProvider>
              <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeDealsList.length === 0 ? (
                  <NaPlaceholder height={140} label="No active deals in Final Credit through In Due Diligence." />
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Deal Name</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Total Fee Revenue</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Retainer</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Milestone Fee</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Expected Close Month</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeDealsList.map((d: any) => {
                        const sd = statusDisplay(d.status);
                        const note = debtPipelineStatusNotes[d.id] || 'No status note yet';
                        return (
                          <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <td style={{ padding: '6px 8px', color: '#e8f6ff', fontWeight: 500 }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span style={{ cursor: 'help' }}>{d.company}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">{note}</TooltipContent>
                              </Tooltip>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}>{fmtUSD(Number(d.total_fee || 0))}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}>{fmtUSD(Number(d.retainer_fee || 0))}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}>{fmtUSD(Number(d.milestone_fee || 0))}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: 'hsl(0,0%,100%)' }}>{formatCloseMonth(d.projected_close_date)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', color: sd?.color ?? 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span style={{ cursor: 'help' }}>{sd?.label ?? '—'}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">{note}</TooltipContent>
                              </Tooltip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700, padding: '4px 8px' }}>
                    Revenue by Month · Next 6 Months
                  </div>
                  <div style={{ position: 'relative', height: 140 }}>
                    <canvas ref={debtPipelineChartRef} />
                  </div>
                </div>
              </div>
            </TooltipProvider>
          </GridShell>
        </div>

        <div key="bank-balances" className="h-full">
          <GridShell isEditMode={isEditMode} title="Bank Account Balances">
            <NaPlaceholder height={140} label="Data unavailable — no live period-scoped bank balance source" />
          </GridShell>
        </div>
        <div key="liabilities" className="h-full">
          <GridShell isEditMode={isEditMode} title="Liabilities & Debt Service">
            <NaPlaceholder height={140} label="Data unavailable — no live debt schedule source" />
          </GridShell>
        </div>
        <div key="dscr" className="h-full">
          <GridShell isEditMode={isEditMode} title="DSCR / Debt Coverage">
            <NaPlaceholder height={140} label="Data unavailable — requires a live debt coverage model" />
          </GridShell>
        </div>
        <div key="cashflow-12w" className="h-full">
          <GridShell isEditMode={isEditMode} title="12-Week Cashflow Forecast">
            <CashflowForecastWidget />
          </GridShell>
        </div>
        <div key="debt-rating" className="h-full">
          <GridShell isEditMode={isEditMode} title="Debt by Rating (A/B/C)">
            <NaPlaceholder height={170} label="Data unavailable — requires lender rating history" />
          </GridShell>
        </div>
        <div key="asana-goals" className="h-full overflow-auto">
          <GridShell isEditMode={isEditMode} title="Asana Goals & Portfolios">
            <AsanaGoalsPortfoliosSection />
          </GridShell>
        </div>
      </DraggableGridLayout>

      <InsightsDrilldownDrawer
        open={!!drilldown}
        onClose={closeDrilldown}
        context={drilldown?.context ?? null}
        columns={drilldown?.columns ?? []}
        rows={drilldown?.rows ?? []}
        emptyHint={drilldown?.emptyHint}
        trend={drilldown?.trend}
      />
    </div>
  );
}
