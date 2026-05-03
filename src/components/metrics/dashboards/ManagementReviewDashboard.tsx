import { useEffect, useRef } from 'react';
import ChartJS from 'chart.js/auto';

// ── Chart.js global defaults (scoped to this dashboard) ──
const setChartDefaults = () => {
  ChartJS.defaults.color = 'rgba(120,180,240,0.5)';
  ChartJS.defaults.borderColor = 'rgba(40,100,180,0.2)';
  ChartJS.defaults.font.size = 9;
  ChartJS.defaults.font.family = 'system-ui, sans-serif';
};

// ── Static data ──
const mo = ['Dec-25', 'Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26', 'Jun-26'];
const rev = [153.7, 33.2, 62.0, 229.9, 185.4, 55.4, 269.7];
const liq = [227, 71, -59, 6, 69, 14, 103];
const dscr = [-2.88, -9.10, -8.79, -6.30, -3.44, -2.13, -1.32];
const ttm = [2.4, 1.7, 1.6, 1.7, 1.8, 1.8, 1.6];
const cfWks = ['Mar 13','Mar 20','Mar 27','Apr 03','Apr 10','Apr 17','Apr 24','May 01','May 08','May 15','May 22','May 29'];
const cfIn = [123.5,123.0,55.4,44.1,49.3,82.4,51.1,56.1,60.5,38.3,29.3,24.1];
const cfOut = [170.0,169.5,101.9,88.6,95.8,128.9,97.6,102.6,107.0,84.8,75.8,70.6];
const cfBal = cfIn.map((v,i) => parseFloat((v - cfOut[i]).toFixed(1)));
const cfTotLiq = [227,210,195,165,170,185,155,140,130,115,105,95];
const mo6 = ['Dec-25','Jan-26','Feb-26','Mar-26','Apr-26','May-26'];
const opBal = [-98,-120,-95,-98,-90,-85];
const opChg = [20,-22,25,-3,8,5];
const firmFree = [120,80,30,6,60,20];
const firmTotal = [190,145,90,70,125,85];
const dA = [416,414,412,410,408,406,404];
const dB = [212,205,210,201,193,185,176];
const dC = [126,116,113,122,104,104,107];

// ── Shared chart options ──
const gx: any = { ticks: { color: 'rgba(100,160,220,0.45)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
const gy: any = { ticks: { color: 'rgba(100,160,220,0.35)', font: { size: 9 } }, grid: { color: 'rgba(20,80,160,0.25)' }, border: { display: false } };
const def: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
const bcol = mo.map((_,i) => i === 3 ? 'rgba(29,148,255,0.85)' : 'rgba(20,90,170,0.55)');
const bbrd = mo.map((_,i) => i === 3 ? '#4db8ff' : 'rgba(40,120,200,0.5)');

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

function StatusBadge({ variant, children }: { variant: 'risk' | 'track'; children: React.ReactNode }) {
  const s = variant === 'risk'
    ? { background: 'rgba(255,80,90,0.18)', color: '#ff9aa3', border: '1px solid rgba(255,80,90,0.3)' }
    : { background: 'rgba(40,220,140,0.15)', color: '#5dffc0', border: '1px solid rgba(40,220,140,0.25)' };
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, ...s }}>{children}</span>;
}

