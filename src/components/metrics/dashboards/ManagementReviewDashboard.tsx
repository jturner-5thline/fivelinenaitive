import { useEffect, useMemo, useRef, useState } from 'react';
import ChartJS from 'chart.js/auto';
import { format } from 'date-fns';
import { RefreshCw, Loader2, Save, RotateCcw, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useMetricsData } from '@/hooks/useMetricsData';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { AsanaGoalsPortfoliosSection } from './AsanaGoalsPortfoliosSection';
import { DraggableGridLayout } from '@/components/metrics/DraggableGridLayout';
import { useGridLayout, GridLayoutItem } from '@/hooks/useGridLayout';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { InsightsDrilldownDrawer, type DrilldownColumn, type DrilldownContext } from '@/components/metrics/insights/InsightsDrilldownDrawer';

// ── Chart.js global defaults (scoped to this dashboard) ──
const setChartDefaults = () => {
  ChartJS.defaults.color = 'rgba(120,180,240,0.5)';
  ChartJS.defaults.borderColor = 'rgba(40,100,180,0.2)';
  ChartJS.defaults.font.size = 9;
  ChartJS.defaults.font.family = 'system-ui, sans-serif';
};

// ── Shared chart options ──
const gx: any = { ticks: { color: 'rgba(100,160,220,0.45)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
const gy: any = { ticks: { color: 'rgba(100,160,220,0.35)', font: { size: 9 } }, grid: { color: 'rgba(20,80,160,0.25)' }, border: { display: false } };
const def: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

// ── Formatting ──
const fmtUSD = (v: number | null | undefined, opts: { unit?: 'auto' | 'k' | 'M' } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const unit = opts.unit ?? 'auto';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (unit === 'M' || (unit === 'auto' && abs >= 1_000_000)) return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
  if (unit === 'k' || (unit === 'auto' && abs >= 1_000)) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};
const fmtDelta = (curr: number | null, prev: number | null): { label: string; positive: boolean } | null => {
  if (curr === null || prev === null) return null;
  const d = curr - prev;
  return { label: `${d >= 0 ? '+' : '−'} ${fmtUSD(Math.abs(d))} vs PM`, positive: d >= 0 };
};
const NA_COLOR = 'rgba(160,210,255,0.35)';

// ── Tiny components ──
function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`relative overflow-hidden rounded-[10px] ${className}`}
      style={{ background: 'rgba(10,60,110,0.55)', border: '1px solid rgba(40,120,200,0.28)', ...style }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(80,180,255,0.4),transparent)' }} />
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: 'rgba(160,210,255,0.5)', marginBottom: 8 }}>{children}</div>;
}

function Sep() {
  return <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(40,140,220,0.3),transparent)', margin: '8px 0' }} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(40,100,180,0.2)', fontSize: 11 }}>
      <span style={{ color: 'rgba(160,210,255,0.55)' }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#d0eaff' }}>{children}</span>
    </div>
  );
}

function NaPlaceholder({ height = 90, label = 'Data unavailable' }: { height?: number; label?: string }) {
  return (
    <div style={{
      height,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6,
      background: 'rgba(20,60,120,0.25)',
      border: '1px dashed rgba(80,150,220,0.25)',
      color: 'rgba(160,210,255,0.5)', fontSize: 10, fontWeight: 600, letterSpacing: '0.6px',
    }}>{label}</div>
  );
}

