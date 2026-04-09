import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Chart, registerables } from 'chart.js';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import {
  mapDealToDashboardRow,
  buildDashboardMetrics,
  filterDashboardDeals,
  sortDashboardRows,
  type SortColumn,
  type SortDir,
} from './dashboardDataMapper';

Chart.register(...registerables);

interface DashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function DashboardModal({ open, onOpenChange }: DashboardModalProps) {
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);

  const [sortCol, setSortCol] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { deals } = useDealsContext();
  const { pipelines } = usePipelineContext();

  // Filter to active pipeline deals, then exclude on-hold + test/example
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

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (donutRef.current) {
        donutChart.current?.destroy();
        donutChart.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['On Track', 'At Risk', 'Off Track'],
            datasets: [{
              data: metrics.donutData,
              backgroundColor: ['rgba(40,200,130,0.75)', 'rgba(220,175,40,0.75)', 'rgba(220,70,85,0.5)'],
              borderColor: ['rgba(40,220,140,0.9)', 'rgba(240,200,50,0.9)', 'rgba(255,100,115,0.6)'],
              borderWidth: 2,
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
              legend: { display: true, position: 'bottom', labels: { color: 'rgba(160,200,220,0.6)', font: { size: 10 }, padding: 14, boxWidth: 10, boxHeight: 10 } },
              tooltip: { callbacks: { label: (ctx: any) => ' $' + ctx.parsed.toFixed(1) + 'MM' } }
            }
          }
        });
      }
      if (barRef.current) {
        barChart.current?.destroy();
        const gx = { ticks: { color: 'rgba(130,165,190,0.5)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
        const gy = { ticks: { color: 'rgba(130,165,190,0.4)', font: { size: 9 }, callback: (v: any) => '$' + v + 'K' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } };
        barChart.current = new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: metrics.months,
            datasets: [
              { label: 'Revenue', data: metrics.monthlyRevenue, backgroundColor: 'rgba(50,120,190,0.45)', borderColor: 'rgba(80,155,210,0.8)', borderWidth: 1, borderRadius: 4 },
              { label: 'Commissions', data: metrics.monthlyCommissions, backgroundColor: 'rgba(210,60,75,0.4)', borderColor: 'rgba(220,70,85,0.75)', borderWidth: 1, borderRadius: 4 },
              { label: 'Profit', data: metrics.monthlyProfit, backgroundColor: 'rgba(30,160,100,0.45)', borderColor: 'rgba(40,200,130,0.8)', borderWidth: 1, borderRadius: 4 }
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
        className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 border-none bg-transparent overflow-hidden"
        overlayClassName="bg-black/80"
      >
        <div className="db-root" style={{ overflow: 'auto', height: '100%', borderRadius: 'inherit' }}>
          <style dangerouslySetInnerHTML={{ __html: DASHBOARD_CSS }} />
          <div className="db-r">
            {/* HEADER */}
            <div className="db-g db-p" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, background: '#1a2d42', borderColor: 'rgba(255,255,255,0.09)' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#e8f4ff', letterSpacing: '-.3px' }}>5th<span style={{ color: '#5ba3d0' }}>Line</span> Capital Advisors — Deal Pipeline</div>
                <div style={{ fontSize: 9, color: 'rgba(140,175,200,0.4)', marginTop: 2, fontStyle: 'italic' }}>Goals &amp; Targets 2025 &nbsp;·&nbsp; Current Pipeline Summary</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="db-pill db-pill-on">On Track</span>
                <span className="db-pill db-pill-risk">At Risk</span>
                <span className="db-pill db-pill-off">Off Track</span>
              </div>
            </div>

            {/* KPI STRIP */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'Deals Closed', value: String(metrics.dealCount), cls: 'db-bl', sub: 'Target: 2025 goal' },
                { label: 'Dollars Funded', value: metrics.totalVolume, cls: 'db-up', sub: 'On Track' },
                { label: 'New Clients', value: String(metrics.dealCount), cls: 'db-bl', sub: '2025 target' },
                { label: 'Fee Revenue', value: metrics.grossRevenue, cls: 'db-am', sub: `${metrics.dealCount} deals` },
                { label: 'Deal Volume', value: metrics.totalVolume, cls: 'db-bl', sub: `${metrics.dealCount} active deals` },
                { label: 'Avg Deal Size', value: metrics.avgDealSize, cls: 'db-bl', sub: `"Live" Rev: ${metrics.liveRevenue}` },
              ].map((k, i) => (
                <div key={i} className="db-g db-p" style={{ padding: '12px 14px' }}>
                  <div className="db-kl">{k.label}</div>
                  <div className={`db-kv ${k.cls}`}>{k.value}</div>
                  <div className="db-kd">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ROW 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2.2fr)', gap: 10, marginBottom: 10 }}>
              {/* LEFT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Pipeline Summary */}
                <div className="db-g db-p">
                  <div className="db-ct">Pipeline Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    {[
                      { label: 'On Track', value: metrics.onTrack.volumeStr, color: '#4de8a0', borderColor: 'rgba(40,190,120,0.2)', labelColor: 'rgba(40,220,140,0.5)', sub: `${metrics.onTrack.count} deals · ${metrics.onTrack.pct}`, subColor: 'rgba(160,210,180,0.5)' },
                      { label: 'At Risk', value: metrics.atRisk.volumeStr, color: '#f0c84a', borderColor: 'rgba(220,175,40,0.2)', labelColor: 'rgba(220,175,40,0.5)', sub: `${metrics.atRisk.count} deals · ${metrics.atRisk.pct}`, subColor: 'rgba(220,190,100,0.5)' },
                      { label: 'Off Track', value: metrics.offTrack.volumeStr, color: '#ff8a96', borderColor: 'rgba(220,70,85,0.2)', labelColor: 'rgba(220,70,85,0.5)', sub: `${metrics.offTrack.count} deals · ${metrics.offTrack.pct}`, subColor: 'rgba(220,120,130,0.5)' },
                    ].map((s, i) => (
                      <div key={i} style={{ background: '#0f1923', border: `1px solid ${s.borderColor}`, borderRadius: 8, padding: 10, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: s.labelColor, fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: s.subColor, marginTop: 2 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div className="db-cw" style={{ height: 180 }}><canvas ref={donutRef} /></div>
                </div>

                {/* Revenue Totals */}
                <div className="db-g db-p">
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
                  <div className="db-sep" />
                  <div className="db-ct" style={{ marginTop: 4 }}>Commission Rates</div>
                  <div className="db-comm-grid">
                    {[['Referral', '10.0%'], ['Origination', '2.5%'], ['Assoc. Director', '3.5%'], ['Director / MD', '5.0%']].map(([l, v], i) => (
                      <div key={i} className="db-comm-item"><div className="db-comm-label">{l}</div><div className="db-comm-val">{v}</div></div>
                    ))}
                  </div>
                </div>

                {/* Fee Revenue by Status */}
                <div className="db-g db-p">
                  <div className="db-ct">Fee Revenue by Status</div>
                  <div className="db-stat-row"><span className="db-sn">On Track</span><span className="db-sv db-up">{metrics.onTrack.feeTotalStr} <span style={{ fontSize: 10, opacity: 0.6 }}>· {metrics.onTrack.count} deals</span></span></div>
                  <div className="db-stat-row"><span className="db-sn">At Risk</span><span className="db-sv db-am">{metrics.atRisk.feeTotalStr} <span style={{ fontSize: 10, opacity: 0.6 }}>· {metrics.atRisk.count} deals</span></span></div>
                  <div className="db-stat-row"><span className="db-sn">Off Track</span><span className="db-sv" style={{ color: 'rgba(160,190,210,0.35)' }}>{metrics.offTrack.feeTotalStr} <span style={{ fontSize: 10, opacity: 0.6 }}>· {metrics.offTrack.count} deals</span></span></div>
                </div>
              </div>

              {/* RIGHT: Deal Table */}
              <div className="db-g db-p">
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
                        <tr key={i}>
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
                          <td><span className={`db-pill ${d.closingPill}`} style={{ fontSize: 9 }}>{d.closing}</span></td>
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
            <div className="db-g db-p">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DASHBOARD_CSS = `
.db-root { background: #0f1923; }
.db-r { background: #0f1923; padding: 14px; color: #d0dce8; font-family: system-ui, sans-serif; min-width: 860px; }
.db-g { background: #182535; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; position: relative; overflow: hidden; }
.db-g::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(120,190,255,0.15), transparent); pointer-events: none; }
.db-p { padding: 12px 14px; }
.db-ct { font-size: 9px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: rgba(160,190,210,0.45); margin-bottom: 8px; }
.db-up { color: #3de89a; }
.db-dn { color: #ff6b7a; }
.db-am { color: #ffc53d; }
.db-bl { color: #5ba3d0; }
.db-sep { height: 1px; background: rgba(255,255,255,0.06); margin: 8px 0; }
.db-kl { font-size: 9px; color: rgba(140,175,200,0.5); font-weight: 600; letter-spacing: .5px; text-transform: uppercase; }
.db-kv { font-size: 22px; font-weight: 700; color: #e8f4ff; line-height: 1.1; margin: 4px 0 2px; }
.db-kd { font-size: 10px; color: rgba(160,190,210,0.4); }
.db-pill { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
.db-pill-on { background: rgba(40,190,120,0.15); color: #4de8a0; border: 1px solid rgba(40,190,120,0.25); }
.db-pill-risk { background: rgba(220,170,40,0.15); color: #f0c84a; border: 1px solid rgba(220,175,40,0.25); }
.db-pill-off { background: rgba(220,70,85,0.15); color: #ff8a96; border: 1px solid rgba(220,70,85,0.25); }
.db-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
.db-tbl th { color: rgba(140,175,200,0.45); font-weight: 700; text-align: right; padding: 5px 7px; border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 9px; letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
.db-tbl th:first-child, .db-tbl th:nth-child(2), .db-tbl th:nth-child(3) { text-align: left; }
.db-tbl th:hover { color: rgba(200,225,240,0.7); }
.db-tbl td { text-align: right; padding: 5px 7px; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(190,215,230,0.7); font-size: 11px; white-space: nowrap; }
.db-tbl td:first-child { text-align: left; font-weight: 600; color: #e8f4ff; }
.db-tbl td:nth-child(2) { text-align: left; color: rgba(130,165,190,0.6); }
.db-tbl td:nth-child(3) { text-align: left; color: rgba(130,165,190,0.6); }
.db-tbl tr:last-child td { border-bottom: none; }
.db-tbl tr:hover td { background: rgba(255,255,255,0.02); }
.db-ttm-box { background: #0f1923; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 12px; margin-top: 8px; }
.db-cw { position: relative; width: 100%; }
.db-stat-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 11px; }
.db-stat-row:last-child { border-bottom: none; }
.db-sn { color: rgba(130,165,190,0.55); }
.db-sv { font-weight: 500; color: #d0e8f8; }
.db-comm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
.db-comm-item { background: #0f1923; border: 1px solid rgba(255,255,255,0.05); border-radius: 7px; padding: 7px 10px; }
.db-comm-label { font-size: 9px; color: rgba(130,165,190,0.45); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.db-comm-val { font-size: 13px; font-weight: 700; color: #e8f4ff; }
`;
