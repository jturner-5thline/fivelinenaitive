import { useEffect, useRef, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LayoutDashboard, BarChart3, Pencil, AlertTriangle, AlertCircle, Clock, Briefcase, Inbox, ListChecks } from 'lucide-react';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { useNavigate } from 'react-router-dom';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Chart, registerables } from 'chart.js';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useDashboardKpiYtd,
  useIsKpiPlanAdmin,
  type KpiMetricKey,
} from '@/hooks/useDashboardKpiYtd';
import { KpiPlanEditDialog } from './KpiPlanEditDialog';
import { formatUSD } from '@/lib/formatters/currency';
import {
  mapDealToDashboardRow,
  buildDashboardMetrics,
  filterDashboardDeals,
  sortDashboardRows,
  generateMonthOptions,
  type SortColumn,
  type SortDir,
  type DashboardDealRow,
} from './dashboardDataMapper';

Chart.register(...registerables);

export interface DashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to land on when the modal opens. Defaults to 'dashboard'. */
  initialTab?: 'dashboard' | 'analytics' | 'queue' | 'tasks';
  /**
   * When true, render the dashboard body inline (no Dialog wrapper) so the
   * same content can be hosted as a tab inside another modal (e.g. the
   * Daily Rundown). The `open`/`onOpenChange` props are ignored in this
   * mode — the body always renders.
   */
  embedded?: boolean;
}

const TABLE_COLUMNS: { key: SortColumn; label: string; align?: 'left' }[] = [
  { key: 'name', label: 'Deal Name', align: 'left' },
  { key: 'size', label: 'Size', align: 'left' },
  { key: 'fee', label: 'Fee' },
  { key: 'gross', label: 'Gross' },
  { key: 'billed', label: 'Billed @ Close' },
  { key: 'referral', label: 'Referral' },
  { key: 'origination', label: 'Origination' },
  { key: 'assocDir', label: 'Assoc. Dir.' },
  { key: 'dirMd', label: 'Director/MD' },
  { key: 'profit', label: 'Profit' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'closing', label: 'Closing Mo.' },
];

// Analytics is the legacy /analytics page repurposed as the second tab here.
// Lazy so the heavy chart bundle only loads when the user picks the tab.
const AnalyticsTabContent = lazy(() => import('@/pages/Analytics'));
const NikiPerformanceTab = lazy(() =>
  import('@/components/dashboard/NikiPerformanceTab').then(m => ({ default: m.NikiPerformanceTab })),
);
const TasksTabContent = lazy(() => import('@/pages/Tasks'));

