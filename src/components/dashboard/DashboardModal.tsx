import { useEffect, useRef, useMemo, useState, useCallback, lazy, Suspense } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LayoutDashboard, BarChart3 } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface DashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to land on when the modal opens. Defaults to 'dashboard'. */
  initialTab?: 'dashboard' | 'analytics';
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

export function DashboardModal({ open, onOpenChange, initialTab = 'dashboard' }: DashboardModalProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics'>(initialTab);
  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);

  const [sortCol, setSortCol] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { deals, updateDeal } = useDealsContext();
  const { pipelines } = usePipelineContext();

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
        donutChart.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['On Track', 'At Risk', 'Off Track'],
            datasets: [{
              data: metrics.donutData,
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
              tooltip: { callbacks: { label: (ctx: any) => ' $' + ctx.parsed.toFixed(1) + 'MM' } }
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
        barChart.current = new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: metrics.months,
            datasets: [
              { label: 'Revenue', data: metrics.monthlyRevenue, backgroundColor: hsl('--chart-1'), borderColor: hsl('--chart-1'), borderWidth: 1, borderRadius: 4 },
              { label: 'Commissions', data: metrics.monthlyCommissions, backgroundColor: hsl('--destructive'), borderColor: hsl('--destructive'), borderWidth: 1, borderRadius: 4 },
              { label: 'Profit', data: metrics.monthlyProfit, backgroundColor: hsl('--chart-2'), borderColor: hsl('--chart-2'), borderWidth: 1, borderRadius: 4 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' $' + ctx.parsed.y + 'K' } } },
            scales: { x: gx as any, y: gy as any }
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
  }, [open, metrics]);

  const sortArrow = (col: SortColumn) => {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="popup-shell-surface flex flex-col w-[min(1100px,calc(100vw-32px))] max-w-[min(1100px,calc(100vw-32px))] h-[calc(100vh-32px)] max-h-[calc(100vh-32px)] min-h-0 p-0 gap-0 overflow-hidden border-transparent box-border"
        overlayClassName="bg-black/80"
        aria-label="Deal Pipeline"
      >
        <div className="db-root flex flex-col flex-1 min-h-0 min-w-0 max-w-full overflow-hidden" style={{ borderRadius: 'inherit', boxSizing: 'border-box' }}>
          <style dangerouslySetInnerHTML={{ __html: DASHBOARD_CSS }} />
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'dashboard' | 'analytics')}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="px-5 pt-5 pb-2 shrink-0">
              <TabsList>
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Analytics
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
              {[
                { label: 'Deals Closed', value: String(metrics.dealCount), cls: 'db-bl', sub: 'Target: 2025 goal' },
                { label: 'Dollars Funded', value: metrics.totalVolume, cls: 'db-up', sub: 'On Track' },
                { label: 'New Clients', value: String(metrics.dealCount), cls: 'db-bl', sub: '2025 target' },
                { label: 'Fee Revenue', value: metrics.grossRevenue, cls: 'db-am', sub: `${metrics.dealCount} deals` },
                { label: 'Deal Volume', value: metrics.totalVolume, cls: 'db-bl', sub: `${metrics.dealCount} active deals` },
                { label: 'Avg Deal Size', value: metrics.avgDealSize, cls: 'db-bl', sub: `"Live" Rev: ${metrics.liveRevenue}` },
              ].map((k, i) => (
                <div key={i} className="glass-module p-4">
                  <div className="text-sm text-muted-foreground">{k.label}</div>
                  <div className={`text-2xl font-bold text-foreground mt-1 ${k.cls}`}>{k.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ROW 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2.2fr)', gap: 16, marginBottom: 16 }}>
              {/* LEFT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="glass-module p-4">
                  <div className="db-ct">Pipeline Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'On Track',  value: metrics.onTrack.volumeStr,  pillCls: 'db-pill db-pill-on',   valueCls: 'value-positive', sub: `${metrics.onTrack.count} deals · ${metrics.onTrack.pct}` },
                      { label: 'At Risk',   value: metrics.atRisk.volumeStr,   pillCls: 'db-pill db-pill-risk', valueCls: 'value-warning',  sub: `${metrics.atRisk.count} deals · ${metrics.atRisk.pct}` },
                      { label: 'Off Track', value: metrics.offTrack.volumeStr, pillCls: 'db-pill db-pill-off',  valueCls: 'value-negative', sub: `${metrics.offTrack.count} deals · ${metrics.offTrack.pct}` },
                    ].map((s, i) => (
                      <div key={i} className="glass-module p-3 text-center">
                        <div className="mb-2 flex justify-center">
                          <span className={s.pillCls}>{s.label}</span>
                        </div>
                        <div className={`text-lg font-bold ${s.valueCls}`}>{s.value}</div>
                        <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="db-cw" style={{ height: 180 }}><canvas ref={donutRef} /></div>
                </div>

                <div className="glass-module p-4">
                  <div className="db-ct">Revenue Totals</div>
                  {[
                    ['Total Pipeline', metrics.totalPipeline, 'db-bl'],
                    ['Gross Revenue', metrics.grossRevenue, ''],
                    ['Billed @ Close', metrics.billedAtClose, ''],
                    ['Referral Comm.', metrics.referralTotal, ''],
                    ['"Live" Revenue', metrics.liveRevenue, 'db-up'],
                    ['Total Profit', metrics.totalProfit, ''],
                  ].map(([n, v, c], i) => (
                    <div key={i} className="db-stat-row"><span className="db-sn">{n}</span><span className={`db-sv ${c}`}>{v}</span></div>
                  ))}
                </div>

                <div className="glass-module p-4">
                  <div className="db-ct">Fee Revenue by Status</div>
                  <div className="db-stat-row"><span className="db-sn">On Track</span><span className="db-sv value-positive">{metrics.onTrack.feeTotalStr} <span className="text-muted-foreground" style={{ fontSize: 10 }}>· {metrics.onTrack.count} deals</span></span></div>
                  <div className="db-stat-row"><span className="db-sn">At Risk</span><span className="db-sv value-warning">{metrics.atRisk.feeTotalStr} <span className="text-muted-foreground" style={{ fontSize: 10 }}>· {metrics.atRisk.count} deals</span></span></div>
                  <div className="db-stat-row"><span className="db-sn">Off Track</span><span className="db-sv text-muted-foreground">{metrics.offTrack.feeTotalStr} <span style={{ fontSize: 10 }}>· {metrics.offTrack.count} deals</span></span></div>
                </div>
              </div>

              {/* RIGHT: Deal Table */}
              <div className="glass-module p-4">
                <div className="db-ct">Deal Pipeline — Active Deals</div>
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
                      {sortedRows.map((d, i) => (
                        <tr key={d.dealId}>
                          <td style={{ color: 'rgba(130,165,190,0.5)' }}>{i + 1}</td>
                          <td style={{ color: d.nameColor }}>{d.name}</td>
                          <td>{d.size}</td>
                          <td>{d.fee}</td>
                          <td>{d.gross}</td>
                          <td>{d.billed}</td>
                          <td>{d.referral}</td>
                          <td>{d.origination}</td>
                          <td>{d.assocDir}</td>
                          <td>{d.dirMd}</td>
                          <td className={d.profitCls}>{d.profit}</td>
                          <td style={{ color: 'rgba(130,165,190,0.5)' }}>{d.milestone}</td>
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
                      ))}
                      {sortedRows.length === 0 && (
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
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