// Grid item shell with title bar (also drag handle in edit mode)
function GridShell({
  isEditMode,
  title,
  children,
  headerExtra,
  dragHandleMode = 'header',
}: {
  isEditMode: boolean;
  title: string;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  dragHandleMode?: 'header' | 'manual';
}) {
  return (
    <div className="h-full w-full flex flex-col rounded-[10px] overflow-hidden relative"
      style={{ background: 'rgba(10,60,110,0.55)', border: '1px solid rgba(40,120,200,0.28)' }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(80,180,255,0.4),transparent)' }} />
      <div
        className={`px-3 py-2 flex items-center justify-between ${dragHandleMode === 'header' && isEditMode ? 'widget-drag-handle cursor-grab active:cursor-grabbing' : ''}`}
        style={{ borderBottom: '1px solid rgba(40,100,180,0.2)' }}
      >
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(160,210,255,0.6)' }}>
          {title}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {dragHandleMode === 'header' && isEditMode && (
            <div style={{ fontSize: 9, color: 'rgba(160,210,255,0.45)' }}>⋮⋮ drag</div>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 p-3 overflow-hidden">{children}</div>
    </div>
  );
}

// ── Chart hook ──
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ── Standalone KPI widget IDs (formerly children of the Key Stats container) ──
// Each one is now an independent top-level dashboard widget that can be
// dragged, resized, and managed like any other widget.
const STANDALONE_KPI_IDS = [
  'kpi-total-revenue-curr',
  'kpi-operating-profit-curr',
  'kpi-outstanding-ar',
  'kpi-active-pipeline-value',
  'kpi-avg-active-deal-size',
  'kpi-ytd-revenue',
] as const;

// Map standalone widget id → registry id (registry keys are bare metric ids).
const STANDALONE_KPI_TO_REGISTRY: Record<string, string> = {
  'kpi-total-revenue-curr':     'total-revenue-curr',
  'kpi-operating-profit-curr':  'operating-profit-curr',
  'kpi-outstanding-ar':         'outstanding-ar',
  'kpi-active-pipeline-value':  'active-pipeline-value',
  'kpi-avg-active-deal-size':   'avg-active-deal-size',
  'kpi-ytd-revenue':            'ytd-revenue',
};

// ── Default grid layout (12 cols) ──
// Top row: six standalone KPI widgets, each 2 cols wide × 2 rows tall.
const INSIGHTS_DEFAULT_LAYOUT: GridLayoutItem[] = [
  ...STANDALONE_KPI_IDS.map((id, i) => ({
    i: id, x: i * 2, y: 0, w: 2, h: 2, minW: 2, minH: 2, maxH: 4,
  } as GridLayoutItem)),
  { i: 'monthly-revenue',  x: 0, y: 2,  w: 6,  h: 4, minW: 4, minH: 3 },
  { i: 'pipeline-stage',   x: 6, y: 2,  w: 3,  h: 4, minW: 3, minH: 3 },
  { i: 'ar-aging',         x: 9, y: 2,  w: 3,  h: 4, minW: 3, minH: 3 },
  { i: 'bank-balances',    x: 0, y: 6,  w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'liabilities',      x: 4, y: 6,  w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'dscr',             x: 8, y: 6,  w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'cashflow-12w',     x: 0, y: 9,  w: 6,  h: 4, minW: 4, minH: 3 },
  { i: 'debt-rating',      x: 6, y: 9,  w: 6,  h: 4, minW: 4, minH: 3 },
  { i: 'asana-goals',      x: 0, y: 13, w: 12, h: 6, minW: 6, minH: 4 },
];

const INSIGHTS_LAYOUT_IDS = INSIGHTS_DEFAULT_LAYOUT.map(i => i.i);

// ── Dashboard Component ──
interface ManagementReviewDashboardProps {
  isEditMode?: boolean;
  onExitEditMode?: () => void;
}

export function ManagementReviewDashboard({ isEditMode = false, onExitEditMode }: ManagementReviewDashboardProps = {}) {
  const queryClient = useQueryClient();
  const qb = useQuickBooksMetrics();
  const metrics = useMetricsData();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // ── Drilldown state ──
  type DrillRow = Record<string, any>;
  const [drilldown, setDrilldown] = useState<{
    context: DrilldownContext;
    columns: DrilldownColumn<DrillRow>[];
    rows: DrillRow[];
    emptyHint?: string;
  } | null>(null);
  const closeDrilldown = () => setDrilldown(null);

  // Persistent, drag/drop + resize layout
  const {
    layout,
    saveLayout,
    resetLayout,
  } = useGridLayout('insights-management-review-v2', INSIGHTS_LAYOUT_IDS, {
    allowAllMembers: true,
    layoutDefaults: INSIGHTS_DEFAULT_LAYOUT,
  });

  // Snapshot layout on entering edit mode for Cancel
  const editSnapshotRef = useRef<GridLayoutItem[] | null>(null);
  const wasEditingRef = useRef(false);
  useEffect(() => {
    if (isEditMode && !wasEditingRef.current) {
      editSnapshotRef.current = layout;
    }
    wasEditingRef.current = isEditMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

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

  // Bump lastUpdated when underlying data finishes loading
  useEffect(() => {
    if (!qb.isLoading && !metrics.isLoading) setLastUpdated(new Date());
  }, [qb.isLoading, metrics.isLoading]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quickbooks-invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-customers'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['quickbooks-expanded'] }),
        queryClient.invalidateQueries({ queryKey: ['metrics-deals'] }),
        metrics.refetch(),
      ]);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  const isLoading = qb.isLoading || metrics.isLoading;
  const qbConnected = !!qb.data && (qb.data.totalInvoices > 0 || qb.data.totalCustomers > 0);

  // ── Live derived values ──
  const liveDeals = useMemo(
    () => (metrics.rawDeals || []).filter(d => !isExcludedDealName(d.company)),
    [metrics.rawDeals]
  );

  const activeDeals = useMemo(
    () => liveDeals.filter(d => d.status !== 'archived' && d.stage !== 'closed-won' && d.stage !== 'closed-lost'),
    [liveDeals]
  );
  const activeDealCount = activeDeals.length;
  const activePipelineValue = activeDeals.reduce((s, d) => s + Number(d.value || 0), 0);
  const avgDealSize = activeDealCount > 0 ? activePipelineValue / activeDealCount : 0;

  // Pipeline by stage (for chart) — active deals only
  const stageBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of activeDeals) {
      const stage = (d.stage || 'unknown')
        .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      m.set(stage, (m.get(stage) || 0) + Number(d.value || 0));
    }
    return Array.from(m.entries())
      .map(([stage, value]) => ({ stage, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [activeDeals]);

  // QB monthly series (last 12 months, ordered)
  const qbMonthly = qb.data?.monthlyRevenue || [];
  const monthLabels = qbMonthly.map(m => m.month);
  const monthRevenue = qbMonthly.map(m => m.revenue);
  const monthExpenses = qbMonthly.map(m => m.expenses);
  const monthNet = qbMonthly.map(m => m.revenue - m.expenses);

  const currMonth = qbMonthly[qbMonthly.length - 1];
  const prevMonth = qbMonthly[qbMonthly.length - 2];
  const totalRevCurr = currMonth?.revenue ?? null;
  const totalRevPrev = prevMonth?.revenue ?? null;
  const opProfitCurr = currMonth ? currMonth.revenue - currMonth.expenses : null;
  const opProfitPrev = prevMonth ? prevMonth.revenue - prevMonth.expenses : null;
  const ttmRevenue = qbMonthly.length > 0 ? qbMonthly.reduce((s, m) => s + m.revenue, 0) : null;
  const ytdRevenue = (() => {
    if (!qbMonthly.length) return null;
    const yyNow = format(new Date(), 'yy');
    return qbMonthly.filter(m => m.month.endsWith('-' + yyNow)).reduce((s, m) => s + m.revenue, 0);
  })();

  const totalAR = qb.data?.totalAR ?? null;
  const overdueAR = qb.data?.overdueAmount ?? null;

  // ── Chart refs ──
  const rcRef = useRef<HTMLCanvasElement>(null);
  const ncRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<HTMLCanvasElement>(null);
  const arRef = useRef<HTMLCanvasElement>(null);

  // Highlight current month
  const lastIdx = monthLabels.length - 1;
  const bcol = monthLabels.map((_, i) => i === lastIdx ? 'rgba(29,148,255,0.85)' : 'rgba(20,90,170,0.55)');
  const bbrd = monthLabels.map((_, i) => i === lastIdx ? '#4db8ff' : 'rgba(40,120,200,0.5)');

  useChart(rcRef,
    qbConnected && monthLabels.length > 0
      ? { type: 'bar', data: { labels: monthLabels, datasets: [{ data: monthRevenue, backgroundColor: bcol, borderColor: bbrd, borderWidth: 1, borderRadius: 4 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } } }
      : null,
    [qbConnected, JSON.stringify(monthLabels), JSON.stringify(monthRevenue)],
    (idx, label, value) => {
      const m = qbMonthly[idx];
      setDrilldown({
        context: {
          sourceId: 'chart:monthly-revenue',
          sourceLabel: 'Monthly Revenue · QuickBooks',
          selection: label,
          periodLabel: label,
          filters: [{ label: 'Metric', value: 'Revenue' }],
        },
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
          { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => fmtUSD(r.expenses) },
          { key: 'invoiceCount', label: 'Invoices', align: 'right' },
        ],
        rows: m ? [m] : [{ month: label, revenue: value, expenses: 0, invoiceCount: 0 }],
        emptyHint: 'No invoices recorded for this month.',
      });
    }
  );

  const netCol = monthNet.map(v => v >= 0 ? 'rgba(30,180,120,0.55)' : 'rgba(220,60,80,0.5)');
  const netBrd = monthNet.map(v => v >= 0 ? 'rgba(50,230,150,0.8)' : 'rgba(255,90,100,0.8)');
  useChart(ncRef,
    qbConnected && monthLabels.length > 0
      ? { type: 'bar', data: { labels: monthLabels, datasets: [{ data: monthNet, backgroundColor: netCol, borderColor: netBrd, borderWidth: 1, borderRadius: 4 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } } }
      : null,
    [qbConnected, JSON.stringify(monthLabels), JSON.stringify(monthNet)],
    (idx, label, value) => {
      const m = qbMonthly[idx];
      setDrilldown({
        context: {
          sourceId: 'chart:net-cash',
          sourceLabel: 'Net Cash · QuickBooks',
          selection: label,
          periodLabel: label,
          filters: [{ label: 'Metric', value: 'Revenue − Expenses' }],
        },
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
          { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => fmtUSD(r.expenses) },
          { key: 'net', label: 'Net', align: 'right', render: (r) => fmtUSD((r.revenue || 0) - (r.expenses || 0)) },
        ],
        rows: m ? [m] : [{ month: label, revenue: 0, expenses: 0, net: value }],
      });
    }
  );

  useChart(pcRef,
    stageBreakdown.length > 0
      ? { type: 'bar', data: { labels: stageBreakdown.map(s => s.stage), datasets: [{ data: stageBreakdown.map(s => s.value), backgroundColor: 'rgba(29,148,255,0.7)', borderColor: '#4db8ff', borderWidth: 1, borderRadius: 4 }] }, options: { ...def, indexAxis: 'y' as const, scales: { x: { ...gx, ticks: { ...gx.ticks, callback: (v: number) => fmtUSD(v) } }, y: { ...gy } } } }
      : null,
    [JSON.stringify(stageBreakdown)],
    (idx, label) => {
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
          filters: [{ label: 'Stage', value: label }],
        },
        columns: [
          { key: 'company', label: 'Deal' },
          { key: 'stage', label: 'Stage' },
          { key: 'value', label: 'Value', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
        ],
        rows: dealsInStage,
        emptyHint: 'No active deals in this stage.',
      });
    }
  );

  const arBuckets = qb.data?.arAgingData || [];
  useChart(arRef,
    qbConnected && arBuckets.length > 0
      ? { type: 'bar', data: { labels: arBuckets.map(b => b.bucket), datasets: [{ data: arBuckets.map(b => b.value), backgroundColor: arBuckets.map(b => b.bucket === 'current' ? 'rgba(40,220,140,0.6)' : b.bucket === '90+' ? 'rgba(255,90,100,0.7)' : 'rgba(255,190,30,0.6)'), borderWidth: 1, borderRadius: 3 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => fmtUSD(v) } } } } }
      : null,
    [qbConnected, JSON.stringify(arBuckets)],
    (idx, label, value) => {
      setDrilldown({
        context: {
          sourceId: 'chart:ar-aging',
          sourceLabel: 'A/R Aging · QuickBooks',
          selection: label,
          filters: [{ label: 'Bucket', value: label }],
        },
        columns: [
          { key: 'bucket', label: 'Bucket' },
          { key: 'value', label: 'Outstanding', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
        ],
        rows: [{ bucket: label, value }],
        emptyHint: 'No invoices in this aging bucket.',
      });
    }
  );

  // KPI registry — each entry is one of the standalone KPI widgets that
  // were formerly children of the (now removed) Key Stats container.
  // Same metric logic as before, just rendered as top-level widgets.
  type KpiTile = { id: string; l: string; v: string; sub: React.ReactNode; live: boolean };
  const kpiRegistry: KpiTile[] = [
    {
      id: 'total-revenue-curr',
      l: 'Total Revenue (curr mo)', live: qbConnected,
      v: fmtUSD(totalRevCurr),
      sub: (() => {
        const d = fmtDelta(totalRevCurr, totalRevPrev);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'operating-profit-curr',
      l: 'Operating Profit (curr mo)', live: qbConnected,
      v: fmtUSD(opProfitCurr),
      sub: (() => {
        const d = fmtDelta(opProfitCurr, opProfitPrev);
        return d ? <span style={{ color: d.positive ? '#3de89a' : '#ff6b7a' }}>{d.label}</span> : <span style={{ color: NA_COLOR }}>—</span>;
      })(),
    },
    {
      id: 'outstanding-ar',
      l: 'Outstanding A/R', live: qbConnected,
      v: fmtUSD(totalAR),
      sub: <span style={{ color: overdueAR && overdueAR > 0 ? '#ff6b7a' : '#3de89a' }}>
        {overdueAR !== null ? `Overdue ${fmtUSD(overdueAR)}` : '—'}
      </span>,
    },
    {
      id: 'active-pipeline-value',
      l: 'Active Pipeline Value', live: true,
      v: fmtUSD(activePipelineValue),
      sub: <span style={{ color: 'rgba(160,210,255,0.55)' }}>{activeDealCount} active deal{activeDealCount === 1 ? '' : 's'}</span>,
    },
    {
      id: 'avg-active-deal-size',
      l: 'Avg Active Deal Size', live: true,
      v: fmtUSD(avgDealSize),
      sub: <span style={{ color: 'rgba(160,210,255,0.55)' }}>across {activeDealCount}</span>,
    },
    {
      id: 'ytd-revenue',
      l: 'YTD Revenue', live: qbConnected,
      v: fmtUSD(ytdRevenue),
      sub: <span style={{ color: 'rgba(160,210,255,0.55)' }}>TTM {fmtUSD(ttmRevenue)}</span>,
    },
    {
      id: 'ttm-revenue',
      l: 'TTM Revenue', live: qbConnected,
      v: fmtUSD(ttmRevenue),
      sub: <span style={{ color: 'rgba(160,210,255,0.55)' }}>trailing 12 months</span>,
    },
    {
      id: 'active-deal-count',
      l: 'Active Deals', live: true,
      v: String(activeDealCount),
      sub: <span style={{ color: 'rgba(160,210,255,0.55)' }}>open in pipeline</span>,
    },
    {
      id: 'overdue-ar',
      l: 'Overdue A/R', live: qbConnected,
      v: fmtUSD(overdueAR),
      sub: <span style={{ color: 'rgba(160,210,255,0.55)' }}>past due balance</span>,
    },
  ];
  const kpiById = useMemo(() => {
    const m = new Map<string, KpiTile>();
    kpiRegistry.forEach(k => m.set(k.id, k));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiRegistry.map(k => k.id + '|' + k.v).join(',')]);

  return (
    <div style={{ background: 'transparent', color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <Card className="glass-module">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#e8f6ff' }}>
              5th<span style={{ color: '#29aaff' }}>Line</span> Financial
            </span>
            <span style={{ fontSize: 10, color: 'rgba(160,210,255,0.5)' }}>
              Last updated {format(lastUpdated, 'MMM d, yyyy h:mm a')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
            <span style={{ color: 'rgba(160,210,255,0.5)' }}>TTM</span>
            <span style={{ fontWeight: 700, color: '#e8f6ff' }}>{fmtUSD(ttmRevenue, { unit: 'M' })}</span>
            <span style={{ color: 'rgba(160,210,255,0.5)' }}>YTD</span>
            <span style={{ fontWeight: 700, color: '#e8f6ff' }}>{fmtUSD(ytdRevenue, { unit: 'M' })}</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing || isLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: 'rgba(40,120,200,0.25)', color: '#4db8ff',
                border: '1px solid rgba(40,120,200,0.45)', cursor: 'pointer',
                opacity: (refreshing || isLoading) ? 0.6 : 1,
              }}
            >
              {refreshing || isLoading
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>
        </div>
      </Card>

      {/* Edit Mode toolbar */}
      {isEditMode && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'rgba(160,210,255,0.7)' }}>
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

      {/* Draggable, resizable grid */}
      <DraggableGridLayout
        layout={layout}
        onLayoutChange={saveLayout}
        isEditMode={isEditMode}
        rowHeight={70}
        draggableHandle=".widget-drag-handle"
        draggableCancel=".react-resizable-handle"
      >
        {/* Six standalone KPI widgets (formerly children of Key Stats). */}
        {STANDALONE_KPI_IDS.map((widgetId) => {
          const k = kpiById.get(STANDALONE_KPI_TO_REGISTRY[widgetId]);
          return (
            <div key={widgetId} className="h-full">
              <GridShell isEditMode={isEditMode} title={k?.l ?? widgetId}>
                {k ? (
                  <div
                    onClick={() => {
                      if (isEditMode || !k.live) return;
                      const reg = STANDALONE_KPI_TO_REGISTRY[widgetId];
                      let columns: DrilldownColumn[] = [
                        { key: 'metric', label: 'Metric' },
                        { key: 'value', label: 'Value', align: 'right' },
                      ];
                      let rows: any[] = [{ metric: k.l, value: k.v }];
                      let emptyHint: string | undefined;
                      if (reg === 'total-revenue-curr' || reg === 'operating-profit-curr') {
                        columns = [
                          { key: 'month', label: 'Month' },
                          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
                          { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => fmtUSD(r.expenses) },
                          { key: 'net', label: 'Net', align: 'right', render: (r) => fmtUSD((r.revenue || 0) - (r.expenses || 0)) },
                        ];
                        rows = qbMonthly.slice(-6);
                      } else if (reg === 'outstanding-ar') {
                        columns = [
                          { key: 'bucket', label: 'Bucket' },
                          { key: 'value', label: 'Outstanding', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
                        ];
                        rows = arBuckets;
                      } else if (reg === 'active-pipeline-value' || reg === 'avg-active-deal-size') {
                        columns = [
                          { key: 'company', label: 'Deal' },
                          { key: 'stage', label: 'Stage' },
                          { key: 'value', label: 'Value', align: 'right', render: (r) => fmtUSD(Number(r.value || 0)) },
                        ];
                        rows = activeDeals;
                      } else if (reg === 'ytd-revenue') {
                        const yyNow = format(new Date(), 'yy');
                        columns = [
                          { key: 'month', label: 'Month' },
                          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fmtUSD(r.revenue) },
                        ];
                        rows = qbMonthly.filter(m => m.month.endsWith('-' + yyNow));
                      }
                      setDrilldown({
                        context: {
                          sourceId: `kpi:${reg}`,
                          sourceLabel: k.l,
                          selection: k.v,
                        },
                        columns,
                        rows,
                        emptyHint,
                      });
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 4, height: '100%',
                      justifyContent: 'center',
                      cursor: !isEditMode && k.live ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ fontSize: 22, fontWeight: 700, color: k.live ? '#e8f6ff' : NA_COLOR, lineHeight: 1.1 }}>
                      {k.live ? k.v : 'Data unavailable'}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      {k.live ? k.sub : <span style={{ color: NA_COLOR }}>—</span>}
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
          <GridShell isEditMode={isEditMode} title="Monthly Revenue (last 12 mo · QuickBooks)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
              {qbConnected && monthLabels.length > 0
                ? <div style={{ position: 'relative', flex: 1, minHeight: 100 }}><canvas ref={rcRef} /></div>
                : <NaPlaceholder height={148} label={isLoading ? 'Loading…' : 'QuickBooks not connected'} />}
              <Sep />
              <SectionLabel>Net Cash (Revenue − Expenses)</SectionLabel>
              {qbConnected && monthLabels.length > 0
                ? <div style={{ position: 'relative', flex: 1, minHeight: 80 }}><canvas ref={ncRef} /></div>
                : <NaPlaceholder height={108} label={isLoading ? 'Loading…' : 'Data unavailable'} />}
            </div>
          </GridShell>
        </div>

        <div key="pipeline-stage" className="h-full">
          <GridShell isEditMode={isEditMode} title="Active Pipeline by Stage">
            {stageBreakdown.length > 0
              ? <div style={{ position: 'relative', height: '70%' }}><canvas ref={pcRef} /></div>
              : <NaPlaceholder height={150} label={isLoading ? 'Loading…' : 'No active deals'} />}
            <Sep />
            <Row label="Active Deals"><span style={{ color: '#4db8ff', fontWeight: 700 }}>{activeDealCount}</span></Row>
            <Row label="Pipeline Value"><span style={{ color: '#4db8ff', fontWeight: 700 }}>{fmtUSD(activePipelineValue)}</span></Row>
          </GridShell>
        </div>

        <div key="ar-aging" className="h-full">
          <GridShell isEditMode={isEditMode} title="A/R Aging">
            {qbConnected && (qb.data?.arAgingData?.length || 0) > 0
              ? <div style={{ position: 'relative', height: 130 }}><canvas ref={arRef} /></div>
              : <NaPlaceholder height={130} label={isLoading ? 'Loading…' : 'Data unavailable'} />}
            <Sep />
            <Row label="Total A/R">{fmtUSD(totalAR)}</Row>
            <Row label="Overdue">
              <span style={{ color: overdueAR && overdueAR > 0 ? '#ff6b7a' : '#3de89a' }}>{fmtUSD(overdueAR)}</span>
            </Row>
            <Row label="Open Invoices">
              <span style={{ color: '#d0eaff' }}>{qb.data?.totalInvoices ?? '—'}</span>
            </Row>
            <Row label="Active Customers">
              <span style={{ color: '#d0eaff' }}>{qb.data?.activeCustomers ?? '—'}</span>
            </Row>
          </GridShell>
        </div>

        <div key="bank-balances" className="h-full">
          <GridShell isEditMode={isEditMode} title="Bank Account Balances">
            <NaPlaceholder height={140} label="Data unavailable — connect bank feeds" />
          </GridShell>
        </div>
        <div key="liabilities" className="h-full">
          <GridShell isEditMode={isEditMode} title="Liabilities & Debt Service">
            <NaPlaceholder height={140} label="Data unavailable — no live debt source" />
          </GridShell>
        </div>
        <div key="dscr" className="h-full">
          <GridShell isEditMode={isEditMode} title="DSCR / Debt Coverage">
            <NaPlaceholder height={140} label="Data unavailable — requires debt schedule" />
          </GridShell>
        </div>
        <div key="cashflow-12w" className="h-full">
          <GridShell isEditMode={isEditMode} title="12-Week Cashflow Forecast">
            <NaPlaceholder height={170} label="Data unavailable — no forecast model wired" />
          </GridShell>
        </div>
        <div key="debt-rating" className="h-full">
          <GridShell isEditMode={isEditMode} title="Debt by Rating (A/B/C)">
            <NaPlaceholder height={170} label="Data unavailable — requires lender rating field" />
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
      />
    </div>
  );
}