// ── Chart hook ──
function useChart(ref: React.RefObject<HTMLCanvasElement | null>, config: any) {
  useEffect(() => {
    if (!ref.current) return;
    setChartDefaults();
    const chart = new ChartJS(ref.current, config);
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Dashboard Component ──
export function ManagementReviewDashboard() {
  const rcRef = useRef<HTMLCanvasElement>(null);
  const lcRef = useRef<HTMLCanvasElement>(null);
  const dcRef = useRef<HTMLCanvasElement>(null);
  const ttmcRef = useRef<HTMLCanvasElement>(null);
  const cfcRef = useRef<HTMLCanvasElement>(null);
  const wlcRef = useRef<HTMLCanvasElement>(null);
  const ol6Ref = useRef<HTMLCanvasElement>(null);
  const fl6Ref = useRef<HTMLCanvasElement>(null);
  const dbcRef = useRef<HTMLCanvasElement>(null);

  useChart(rcRef, { type: 'bar', data: { labels: mo, datasets: [{ data: rev, backgroundColor: bcol, borderColor: bbrd, borderWidth: 1, borderRadius: 4 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } } } });
  const lc2 = liq.map(v => v >= 0 ? 'rgba(30,180,120,0.55)' : 'rgba(220,60,80,0.5)');
  const lb2 = liq.map(v => v >= 0 ? 'rgba(50,230,150,0.8)' : 'rgba(255,90,100,0.8)');
  useChart(lcRef, { type: 'bar', data: { labels: mo, datasets: [{ data: liq, backgroundColor: lc2, borderColor: lb2, borderWidth: 1, borderRadius: 4 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } } } });
  useChart(dcRef, { type: 'line', data: { labels: mo, datasets: [{ data: dscr, borderColor: 'rgba(255,90,110,0.8)', backgroundColor: 'rgba(200,40,60,0.08)', borderWidth: 2, pointBackgroundColor: mo.map((_,i) => i === 3 ? '#ff6b7a' : 'rgba(255,100,120,0.5)'), pointRadius: mo.map((_,i) => i === 3 ? 5 : 3), fill: true, tension: 0.4 }] }, options: { ...def, scales: { x: gx, y: gy } } });
  useChart(ttmcRef, { type: 'bar', data: { labels: mo, datasets: [{ data: ttm, backgroundColor: 'rgba(20,90,170,0.6)', borderColor: 'rgba(50,140,220,0.7)', borderWidth: 1, borderRadius: 3 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'MM' } } } } });
  useChart(cfcRef, { type: 'bar', data: { labels: cfWks, datasets: [
    { label: 'Cash In', data: cfIn, backgroundColor: 'rgba(25,160,100,0.5)', borderColor: 'rgba(40,220,140,0.65)', borderWidth: 1, borderRadius: 3, order: 2 },
    { label: 'Cash Out', data: cfOut, backgroundColor: 'rgba(200,40,60,0.4)', borderColor: 'rgba(255,80,100,0.6)', borderWidth: 1, borderRadius: 3, order: 2 },
    { label: 'Balance', data: cfBal, type: 'line' as const, borderColor: 'rgba(255,190,30,0.9)', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, pointBackgroundColor: 'rgba(255,190,30,0.8)', tension: 0.3, order: 1 },
    { label: 'Total Liq', data: cfTotLiq, type: 'line' as const, borderColor: 'rgba(40,160,255,0.75)', backgroundColor: 'rgba(20,100,200,0.08)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.3, order: 0 },
  ] }, options: { ...def, scales: { x: { ...gx, ticks: { ...gx.ticks, maxRotation: 35 } }, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: true, position: 'top' as const, labels: { color: 'rgba(140,200,255,0.6)', font: { size: 9 }, boxWidth: 8, padding: 10 } } } } });
  useChart(wlcRef, { type: 'line', data: { labels: cfWks, datasets: [
    { label: 'Liquidity', data: cfTotLiq, borderColor: 'rgba(40,160,255,0.8)', backgroundColor: 'rgba(15,70,160,0.2)', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3, pointBackgroundColor: 'rgba(77,184,255,0.8)' },
    { label: 'Min Cash', data: Array(12).fill(50), borderColor: 'rgba(255,80,100,0.45)', borderWidth: 1.5, borderDash: [4,4], backgroundColor: 'transparent', pointRadius: 0 },
  ] }, options: { ...def, scales: { x: { ...gx, ticks: { ...gx.ticks, maxRotation: 40 } }, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: true, position: 'top' as const, labels: { color: 'rgba(140,200,255,0.6)', font: { size: 9 }, boxWidth: 8, padding: 10 } } } } });
  useChart(ol6Ref, { type: 'bar', data: { labels: mo6, datasets: [
    { label: 'Op Balance', data: opBal, backgroundColor: 'rgba(20,90,170,0.6)', borderColor: 'rgba(50,140,220,0.65)', borderWidth: 1, borderRadius: 3 },
    { label: 'Change', data: opChg, type: 'line' as const, borderColor: 'rgba(40,220,140,0.8)', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.3 },
  ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: false } } } });
  useChart(fl6Ref, { type: 'line', data: { labels: mo6, datasets: [
    { label: 'Free Cash', data: firmFree, borderColor: 'rgba(40,220,140,0.8)', backgroundColor: 'rgba(20,120,80,0.15)', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3 },
    { label: 'Cash+Credit', data: firmTotal, borderColor: 'rgba(40,160,255,0.7)', backgroundColor: 'rgba(15,70,160,0.12)', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3 },
  ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: false } } } });
  useChart(dbcRef, { type: 'bar', data: { labels: mo, datasets: [
    { label: 'A', data: dA, backgroundColor: 'rgba(25,150,220,0.65)', borderColor: 'rgba(50,180,255,0.75)', borderWidth: 1, borderRadius: 2, stack: 'd' },
    { label: 'B', data: dB, backgroundColor: 'rgba(15,90,180,0.6)', borderColor: 'rgba(40,130,230,0.7)', borderWidth: 1, stack: 'd' },
    { label: 'C', data: dC, backgroundColor: 'rgba(220,50,70,0.5)', borderColor: 'rgba(255,80,100,0.7)', borderWidth: 1, stack: 'd' },
  ] }, options: { ...def, scales: { x: gx, y: { ...gy, stacked: true, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: true, position: 'top' as const, labels: { color: 'rgba(140,200,255,0.6)', font: { size: 9 }, boxWidth: 8, padding: 8 } } } } });

  const snTd: React.CSSProperties = { padding: '4px 8px', fontSize: 10, textAlign: 'right', borderBottom: '1px solid rgba(30,80,140,0.35)' };
  const snLab: React.CSSProperties = { ...snTd, textAlign: 'left', color: 'rgba(160,210,255,0.55)', fontWeight: 600 };
  const hlTd: React.CSSProperties = { ...snTd, background: 'rgba(29,148,255,0.12)' };

  return (
    <div style={{ background: 'transparent', color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <Card className="glass-module">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#e8f6ff' }}>5th<span style={{ color: '#29aaff' }}>Line</span> Financial</span>
            <span style={{ fontSize: 9, color: 'rgba(160,210,255,0.4)', fontStyle: 'italic', marginLeft: 10 }}>Update current month upon each closing</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
            <span style={{ background: 'rgba(40,120,200,0.25)', padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, color: '#4db8ff', border: '1px solid rgba(40,120,200,0.35)' }}>Q1 · Mar 2026</span>
            <span style={{ color: 'rgba(160,210,255,0.5)' }}>TTM</span><span style={{ fontWeight: 700, color: '#e8f6ff' }}>$1.69MM</span>
            <span style={{ color: 'rgba(160,210,255,0.5)' }}>YTD</span><span style={{ fontWeight: 700, color: '#e8f6ff' }}>$0.33MM</span>
          </div>
        </div>
      </Card>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
        {[
          { l: 'Total Revenue', v: '$229.9K', d: '+ $167.9K vs PM', c: '#3de89a' },
          { l: 'Operating Profit', v: '$75.6K', d: '- $134.7K vs PM', c: '#ff6b7a' },
          { l: 'Firm Liquidity', v: '-$56.7K', d: '- $61.6K vs PM', c: '#ff6b7a', vc: '#ff6b7a' },
          { l: 'Total Debt', v: '$732.8K', d: '- $1.7K · 0%', c: 'rgba(160,210,255,0.35)', vc: '#ffc53d' },
          { l: 'Cash + Credit', v: '$6.5K', d: '- $151.1K vs PM', c: '#ff6b7a', vc: '#ff6b7a' },
          { l: 'Mo. Debt Svc', v: '$18K', d: 'DSCR -6.30', c: '#ff6b7a', vc: '#ffc53d' },
        ].map((k, i) => (
          <Card key={i}>
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(160,210,255,0.5)', marginBottom: 4 }}>{k.l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.vc || '#e8f6ff' }}>{k.v}</div>
              <div style={{ fontSize: 10, color: k.c, marginTop: 2 }}>{k.d}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Middle 3-col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 10 }}>
        {/* Col 1 — Charts */}
        <Card className="glass-module">
          <div style={{ padding: '10px 14px' }}>
            <SectionLabel>Monthly Revenue ($K)</SectionLabel>
            <div style={{ position: 'relative', height: 148 }}><canvas ref={rcRef} /></div>
            <Sep />
            <SectionLabel>Liquidity Trend ($K)</SectionLabel>
            <div style={{ position: 'relative', height: 108 }}><canvas ref={lcRef} /></div>
          </div>
        </Card>
        {/* Col 2 — Liquidity Accounts */}
        <Card className="glass-module">
          <div style={{ padding: '10px 14px' }}>
            <SectionLabel>Liquidity Accounts</SectionLabel>
            <Row label="Operating Acc."><span style={{ color: '#ff6b7a' }}>-$98.0K</span> <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓$46.5K</span></Row>
            <Row label="M&T Acc.">$44.1K <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓$188.7K</span></Row>
            <Row label="Tax Reserve">$2.5K <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓$147.1K</span></Row>
            <Row label="5th Line Tech."><span style={{ color: '#ff6b7a' }}>-$0.5K</span> <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓$144.1K</span></Row>
            <Row label="5LCA">$20.0K <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓$164.6K</span></Row>
            <Row label="5LFS"><span style={{ color: '#ff6b7a' }}>-$24.8K</span> <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓$119.8K</span></Row>
            <Row label="Total"><span style={{ fontWeight: 700, color: '#ff6b7a' }}>-$56.7K</span></Row>
            <Row label="Undrawn LOC"><span style={{ color: '#4db8ff' }}>$63.1K</span></Row>
            <Row label="Cash + Credit"><span style={{ color: '#ff6b7a' }}>$6.5K</span></Row>
            <Sep />
            <SectionLabel>Liabilities</SectionLabel>
            <Row label="SBA Loan">$320.5K</Row>
            <Row label="Headway LOC">$0.0K</Row>
            <Row label="AMEX LOC">$42.5K <span style={{ fontSize: 9, color: '#ff6b7a' }}>↓9%</span></Row>
            <Row label="M&T LOC">$89.2K</Row>
            <Row label="Other Loans">$253.8K</Row>
            <Row label="CC's (Est)">$26.8K <span style={{ fontSize: 9, color: '#3de89a' }}>↑55%</span></Row>
            <Row label="Total"><span style={{ fontWeight: 700, color: '#ffc53d' }}>$732.8K</span></Row>
          </div>
        </Card>
        {/* Col 3 — FinServ / DSCR / TTM */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card className="glass-module">
            <div style={{ padding: '10px 14px' }}>
              <SectionLabel>FinServ</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 11 }}>
                {[
                  { l: 'Revenue', v: '$35.6K', c: '#3de89a', s: '↑21%' },
                  { l: 'Profit', v: '$3.3K' },
                  { l: 'Next 3Mo Rev', v: '$131K', c: '#4db8ff' },
                  { l: 'Next 3Mo Profit', v: '$19.1K', c: '#3de89a' },
                  { l: 'CF Forecast', v: '$29.0K', c: '#3de89a' },
                  { l: 'Run Rate', v: '$749K', c: '#4db8ff' },
                ].map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid rgba(40,100,180,0.15)' }}>
                    <span style={{ color: 'rgba(160,210,255,0.5)', fontSize: 10 }}>{m.l}</span>
                    <span style={{ fontWeight: 600, color: m.c || '#d0eaff' }}>{m.v}{m.s && <span style={{ fontSize: 9, marginLeft: 3, color: m.c }}>{m.s}</span>}</span>
                  </div>
                ))}
              </div>
              <Sep />
              <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(160,210,255,0.5)', marginBottom: 4 }}>Active vs Potential</div>
              <div style={{ height: 10, borderRadius: 6, background: 'rgba(20,60,120,0.5)', overflow: 'hidden', border: '1px solid rgba(40,100,180,0.3)' }}>
                <div style={{ width: '24%', height: '100%', borderRadius: 6, background: 'linear-gradient(90deg,#1e7fc8,#4db8ff)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginTop: 3, color: 'rgba(160,210,255,0.45)' }}>
                <span>$0.4MM active</span><span>$1.7MM potential</span>
              </div>
            </div>
          </Card>
          <Card className="glass-module">
            <div style={{ padding: '10px 14px' }}>
              <SectionLabel>DSCR</SectionLabel>
              <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: 6, fontSize: 11 }}>
                <div><div style={{ fontSize: 9, color: 'rgba(160,210,255,0.5)' }}>TTM DSCR</div><div style={{ fontWeight: 700, color: '#ff6b7a' }}>-6.30</div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(160,210,255,0.5)' }}>Fwd 12</div><div style={{ fontWeight: 700, color: '#ffc53d' }}>0.06</div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(160,210,255,0.5)' }}>Debt:Cash</div><div style={{ fontWeight: 700, color: '#ff6b7a' }}>-12.46</div></div>
              </div>
              <div style={{ position: 'relative', height: 82 }}><canvas ref={dcRef} /></div>
            </div>
          </Card>
          <Card className="glass-module">
            <div style={{ padding: '10px 14px' }}>
              <SectionLabel>TTM Revenue</SectionLabel>
              <div style={{ position: 'relative', height: 90 }}><canvas ref={ttmcRef} /></div>
            </div>
          </Card>
        </div>
      </div>

      {/* Pipeline + Monthly Snapshot */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.85fr', gap: 10 }}>
        <Card className="glass-module">
          <div style={{ padding: '10px 14px' }}>
            <SectionLabel>Deal Pipeline — Debt Solutions</SectionLabel>
            <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(40,100,180,0.3)' }}>
                <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0', color: 'rgba(160,210,255,0.5)' }}>DEAL</th>
                <th style={{ textAlign: 'right', fontWeight: 600, padding: '4px 0', color: 'rgba(160,210,255,0.5)' }}>REVENUE</th>
                <th style={{ textAlign: 'right', fontWeight: 600, padding: '4px 0', color: 'rgba(160,210,255,0.5)' }}>STATUS</th>
              </tr></thead>
              <tbody>
                {[
                  { n: 'TNT', r: '$90,000', s: 'risk' as const },
                  { n: 'Infillion', r: '$963,000', s: 'track' as const },
                  { n: 'Back Bar', r: '$130,000', s: 'risk' as const },
                  { n: 'OpConnect', r: '$90,500', s: 'track' as const },
                ].map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(40,100,180,0.15)' }}>
                    <td style={{ padding: '5px 0', color: '#d0eaff' }}>{d.n}</td>
                    <td style={{ textAlign: 'right', color: '#d0eaff' }}>{d.r}</td>
                    <td style={{ textAlign: 'right' }}><StatusBadge variant={d.s}>{d.s === 'risk' ? 'At Risk' : 'On Track'}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Sep />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, textAlign: 'center', fontSize: 10 }}>
              {[{ l: 'Deals', v: '7' }, { l: 'Volume', v: '$83MM' }, { l: 'Signings', v: '2.4' }, { l: 'DS Next 3Mo', v: '$0K' }].map((s, i) => (
                <div key={i}><div style={{ fontSize: 9, color: 'rgba(160,210,255,0.5)' }}>{s.l}</div><div style={{ fontWeight: 700, color: '#4db8ff' }}>{s.v}</div></div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="glass-module">
          <div style={{ padding: '10px 14px' }}>
            <SectionLabel>Monthly Snapshot</SectionLabel>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...snLab, background: 'none' }}></th>
                  {mo.map((m, i) => <th key={i} style={i === 3 ? { ...hlTd, fontWeight: 700, color: '#4db8ff' } : { ...snTd, color: 'rgba(160,210,255,0.5)', fontWeight: 600 }}>{m}</th>)}
                </tr></thead>
                <tbody>
                  {[
                    { l: 'Revenue', d: ['$153.7K','$33.2K','$62.0K','$229.9K','$185.4K','$55.4K','$269.7K'] },
                    { l: 'Liquidity', d: ['$227K','$71K','-$59K','$6K','$69K','$14K','$103K'] },
                    { l: 'TTM Rev', d: ['$2.4MM','$1.7MM','$1.6MM','$1.7MM','$1.8MM','$1.8MM','$1.6MM'] },
                    { l: 'DSCR', d: ['-2.88','-9.10','-8.79','-6.30','-3.44','-2.13','-1.32'] },
                    { l: 'Debt Bal.', d: ['$753K','$734K','$734K','$733K','$705K','$694K','$686K'] },
                    { l: 'Mo Payment', d: ['$18K','$18K','$18K','$18K','$18K','$17K','$17K'] },
                    { l: 'Liq Change', d: ['-$157K','-$130K','$66K','$62K','-$55K','$89K','—'] },
                  ].map((r, ri) => (
                    <tr key={ri}>
                      <td style={snLab}>{r.l}</td>
                      {r.d.map((v, ci) => <td key={ci} style={ci === 3 ? hlTd : snTd}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Sep />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 10 }}>
              <div><span style={{ color: 'rgba(160,210,255,0.5)' }}>Debt A-rated</span> <span style={{ color: '#4db8ff' }}>$410K→$404K</span></div>
              <div><span style={{ color: 'rgba(160,210,255,0.5)' }}>Debt B-rated</span> <span style={{ color: '#4db8ff' }}>$201K→$176K</span></div>
              <div><span style={{ color: 'rgba(160,210,255,0.5)' }}>Debt C-rated</span> <span style={{ color: '#ff6b7a' }}>$122K→$107K</span></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Cashflow 12-Week */}
      <Card className="glass-module">
        <div style={{ padding: '12px 16px' }}>
          <SectionLabel>Cashflow — 12-Week Rolling Forecast (Mar 13 – May 29)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div style={{ position: 'relative', height: 185 }}><canvas ref={cfcRef} /></div>
            <div>
              <SectionLabel>6-Wk Firm Liquidity</SectionLabel>
              <div style={{ position: 'relative', height: 185 }}><canvas ref={wlcRef} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <Card className="glass-module">
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>6-Mo Operating Liquidity</SectionLabel>
            <div style={{ position: 'relative', height: 120 }}><canvas ref={ol6Ref} /></div>
          </div>
        </Card>
        <Card className="glass-module">
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>6-Mo Firm Liquidity</SectionLabel>
            <div style={{ position: 'relative', height: 120 }}><canvas ref={fl6Ref} /></div>
          </div>
        </Card>
        <Card className="glass-module">
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>Debt by Rating</SectionLabel>
            <div style={{ position: 'relative', height: 120 }}><canvas ref={dbcRef} /></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
