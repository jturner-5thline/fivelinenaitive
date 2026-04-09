import { useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface DashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DashboardModal({ open, onOpenChange }: DashboardModalProps) {
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutChart = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      // Donut
      if (donutRef.current) {
        donutChart.current?.destroy();
        donutChart.current = new Chart(donutRef.current, {
          type: 'doughnut',
          data: {
            labels: ['On Track', 'At Risk', 'Off Track'],
            datasets: [{
              data: [56.8, 123.5, 0.01],
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
      // Bar
      if (barRef.current) {
        barChart.current?.destroy();
        const months = ['Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026'];
        const revenue = [181, 28, 0, 0, 40, 0];
        const commissions = [18, 4, 0, 0, 0, 0];
        const profit = [162, 24, 0, 0, 40, 0];
        const gx = { ticks: { color: 'rgba(130,165,190,0.5)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
        const gy = { ticks: { color: 'rgba(130,165,190,0.4)', font: { size: 9 }, callback: (v: any) => '$' + v + 'K' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } };
        barChart.current = new Chart(barRef.current, {
          type: 'bar',
          data: {
            labels: months,
            datasets: [
              { label: 'Revenue', data: revenue, backgroundColor: 'rgba(50,120,190,0.45)', borderColor: 'rgba(80,155,210,0.8)', borderWidth: 1, borderRadius: 4 },
              { label: 'Commissions', data: commissions, backgroundColor: 'rgba(210,60,75,0.4)', borderColor: 'rgba(220,70,85,0.75)', borderWidth: 1, borderRadius: 4 },
              { label: 'Profit', data: profit, backgroundColor: 'rgba(30,160,100,0.45)', borderColor: 'rgba(40,200,130,0.8)', borderWidth: 1, borderRadius: 4 }
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
  }, [open]);

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
                { label: 'Deals Closed', value: '6', cls: 'db-bl', sub: 'Target: 2025 goal' },
                { label: 'Dollars Funded', value: '$75.5MM', cls: 'db-up', sub: 'On Track' },
                { label: 'New Clients', value: '26', cls: 'db-bl', sub: '2025 target' },
                { label: 'Fee Revenue', value: '$3.3MM', cls: 'db-am', sub: '9 deals' },
                { label: 'Deal Volume', value: '$180.3MM', cls: 'db-bl', sub: '11 active deals' },
                { label: 'Avg Deal Size', value: '$11.8MM', cls: 'db-bl', sub: '"Live" Rev: $293K' },
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
                      { label: 'On Track', value: '$56.8MM', color: '#4de8a0', borderColor: 'rgba(40,190,120,0.2)', labelColor: 'rgba(40,220,140,0.5)', sub: '3 deals · 32%', subColor: 'rgba(160,210,180,0.5)' },
                      { label: 'At Risk', value: '$123.5MM', color: '#f0c84a', borderColor: 'rgba(220,175,40,0.2)', labelColor: 'rgba(220,175,40,0.5)', sub: '9 deals · 68%', subColor: 'rgba(220,190,100,0.5)' },
                      { label: 'Off Track', value: '$0.0MM', color: '#ff8a96', borderColor: 'rgba(220,70,85,0.2)', labelColor: 'rgba(220,70,85,0.5)', sub: '0 deals · 0%', subColor: 'rgba(220,120,130,0.5)' },
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
                    ['Total Pipeline', '$2.5MM', 'db-bl'],
                    ['Gross Revenue', '$365K', ''],
                    ['Billed @ Close', '$248K', ''],
                    ['Referral Comm.', '$12K', ''],
                    ['"Live" Revenue', '$293K', 'db-up'],
                    ['Total Profit', '$344K', ''],
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
                  <div className="db-stat-row"><span className="db-sn">On Track</span><span className="db-sv db-up">$1,081K <span style={{ fontSize: 10, opacity: 0.6 }}>· 2 deals</span></span></div>
                  <div className="db-stat-row"><span className="db-sn">At Risk</span><span className="db-sv db-am">$2,263K <span style={{ fontSize: 10, opacity: 0.6 }}>· 7 deals</span></span></div>
                  <div className="db-stat-row"><span className="db-sn">Off Track</span><span className="db-sv" style={{ color: 'rgba(160,190,210,0.35)' }}>$0K <span style={{ fontSize: 10, opacity: 0.6 }}>· 0 deals</span></span></div>
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
                        <th style={{ textAlign: 'left' }}>Deal Name</th>
                        <th style={{ textAlign: 'left' }}>Size</th>
                        <th>Fee</th>
                        <th>Gross</th>
                        <th>Billed @ Close</th>
                        <th>Referral</th>
                        <th>Origination</th>
                        <th>Assoc. Dir.</th>
                        <th>Director/MD</th>
                        <th>Profit</th>
                        <th>Milestone</th>
                        <th>Closing Mo.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEALS.map((d, i) => (
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
                    </tbody>
                  </table>
                </div>

                {/* Monthly Revenue Forecast */}
                <div className="db-ttm-box" style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.9px', textTransform: 'uppercase', color: 'rgba(120,160,190,0.38)', marginBottom: 8 }}>Monthly Revenue Forecast</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 6, marginBottom: 8 }}>
                    {['Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026'].map(m => (
                      <div key={m} style={{ fontSize: 9, color: 'rgba(140,175,200,0.35)', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{m}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 6, marginBottom: 4 }}>
                    {FORECAST.map((f, i) => (
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

const DEALS = [
  { name: 'TNT', nameColor: '#4de8a0', size: '$9.00MM', fee: '1.00%', gross: '$90.0K', billed: '$90.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$9.0K', profit: '$81.0K', profitCls: 'db-up', milestone: 'Sep 2025', closing: 'Mar 2026', closingPill: 'db-pill-on' },
  { name: 'Infillion', nameColor: '#f0c84a', size: '$50.00MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Back Bar Project', nameColor: '#4de8a0', size: '$6.00MM', fee: '1.50%', gross: '$90.0K', billed: '$40.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$1.0K', dirMd: '$0.0K', profit: '$90.0K', profitCls: 'db-up', milestone: '—', closing: 'Jul 2026', closingPill: 'db-pill-on' },
  { name: 'OpConnect', nameColor: '#4de8a0', size: '$5.00MM', fee: '3.00%', gross: '$150.0K', billed: '$90.5K', referral: '$9.1K', origination: '$0.0K', assocDir: '$2.3K', dirMd: '$0.0K', profit: '$141.0K', profitCls: 'db-up', milestone: 'Nov 2025', closing: 'Mar 2026', closingPill: 'db-pill-on' },
  { name: 'Athyna', nameColor: '#f0c84a', size: '$1.00MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Arbolus', nameColor: '#f0c84a', size: '$10.00MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Upflex', nameColor: '#f0c84a', size: '$2.50MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Canela', nameColor: '#f0c84a', size: '$10.00MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Xnergy', nameColor: '#f0c84a', size: '$20.00MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Worthy', nameColor: '#f0c84a', size: '$15.00MM', fee: '2.00%', gross: '$0.0K', billed: '$0.0K', referral: '$0.0K', origination: '$0.0K', assocDir: '$0.0K', dirMd: '$0.0K', profit: '—', profitCls: '', milestone: '—', closing: 'TBD', closingPill: 'db-pill-risk' },
  { name: 'Concierge Plus', nameColor: '#4de8a0', size: '$1.75MM', fee: '2.00%', gross: '$35.0K', billed: '$27.5K', referral: '$2.8K', origination: '$0.0K', assocDir: '$1.0K', dirMd: '$0.0K', profit: '$32.2K', profitCls: 'db-up', milestone: '—', closing: 'Apr 2026', closingPill: 'db-pill-on' },
];

const FORECAST = [
  { rev: '$181K', revColor: '#e8f4ff', comm: '$18K', commColor: 'rgba(220,70,85,0.7)', prof: '$162K', profColor: '#3de89a' },
  { rev: '$28K', revColor: '#e8f4ff', comm: '$4K', commColor: 'rgba(220,70,85,0.7)', prof: '$24K', profColor: '#3de89a' },
  { rev: '$0K', revColor: 'rgba(160,190,210,0.35)', comm: '$0K', commColor: 'rgba(160,190,210,0.25)', prof: '$0K', profColor: 'rgba(160,190,210,0.3)' },
  { rev: '$0K', revColor: 'rgba(160,190,210,0.35)', comm: '$0K', commColor: 'rgba(160,190,210,0.25)', prof: '$0K', profColor: 'rgba(160,190,210,0.3)' },
  { rev: '$40K', revColor: '#e8f4ff', comm: '$0K', commColor: 'rgba(220,70,85,0.7)', prof: '$40K', profColor: '#3de89a' },
  { rev: '$0K', revColor: 'rgba(160,190,210,0.35)', comm: '$0K', commColor: 'rgba(160,190,210,0.25)', prof: '$0K', profColor: 'rgba(160,190,210,0.3)' },
];

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