export function DashboardModal({ open: openProp, onOpenChange, initialTab = 'dashboard', embedded = false }: DashboardModalProps) {
  const open = embedded ? true : openProp;
  const { user } = useAuth();
  const canSeePerformance =
    user?.email === 'nheikali@5thline.co' || user?.email === 'jturner@5thline.co';
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const { data: queueItems = [] } = useAiActionQueue();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'performance' | 'queue' | 'tasks'>(initialTab);
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  // Combined "By Status" widget supports two metric modes that share the
  // same status taxonomy (On Track / At Risk / Off Track) and dataset.
  const [statusMode, setStatusMode] = useState<'deal_volume' | 'fee_revenue'>('deal_volume');

  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);

  const [sortCol, setSortCol] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { deals, updateDeal } = useDealsContext();
  const { pipelines } = usePipelineContext();
  const navigate = useNavigate();

  const monthOptions = useMemo(() => generateMonthOptions(), []);

  const filteredDeals = useMemo(() => {
    const defaultPipeline = pipelines.find(p => p.isDefault);
    const active = defaultPipeline
      ? deals.filter(d => d.pipelineId === defaultPipeline.id && d.status !== 'archived' && d.dealClass !== 'naitive')
      : deals.filter(d => d.status !== 'archived' && d.dealClass !== 'naitive');
    return filterDashboardDeals(active);
  }, [deals, pipelines]);

  const rows = useMemo(() => filteredDeals.map(mapDealToDashboardRow), [filteredDeals]);
  const metrics = useMemo(() => buildDashboardMetrics(rows), [rows]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    return sortDashboardRows(rows, sortCol, sortDir);
  }, [rows, sortCol, sortDir]);

  // "Active Deals" toggle — restrict the table to deals at "Final Credit
  // Items" or later in the active pipeline's stage order. Stacks on top of
  // the existing filteredDeals dataset.
  const [activeDealsOnly, setActiveDealsOnly] = useState(false);
  const activeStageIds = useMemo(() => {
    const defaultPipeline = pipelines.find(p => p.isDefault);
    if (!defaultPipeline) return new Set<string>();
    const stages = defaultPipeline.stages ?? [];
    const idx = stages.findIndex(
      s => (s.label ?? '').trim().toLowerCase() === 'final credit items',
    );
    if (idx < 0) return new Set<string>();
    return new Set(stages.slice(idx).map(s => s.id));
  }, [pipelines]);
  const dealStageById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of filteredDeals) m.set(d.id, d.stage as string);
    return m;
  }, [filteredDeals]);
  const displayedRows = useMemo(() => {
    if (!activeDealsOnly || activeStageIds.size === 0) return sortedRows;
    return sortedRows.filter(r => activeStageIds.has(dealStageById.get(r.dealId) ?? ''));
  }, [sortedRows, activeDealsOnly, activeStageIds, dealStageById]);

  // ── Deals Running Behind ────────────────────────────────────────
  // Same logic that previously powered the standalone "Deals Running
  // Behind" panel. Now consumed directly by the Deal Pipeline table to
  // tint qualifying rows red.
  const stageLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pipelines) {
      for (const s of (p.stages ?? [])) m.set(s.id, s.label ?? '');
    }
    return m;
  }, [pipelines]);

  const behindMap = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    const out = new Map<string, { reason: string; daysBehind: number }>();
    for (const d of filteredDeals) {
      const eff = d.dashboardClosingDate || d.closingDate || null;
      const closeTs = eff ? new Date(eff).getTime() : NaN;
      const updatedTs = d.updatedAt ? new Date(d.updatedAt).getTime() : NaN;
      const milestones = d.milestones ?? [];
      const overdueMs = milestones.filter(m => {
        if (m.completed) return false;
        if (!m.dueDate) return false;
        const t = new Date(m.dueDate).getTime();
        return Number.isFinite(t) && t < now;
      });
      const mostOverdue = overdueMs.reduce<{ ms: typeof overdueMs[number]; days: number } | null>((acc, m) => {
        const days = Math.floor((now - new Date(m.dueDate!).getTime()) / DAY);
        if (!acc || days > acc.days) return { ms: m, days };
        return acc;
      }, null);

      let reason = '';
      let daysBehind = 0;
      const pastClose = Number.isFinite(closeTs) && closeTs < now;
      const within14 = Number.isFinite(closeTs) && closeTs >= now && (closeTs - now) <= 14 * DAY;
      const quiet = Number.isFinite(updatedTs) && (now - updatedTs) >= 7 * DAY;

      if (pastClose) {
        daysBehind = Math.floor((now - closeTs) / DAY);
        reason = `${daysBehind} days past expected close`;
      } else if (within14 && quiet) {
        daysBehind = Math.floor((now - updatedTs) / DAY);
        reason = `Closing soon · no activity in ${daysBehind} days`;
      } else if (mostOverdue) {
        daysBehind = mostOverdue.days;
        reason = `Milestone: ${mostOverdue.ms.title} — ${mostOverdue.days} days overdue`;
      } else {
        continue;
      }
      out.set(d.id, { reason, daysBehind });
    }
    return out;
  }, [filteredDeals]);

  // Per-deal row indicators for the Deal Pipeline table:
  // - overdue milestone names
  // - "approaching close" (within 30 days) with no lender in In Review
  const rowFlags = useMemo(() => {
    const DAY = 86_400_000;
    const now = Date.now();
    const m = new Map<string, { overdue: string[]; approachingNoReview: boolean }>();
    for (const d of filteredDeals) {
      const overdue: string[] = [];
      for (const ms of (d.milestones ?? [])) {
        if (ms.completed || !ms.dueDate) continue;
        const t = new Date(ms.dueDate).getTime();
        if (Number.isFinite(t) && t < now) overdue.push(ms.title);
      }
      const eff = d.dashboardClosingDate || d.closingDate || null;
      const closeTs = eff ? new Date(eff).getTime() : NaN;
      const approaching = Number.isFinite(closeTs) && (closeTs - now) <= 30 * DAY && (closeTs - now) >= -1 * DAY;
      const hasInReview = (d.lenders ?? []).some(l => (l.status === 'in-review') || (String(l.stage || '').toLowerCase() === 'in-review'));
      m.set(d.id, { overdue, approachingNoReview: approaching && !hasInReview });
    }
    return m;
  }, [filteredDeals]);

  // ── Plan vs Actual KPIs (YTD) ──────────────────────────────────
  const kpi = useDashboardKpiYtd();
  const isPlanAdmin = useIsKpiPlanAdmin();
  const [editingMetric, setEditingMetric] = useState<KpiMetricKey | null>(null);

  const planTiles = useMemo(() => {
    const fmtNum = (n: number) => n.toLocaleString('en-US');
    const fmtCur = (n: number | null) =>
      n === null || !Number.isFinite(n) ? '—' : formatUSD(n);
    const tiles: Array<{
      key: KpiMetricKey;
      label: string;
      actualDisplay: string;
      actualValue: number | null;
      planValue: number;
      cls: string;
      formatType: 'number' | 'currency';
    }> = [
      {
        key: 'fee_revenue',
        label: 'Fee Revenue',
        actualDisplay: fmtCur(kpi.feeRevenue),
        actualValue: kpi.feeRevenue,
        planValue: Number(kpi.plans.fee_revenue?.plan_value ?? 0),
        cls: 'db-am',
        formatType: 'currency',
      },
    ];
    return tiles;
  }, [kpi]);

  // "Active Deals / Deals in Diligence / Dollars in Diligence" tiles —
  // migrated out of the retired Deals-page widget strip and rendered here
  // in the dashboard modal with the compact centered design.
  const dealStatTiles = useMemo(() => {
    const ACTIVE_STAGES = new Set<string>([
      'final-credit-items',
      'client-strategy-review',
      'write-up-pending',
      'submitted-to-lenders',
      'lenders-in-review',
      'terms-issued',
    ]);
    const active = deals.filter(d => d.status !== 'archived' && ACTIVE_STAGES.has(d.stage as string));
    const inDil = deals.filter(d => d.stage === 'in-due-diligence');
    const dilSum = inDil.reduce((s, d) => s + (d.value || 0), 0);
    return [
      { key: 'active-deals', label: 'Active Deals', value: active.length.toLocaleString('en-US') },
      { key: 'deals-in-diligence', label: 'Deals in Diligence', value: inDil.length.toLocaleString('en-US') },
      { key: 'dollars-in-diligence', label: 'Dollars in Diligence', value: formatUSD(dilSum) },
    ];
  }, [deals]);

  const editingPlan = editingMetric
    ? planTiles.find(t => t.key === editingMetric)
    : null;

  const handleSort = useCallback((col: SortColumn) => {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return col;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  const handleClosingMonthChange = useCallback(async (dealId: string, value: string) => {
    const dateValue = value || null;
    try {
      // Update in Supabase directly
      const { error } = await supabase
        .from('deals')
        .update({ dashboard_closing_date: dateValue } as any)
        .eq('id', dealId);
      if (error) throw error;

      // Update local context
      updateDeal(dealId, { dashboardClosingDate: dateValue } as any);
    } catch (err) {
      console.error('Failed to save closing month:', err);
      toast.error('Failed to save closing month');
    }
  }, [updateDeal]);

  // Determine the current select value for a row
  const getSelectValue = useCallback((row: DashboardDealRow): string => {
    const effective = row._dashboardClosingDate || row._rawClosingDate || '';
    if (!effective) return '';
    // Check if it matches one of the options exactly
    const match = monthOptions.find(o => o.value === effective);
    if (match) return match.value;
    // Try matching by year-month
    const ym = effective.slice(0, 7);
    const ymMatch = monthOptions.find(o => o.value.slice(0, 7) === ym);
    if (ymMatch) return ymMatch.value;
    // Out-of-range: return the raw value (will show as current text)
    return effective;
  }, [monthOptions]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (donutRef.current) {
        donutChart.current?.destroy();
        // Pull donut accent colors from the shared chart palette tokens —
        // matches Insights dashboard semantics (positive · warning · destructive).
        const root = getComputedStyle(document.documentElement);
        const hsl = (token: string) => `hsl(${root.getPropertyValue(token).trim()})`;
        const onTrack = hsl('--chart-2');       // green / positive
        const atRisk  = hsl('--chart-3');       // amber / warning
        const offTrack = hsl('--destructive');  // red
        const isFee = statusMode === 'fee_revenue';
        const donutValues = isFee
          ? [metrics.onTrack.feeTotal / 1000, metrics.atRisk.feeTotal / 1000, metrics.offTrack.feeTotal / 1000]
          : metrics.donutData;
        const tooltipFmt = isFee
          ? (v: number) => ' $' + Math.round(v) + 'K'
          : (v: number) => ' $' + v.toFixed(1) + 'MM';
        donutChart.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['On Track', 'At Risk', 'Off Track'],
            datasets: [{
              data: donutValues,
              backgroundColor: [onTrack, atRisk, offTrack],
              borderColor: [onTrack, atRisk, offTrack],
              borderWidth: 1,
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
              legend: { display: true, position: 'bottom', labels: { color: hsl('--muted-foreground'), font: { size: 10 }, padding: 14, boxWidth: 10, boxHeight: 10 } },
              tooltip: { callbacks: { label: (ctx: any) => tooltipFmt(ctx.parsed) } }
            }
          }
        });
      }
      if (barRef.current) {
        barChart.current?.destroy();
        const root = getComputedStyle(document.documentElement);
        const hsl = (token: string) => `hsl(${root.getPropertyValue(token).trim()})`;
        const muted = hsl('--muted-foreground');
        const gx = { ticks: { color: muted, font: { size: 9 } }, grid: { display: false }, border: { display: false } };
        const gy = { ticks: { color: muted, font: { size: 9 }, callback: (v: any) => '$' + v + 'K' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } };
        const makeGradient = (top: string, bottom: string) => (ctx: any) => {
          const chart = ctx.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return top;
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, top);
          g.addColorStop(1, bottom);
          return g;
        };
        barChart.current = new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: metrics.months,
            datasets: [
              {
                label: 'Revenue',
                data: metrics.monthlyRevenue,
                backgroundColor: makeGradient('rgba(120,185,235,0.95)', 'rgba(50,110,170,0.55)'),
                borderColor: 'rgba(160,210,245,0.55)',
                borderWidth: 1,
                borderRadius: 2,
                stack: 'rev',
              },
              {
                label: 'Profit',
                data: metrics.monthlyProfit,
                backgroundColor: makeGradient('rgba(80,230,160,0.95)', 'rgba(30,150,100,0.55)'),
                borderColor: 'rgba(130,240,190,0.55)',
                borderWidth: 1,
                borderRadius: 2,
                stack: 'cp',
              },
              {
                label: 'Commissions',
                data: metrics.monthlyCommissions,
                backgroundColor: makeGradient('rgba(245,110,125,0.95)', 'rgba(170,40,55,0.55)'),
                borderColor: 'rgba(250,160,170,0.55)',
                borderWidth: 1,
                borderRadius: 2,
                stack: 'cp',
              },
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' $' + ctx.parsed.y + 'K' } } },
            scales: { x: { ...gx, stacked: true } as any, y: { ...gy, stacked: true } as any }
          }
        });
      }
    }, 100);
    return () => {
      clearTimeout(t);
      donutChart.current?.destroy();
      barChart.current?.destroy();
      donutChart.current = null;
      barChart.current = null;
    };
  }, [open, metrics, statusMode]);

  const sortArrow = (col: SortColumn) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const body = (
    <>
      <div className="db-root flex flex-col flex-1 min-h-0 min-w-0 max-w-full overflow-hidden" style={{ borderRadius: 'inherit', boxSizing: 'border-box' }}>
          <style dangerouslySetInnerHTML={{ __html: DASHBOARD_CSS }} />
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'dashboard' | 'analytics' | 'performance' | 'queue' | 'tasks')}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-5 pt-2 pb-1 shrink-0">
              <TabsList>
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Analytics
                </TabsTrigger>
                {canSeePerformance && (
                  <TabsTrigger value="performance" className="gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    Performance
                  </TabsTrigger>
                )}
                {queueEnabled && (
                  <TabsTrigger value="queue" className="gap-1.5">
                    <Inbox className="h-3.5 w-3.5" />
                    Approval Queue
                  </TabsTrigger>
                )}
                <TabsTrigger value="tasks" className="gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Tasks
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="dashboard"
              forceMount
              className="db-tab-panel flex-1 min-h-0 min-w-0 mt-0 overflow-x-hidden overflow-y-auto data-[state=inactive]:hidden bg-transparent"
            >
              <div className="db-r min-w-0 max-w-full">
            {/* KPI STRIP */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 16, marginBottom: 16 }}>
              {dealStatTiles.map((t) => (
                <div
                  key={t.key}
                  className="glass-module p-4 flex flex-col items-center justify-center text-center"
                >
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    {t.label}
                  </div>
                  <div className="text-2xl font-bold text-foreground mt-2 db-bl">
                    {t.value}
                  </div>
                </div>
              ))}
              {planTiles.map((t) => {
                const planSet = t.planValue > 0;
                const actual = t.actualValue ?? 0;
                const pct = planSet ? Math.round((actual / t.planValue) * 100) : null;
                const planDisplay =
                  t.formatType === 'currency' ? formatUSD(t.planValue) : t.planValue.toLocaleString('en-US');
                const subColor =
                  pct === null
                    ? 'text-muted-foreground'
                    : pct >= 100
                      ? 'text-emerald-400'
                      : pct >= 75
                        ? 'text-amber-400'
                        : 'text-muted-foreground';
                return (
                  <div key={t.key} className="glass-module p-4 group relative">
                    {isPlanAdmin && (
                      <button
                        type="button"
                        onClick={() => setEditingMetric(t.key)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded"
                        aria-label={`Edit ${t.label} YTD KPI plan`}
                        title="Edit YTD KPI plan (separate from monthly Master Plan)"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <div className="text-sm text-muted-foreground">{t.label}</div>
                    <div className={`text-2xl font-bold text-foreground mt-1 ${t.cls}`}>
                      {kpi.isLoading ? '…' : t.actualDisplay}
                    </div>
                    <div className={`text-xs mt-1 ${subColor}`}>
                      {pct === null ? 'YTD plan not set' : `${pct}% of YTD Plan`}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      YTD Plan: {planSet ? planDisplay : '—'}
                    </div>
                  </div>
                );
              })}
              {/* Keep the secondary live tiles for context. */}
              <div className="glass-module p-4">
                <div className="text-sm text-muted-foreground">Deal Volume</div>
                <div className={`text-2xl font-bold text-foreground mt-1 db-bl`}>{metrics.totalVolume}</div>
                <div className="text-xs text-muted-foreground mt-1">{`${metrics.dealCount} active deals`}</div>
              </div>
              <div className="glass-module p-4">
                <div className="text-sm text-muted-foreground">Avg Deal Size</div>
                <div className={`text-2xl font-bold text-foreground mt-1 db-bl`}>{metrics.avgDealSize}</div>
                <div className="text-xs text-muted-foreground mt-1">{`"Live" Rev: ${metrics.liveRevenue}`}</div>
              </div>
            </div>

            {/* ROW 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2.2fr)', gap: 16, marginBottom: 16 }}>
              {/* LEFT — combined "By Status" card (height matches Deal Pipeline) */}
              <div className="glass-module p-4 flex flex-col" style={{ height: '100%' }}>
                <div className="db-ct flex items-center justify-between gap-3">
                  <span>By Status</span>
                  <div className="flex items-center gap-1">
                    {([
                      { key: 'deal_volume', label: 'Deal Volume' },
                      { key: 'fee_revenue', label: 'Fee Revenue' },
                    ] as const).map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setStatusMode(t.key)}
                        className={
                          'px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide border transition-colors ' +
                          (statusMode === t.key
                            ? 'border-primary/50 bg-primary/15 text-primary'
                            : 'border-border/60 bg-background/40 text-foreground/80 hover:text-foreground')
                        }
                        aria-pressed={statusMode === t.key}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const isFee = statusMode === 'fee_revenue';
                  const tiles = [
                    { label: 'On Track',  value: isFee ? metrics.onTrack.feeTotalStr  : metrics.onTrack.volumeStr,  pillCls: 'db-pill db-pill-on',   valueCls: 'value-positive', sub: `${metrics.onTrack.count} deals${isFee ? '' : ` · ${metrics.onTrack.pct}`}` },
                    { label: 'At Risk',   value: isFee ? metrics.atRisk.feeTotalStr   : metrics.atRisk.volumeStr,   pillCls: 'db-pill db-pill-risk', valueCls: 'value-warning',  sub: `${metrics.atRisk.count} deals${isFee ? '' : ` · ${metrics.atRisk.pct}`}` },
                    { label: 'Off Track', value: isFee ? metrics.offTrack.feeTotalStr : metrics.offTrack.volumeStr, pillCls: 'db-pill db-pill-off',  valueCls: 'value-negative', sub: `${metrics.offTrack.count} deals${isFee ? '' : ` · ${metrics.offTrack.pct}`}` },
                  ];
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {tiles.map((s, i) => (
                        <div key={i} className="glass-module p-3 text-center">
                          <div className="mb-2 flex justify-center">
                            <span className={s.pillCls}>{s.label}</span>
                          </div>
                          <div className={`text-lg font-bold ${s.valueCls}`}>{s.value}</div>
                          <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="db-cw flex-1 min-h-[180px]"><canvas ref={donutRef} /></div>
              </div>

              {/* RIGHT: Deal Table */}
              <div className="glass-module p-4">
                <div className="db-ct flex items-center justify-between gap-3">
                  <span>Deal Pipeline</span>
                  <button
                    type="button"
                    onClick={() => setActiveDealsOnly(v => !v)}
                    className={
                      'px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide border transition-colors ' +
                      (activeDealsOnly
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border/60 bg-background/40 text-foreground/80 hover:text-foreground')
                    }
                    aria-pressed={activeDealsOnly}
                  >
                    Active Deals
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="db-tbl">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>#</th>
                        {TABLE_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            style={{ textAlign: col.align || 'right', cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort(col.key)}
                          >
                            {col.label}{sortArrow(col.key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <TooltipProvider delayDuration={150}>
                      {displayedRows.map((d, i) => {
                        const flags = rowFlags.get(d.dealId);
                        const hasOverdue = !!flags && flags.overdue.length > 0;
                        const approaching = !!flags && flags.approachingNoReview;
                        const behind = behindMap.get(d.dealId);
                        // Running-behind takes visual priority: red left border
                        // + subtle red row tint. Falls back to the existing
                        // overdue-milestone (red) / approaching-close (amber)
                        // left-border treatments.
                        const leftBorder = behind
                          ? '3px solid hsl(var(--destructive))'
                          : hasOverdue
                            ? '3px solid hsl(var(--destructive))'
                            : approaching
                              ? '3px solid hsl(var(--chart-3))'
                              : '3px solid transparent';
                        const rowBg = behind ? 'hsl(var(--destructive) / 0.08)' : undefined;
                        return (
                        <tr key={d.dealId} style={{ borderLeft: leftBorder, backgroundColor: rowBg }}>
                          <td style={{ color: 'rgba(130,165,190,0.5)' }}>{i + 1}</td>
                          <td style={{ color: d.nameColor }}>
                            <span className="inline-flex items-center gap-1.5">
                              {d.name}
                              {behind && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border border-destructive/50 bg-destructive/15 text-destructive">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      Behind
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{behind.reason}</TooltipContent>
                                </Tooltip>
                              )}
                              {approaching && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Closing within 30 days · no lender in In Review
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                          </td>
                          <td>{d.size}</td>
                          <td>{d.fee}</td>
                          <td>{d.gross}</td>
                          <td>{d.billed}</td>
                          <td>{d.referral}</td>
                          <td>{d.origination}</td>
                          <td>{d.assocDir}</td>
                          <td>{d.dirMd}</td>
                          <td className={d.profitCls}>{d.profit}</td>
                          <td style={{ color: 'rgba(130,165,190,0.5)' }}>
                            <span className="inline-flex items-center gap-1.5 justify-end w-full">
                              {hasOverdue && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {flags!.overdue.length} milestone{flags!.overdue.length === 1 ? '' : 's'} overdue — {flags!.overdue.join(', ')}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <span>{d.milestone}</span>
                            </span>
                          </td>
                          <td>
                            <select
                              className="db-closing-select"
                              value={getSelectValue(d)}
                              onChange={(e) => handleClosingMonthChange(d.dealId, e.target.value)}
                            >
                              <option value="">TBD</option>
                              {/* If existing value is out of range, show it as first option */}
                              {(() => {
                                const current = d._dashboardClosingDate || d._rawClosingDate;
                                if (current && !monthOptions.find(o => o.value.slice(0, 7) === current.slice(0, 7))) {
                                  let label = 'TBD';
                                  try { label = new Date(current).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { /* */ }
                                  return <option value={current}>{label}</option>;
                                }
                                return null;
                              })()}
                              {monthOptions.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                        );
                      })}
                      </TooltipProvider>
                      {displayedRows.length === 0 && (
                        <tr><td colSpan={13} style={{ textAlign: 'center', color: 'rgba(130,165,190,0.4)', padding: 20 }}>No active deals in pipeline</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Monthly Revenue Forecast */}
                <div className="db-ttm-box" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.9px', textTransform: 'uppercase', color: 'rgba(120,160,190,0.38)', marginBottom: 8 }}>Monthly Revenue Forecast</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 6, marginBottom: 8 }}>
                    {metrics.months.map(m => (
                      <div key={m} style={{ fontSize: 9, color: 'rgba(140,175,200,0.35)', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{m}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 6, marginBottom: 4 }}>
                    {metrics.forecast.map((f, i) => (
                      <div key={i} style={{ background: '#182535', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'rgba(140,175,200,0.4)', marginBottom: 2 }}>Revenue</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: f.revColor }}>{f.rev}</div>
                        <div style={{ fontSize: 9, color: f.commColor, marginTop: 1 }}>(Comm: {f.comm})</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: f.profColor, marginTop: 2 }}>{f.prof}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 9, color: 'rgba(140,175,200,0.4)' }}>
                    {[['#e8f4ff', 'Revenue'], ['#ff8a96', 'Commissions'], ['#3de89a', 'Profit']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, background: c, borderRadius: 2, display: 'inline-block' }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ROW 2: Bar chart */}
            <div className="glass-module p-4">
              <div className="db-ct">Revenue · Commissions · Profit — Monthly</div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 6, fontSize: 9, color: 'rgba(140,175,200,0.55)' }}>
                {[['rgba(80,155,210,0.8)', 'Revenue'], ['rgba(220,70,85,0.75)', 'Commissions'], ['rgba(40,200,130,0.8)', 'Profit']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 3, background: c, display: 'inline-block', borderRadius: 2 }} />{l}
                  </span>
                ))}
              </div>
              <div className="db-cw" style={{ height: 200 }}><canvas ref={barRef} /></div>
            </div>
              </div>
            </TabsContent>

            <TabsContent
              value="analytics"
              className="db-tab-panel flex-1 min-h-0 min-w-0 mt-0 overflow-x-hidden overflow-y-auto data-[state=inactive]:hidden bg-transparent"
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Loading Analytics…
                  </div>
                }
              >
                <div className="db-analytics-host min-w-0 max-w-full">
                  <AnalyticsTabContent />
                </div>
              </Suspense>
            </TabsContent>

            {canSeePerformance && (
              <TabsContent
                value="performance"
                className="db-tab-panel flex-1 min-h-0 min-w-0 mt-0 overflow-x-hidden overflow-y-auto data-[state=inactive]:hidden bg-transparent"
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      Loading Performance…
                    </div>
                  }
                >
                  <div className="db-r min-w-0 max-w-full">
                    <NikiPerformanceTab />
                  </div>
                </Suspense>
              </TabsContent>
            )}
            {queueEnabled && (
              <TabsContent
                value="queue"
                className="db-tab-panel flex-1 min-h-0 min-w-0 mt-0 overflow-hidden data-[state=inactive]:hidden bg-transparent flex flex-col"
              >
                <ActionQueuePanel items={queueItems} onClose={() => setActiveTab('dashboard')} />
              </TabsContent>
            )}
            <TabsContent
              value="tasks"
              className="db-tab-panel flex-1 min-h-0 min-w-0 mt-0 overflow-hidden data-[state=inactive]:hidden bg-transparent flex flex-col"
            >
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    Loading tasks…
                  </div>
                }
              >
                <TasksTabContent overlayMode />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      {editingPlan && (
        <KpiPlanEditDialog
          open={!!editingMetric}
          onOpenChange={(o) => !o && setEditingMetric(null)}
          plan={kpi.plans[editingPlan.key]}
          metricKey={editingPlan.key}
          label={editingPlan.label}
          formatType={editingPlan.formatType}
          onSaved={() => kpi.refetchPlans()}
        />
      )}
    </>
  );

  if (embedded) return body;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="popup-shell-surface p-0 gap-0 flex flex-col border-transparent glass-border-soft shadow-2xl shadow-black/20 h-[92vh] sm:h-[92vh] w-[94vw] max-w-none sm:max-w-none max-h-none min-h-0 overflow-hidden box-border"
        style={{ width: '94vw' }}
        overlayClassName="bg-black/80"
        aria-label="Deal Pipeline"
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}

export default DashboardModal;

const DASHBOARD_CSS = `
/* Let the shared .popup-shell-surface background show through. */
.db-root { background: transparent; }
.db-root .db-tab-panel { background: transparent; }
/* Strip any opaque page-level background from the embedded Analytics page
   so the shared Deal-style modal surface is what users actually see. */
.db-root .db-analytics-host > .bg-background,
.db-root .db-analytics-host .bg-background { background-color: transparent !important; }
/* Top padding bumped to 24px so the KPI strip sits inside the Insights spacing
   scale (p-6) and clears the floating close (×) button. */
.db-r { background: transparent; padding: 24px 20px 20px; color: hsl(var(--foreground)); font-family: system-ui, sans-serif; min-width: 0; max-width: 100%; box-sizing: border-box; }
.db-root, .db-root * { box-sizing: border-box; }
.db-root img, .db-root svg, .db-root canvas, .db-root video { max-width: 100%; height: auto; }
.db-root pre, .db-root code { white-space: pre-wrap; word-break: break-word; }
.db-root .db-analytics-host { width: 100%; max-width: 100%; min-width: 0; }
.db-ct { font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
.db-up { color: hsl(var(--chart-2)); }
.db-dn { color: hsl(var(--destructive)); }
.db-am { color: hsl(var(--chart-3)); }
.db-bl { color: hsl(var(--chart-1)); }
.db-sep { height: 1px; background: rgba(255,255,255,0.06); margin: 8px 0; }
.db-pill { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; }
.db-pill-on { background: hsl(var(--chart-2) / 0.15); color: hsl(var(--chart-2)); border: 1px solid hsl(var(--chart-2) / 0.25); }
.db-pill-risk { background: hsl(var(--chart-3) / 0.15); color: hsl(var(--chart-3)); border: 1px solid hsl(var(--chart-3) / 0.25); }
.db-pill-off { background: hsl(var(--destructive) / 0.15); color: hsl(var(--destructive)); border: 1px solid hsl(var(--destructive) / 0.25); }
.db-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
.db-tbl th { color: hsl(var(--muted-foreground)); font-weight: 700; text-align: right; padding: 6px 8px; border-bottom: 1px solid hsl(var(--border)); font-size: 9px; letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
.db-tbl th:first-child, .db-tbl th:nth-child(2), .db-tbl th:nth-child(3) { text-align: left; }
.db-tbl th:hover { color: hsl(var(--foreground)); }
.db-tbl td { text-align: right; padding: 6px 8px; border-bottom: 1px solid hsl(var(--border) / 0.5); color: hsl(var(--foreground) / 0.85); font-size: 11px; white-space: nowrap; }
.db-tbl td:first-child { text-align: left; font-weight: 600; color: hsl(var(--foreground)); }
.db-tbl td:nth-child(2) { text-align: left; color: hsl(var(--muted-foreground)); }
.db-tbl td:nth-child(3) { text-align: left; color: hsl(var(--muted-foreground)); }
.db-tbl tr:last-child td { border-bottom: none; }
.db-tbl tr:hover td { background: hsl(var(--muted) / 0.4); }
.db-ttm-box { background: hsl(var(--muted) / 0.3); border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 8px 12px; margin-top: 8px; }
.db-cw { position: relative; width: 100%; }
.db-stat-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid hsl(var(--border) / 0.5); font-size: 11px; }
.db-stat-row:last-child { border-bottom: none; }
.db-sn { color: hsl(var(--muted-foreground)); }
.db-sv { font-weight: 500; color: hsl(var(--foreground)); }
.db-comm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.db-comm-item { background: hsl(var(--muted) / 0.3); border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 7px 10px; }
.db-comm-label { font-size: 9px; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.db-comm-val { font-size: 13px; font-weight: 700; color: hsl(var(--foreground)); }
.db-closing-select {
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 4px;
  cursor: pointer;
  outline: none;
  min-width: 80px;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='rgba(140,175,200,0.4)'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
  padding-right: 14px;
}
.db-closing-select:hover { border-color: hsl(var(--border)); }
.db-closing-select:focus { border-color: hsl(var(--ring)); }
.db-closing-select option { background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); }
`;
