import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

// ── Chart.js global defaults ──
Chart.defaults.color = 'rgba(120,180,240,0.5)';
Chart.defaults.borderColor = 'rgba(40,100,180,0.2)';
Chart.defaults.font.size = 9;
Chart.defaults.font.family = 'system-ui, sans-serif';

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

function Badge({ variant, children }: { variant: 'risk' | 'track'; children: React.ReactNode }) {
  const s = variant === 'risk'
    ? { background: 'rgba(255,80,90,0.18)', color: '#ff9aa3', border: '1px solid rgba(255,80,90,0.3)' }
    : { background: 'rgba(40,220,140,0.15)', color: '#5dffc0', border: '1px solid rgba(40,220,140,0.25)' };
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, ...s }}>{children}</span>;
}

// ── Chart hook ──
function useChart(ref: React.RefObject<HTMLCanvasElement | null>, config: any) {
  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, config);
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Page ──
export default function ManagementReview() {
  const rcRef = useRef<HTMLCanvasElement>(null);
  const lcRef = useRef<HTMLCanvasElement>(null);
  const dcRef = useRef<HTMLCanvasElement>(null);
  const ttmcRef = useRef<HTMLCanvasElement>(null);
  const cfcRef = useRef<HTMLCanvasElement>(null);
  const wlcRef = useRef<HTMLCanvasElement>(null);
  const ol6Ref = useRef<HTMLCanvasElement>(null);
  const fl6Ref = useRef<HTMLCanvasElement>(null);
  const dbcRef = useRef<HTMLCanvasElement>(null);

  // Monthly Revenue
  useChart(rcRef, { type: 'bar', data: { labels: mo, datasets: [{ data: rev, backgroundColor: bcol, borderColor: bbrd, borderWidth: 1, borderRadius: 4 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } } } });

  // Liquidity Trend
  const lc2 = liq.map(v => v >= 0 ? 'rgba(30,180,120,0.55)' : 'rgba(220,60,80,0.5)');
  const lb2 = liq.map(v => v >= 0 ? 'rgba(50,230,150,0.8)' : 'rgba(255,90,100,0.8)');
  useChart(lcRef, { type: 'bar', data: { labels: mo, datasets: [{ data: liq, backgroundColor: lc2, borderColor: lb2, borderWidth: 1, borderRadius: 4 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } } } });

  // DSCR
  useChart(dcRef, { type: 'line', data: { labels: mo, datasets: [{ data: dscr, borderColor: 'rgba(255,90,110,0.8)', backgroundColor: 'rgba(200,40,60,0.08)', borderWidth: 2, pointBackgroundColor: mo.map((_,i) => i === 3 ? '#ff6b7a' : 'rgba(255,100,120,0.5)'), pointRadius: mo.map((_,i) => i === 3 ? 5 : 3), fill: true, tension: 0.4 }] }, options: { ...def, scales: { x: gx, y: gy } } });

  // TTM Revenue
  useChart(ttmcRef, { type: 'bar', data: { labels: mo, datasets: [{ data: ttm, backgroundColor: 'rgba(20,90,170,0.6)', borderColor: 'rgba(50,140,220,0.7)', borderWidth: 1, borderRadius: 3 }] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'MM' } } } } });

  // Cashflow 12-week
  useChart(cfcRef, { type: 'bar', data: { labels: cfWks, datasets: [
    { label: 'Cash In', data: cfIn, backgroundColor: 'rgba(25,160,100,0.5)', borderColor: 'rgba(40,220,140,0.65)', borderWidth: 1, borderRadius: 3, order: 2 },
    { label: 'Cash Out', data: cfOut, backgroundColor: 'rgba(200,40,60,0.4)', borderColor: 'rgba(255,80,100,0.6)', borderWidth: 1, borderRadius: 3, order: 2 },
    { label: 'Balance', data: cfBal, type: 'line' as const, borderColor: 'rgba(255,190,30,0.9)', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, pointBackgroundColor: 'rgba(255,190,30,0.8)', tension: 0.3, order: 1 },
    { label: 'Total Liq', data: cfTotLiq, type: 'line' as const, borderColor: 'rgba(40,160,255,0.75)', backgroundColor: 'rgba(20,100,200,0.08)', borderWidth: 2, pointRadius: 2, fill: true, tension: 0.3, order: 0 },
  ] }, options: { ...def, scales: { x: { ...gx, ticks: { ...gx.ticks, maxRotation: 35 } }, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: true, position: 'top' as const, labels: { color: 'rgba(140,200,255,0.6)', font: { size: 9 }, boxWidth: 8, padding: 10 } } } } });

  // 6-Wk Firm Liquidity
  useChart(wlcRef, { type: 'line', data: { labels: cfWks, datasets: [
    { label: 'Liquidity', data: cfTotLiq, borderColor: 'rgba(40,160,255,0.8)', backgroundColor: 'rgba(15,70,160,0.2)', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3, pointBackgroundColor: 'rgba(77,184,255,0.8)' },
    { label: 'Min Cash', data: Array(12).fill(50), borderColor: 'rgba(255,80,100,0.45)', borderWidth: 1.5, borderDash: [4,4], backgroundColor: 'transparent', pointRadius: 0 },
  ] }, options: { ...def, scales: { x: { ...gx, ticks: { ...gx.ticks, maxRotation: 40 } }, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: true, position: 'top' as const, labels: { color: 'rgba(140,200,255,0.6)', font: { size: 9 }, boxWidth: 8, padding: 10 } } } } });

  // 6-Mo Operating Liquidity
  useChart(ol6Ref, { type: 'bar', data: { labels: mo6, datasets: [
    { label: 'Op Balance', data: opBal, backgroundColor: 'rgba(20,90,170,0.6)', borderColor: 'rgba(50,140,220,0.65)', borderWidth: 1, borderRadius: 3 },
    { label: 'Change', data: opChg, type: 'line' as const, borderColor: 'rgba(40,220,140,0.8)', backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.3 },
  ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: false } } } });

  // 6-Mo Firm Liquidity
  useChart(fl6Ref, { type: 'line', data: { labels: mo6, datasets: [
    { label: 'Free Cash', data: firmFree, borderColor: 'rgba(40,220,140,0.8)', backgroundColor: 'rgba(20,120,80,0.15)', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3 },
    { label: 'Cash+Credit', data: firmTotal, borderColor: 'rgba(40,160,255,0.7)', backgroundColor: 'rgba(15,70,160,0.12)', fill: true, borderWidth: 2, tension: 0.3, pointRadius: 3 },
  ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: false } } } });

  // Debt by Rating
  useChart(dbcRef, { type: 'bar', data: { labels: mo, datasets: [
    { label: 'A', data: dA, backgroundColor: 'rgba(25,150,220,0.65)', borderColor: 'rgba(50,180,255,0.75)', borderWidth: 1, borderRadius: 2, stack: 'd' },
    { label: 'B', data: dB, backgroundColor: 'rgba(15,90,180,0.6)', borderColor: 'rgba(40,130,230,0.7)', borderWidth: 1, stack: 'd' },
    { label: 'C', data: dC, backgroundColor: 'rgba(220,50,70,0.5)', borderColor: 'rgba(255,80,100,0.7)', borderWidth: 1, stack: 'd' },
  ] }, options: { ...def, scales: { x: gx, y: { ...gy, stacked: true, ticks: { ...gy.ticks, callback: (v: number) => '$' + v + 'K' } } }, plugins: { legend: { display: true, position: 'top' as const, labels: { color: 'rgba(140,200,255,0.6)', font: { size: 9 }, boxWidth: 8, padding: 8 } } } } });

  return (
    <div style={{ background: '#061828', padding: 14, color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', minWidth: 860, minHeight: '100vh' }}>
      {/* ── 1. Header ── */}
      <Card className="mb-2.5">
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e8f6ff', letterSpacing: '-0.3px' }}>
              5th<span style={{ color: '#29aaff' }}>Line</span> Financial
            </div>
            <div style={{ fontSize: 9, color: 'rgba(120,180,240,0.4)', marginTop: 1, fontStyle: 'italic' }}>
              Update current month upon each closing
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ background: 'rgba(20,90,160,0.6)', border: '1px solid rgba(40,140,220,0.4)', borderRadius: 20, padding: '4px 12px', fontSize: 11, color: '#5dc8ff', fontWeight: 600 }}>
              Q1 · Mar 2026
            </div>
            <div style={{ fontSize: 10, color: 'rgba(120,180,240,0.45)' }}>TTM <span style={{ color: '#4db8ff', fontWeight: 600 }}>$1.69MM</span></div>
            <div style={{ fontSize: 10, color: 'rgba(120,180,240,0.45)' }}>YTD <span style={{ color: '#4db8ff', fontWeight: 600 }}>$0.33MM</span></div>
          </div>
        </div>
      </Card>

      {/* ── 2. KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'Total Revenue', value: '$229.9K', delta: '+ $167.9K vs PM', cls: 'up' },
          { label: 'Operating Profit', value: '$75.6K', delta: '- $134.7K vs PM', cls: 'dn' },
          { label: 'Firm Liquidity', value: '-$56.7K', delta: '- $61.6K vs PM', cls: 'dn', valueCls: 'dn' },
          { label: 'Total Debt', value: '$732.8K', delta: '- $1.7K · 0%', cls: 'faint', valueCls: 'am' },
          { label: 'Cash + Credit', value: '$6.5K', delta: '- $151.1K vs PM', cls: 'dn', valueCls: 'dn' },
          { label: 'Mo. Debt Svc', value: '$18K', delta: <>DSCR <span style={{ color: '#ff6b7a' }}>-6.30</span></>, cls: 'faint', valueCls: 'am' },
        ].map((k, i) => (
          <Card key={i}>
            <div style={{ padding: '11px 13px' }}>
              <div style={{ fontSize: 9, color: 'rgba(120,180,240,0.5)', fontWeight: 600, letterSpacing: '.8px', textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.valueCls === 'dn' ? '#ff6b7a' : k.valueCls === 'am' ? '#ffc53d' : '#e8f6ff', lineHeight: 1.1, margin: '4px 0' }}>{k.value}</div>
              <div style={{ fontSize: 10, marginTop: 3, color: k.cls === 'up' ? '#3de89a' : k.cls === 'dn' ? '#ff6b7a' : 'rgba(160,210,255,0.4)' }}>{k.delta}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── 3. Middle 3-col ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr)', gap: 10, marginBottom: 10 }}>
        {/* Col 1: Charts */}
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>Monthly Revenue</SectionLabel>
            <div style={{ position: 'relative', height: 148 }}><canvas ref={rcRef} /></div>
            <Sep />
            <SectionLabel>Liquidity Trend</SectionLabel>
            <div style={{ position: 'relative', height: 108 }}><canvas ref={lcRef} /></div>
          </div>
        </Card>

        {/* Col 2: Liquidity + Liabilities */}
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>Liquidity Accounts</SectionLabel>
            <Row label="Operating Acc."><span style={{ color: '#ff6b7a' }}>-$98.0K <span style={{ fontSize: 9, opacity: 0.6 }}>↓$46.5K</span></span></Row>
            <Row label="M&T Acc.">$44.1K <span style={{ fontSize: 9, opacity: 0.6 }}>↓$188.7K</span></Row>
            <Row label="Tax Reserve">$2.5K <span style={{ fontSize: 9, opacity: 0.6 }}>↓$147.1K</span></Row>
            <Row label="5th Line Tech."><span style={{ color: '#ff6b7a' }}>-$0.5K <span style={{ fontSize: 9, opacity: 0.6 }}>↓$144.1K</span></span></Row>
            <Row label="5LCA">$20.0K <span style={{ fontSize: 9, opacity: 0.6 }}>↓$164.6K</span></Row>
            <Row label="5LFS"><span style={{ color: '#ff6b7a' }}>-$24.8K <span style={{ fontSize: 9, opacity: 0.6 }}>↓$119.8K</span></span></Row>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 2px', borderTop: '1px solid rgba(40,100,180,0.3)', marginTop: 3 }}>
              <span style={{ fontSize: 11, color: 'rgba(120,180,240,0.5)', fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ff6b7a' }}>-$56.7K</span>
            </div>
            <Row label="+ Undrawn LOC"><span style={{ color: '#4db8ff' }}>$63.1K</span></Row>
            <Row label="Cash + Credit"><span style={{ color: '#ff6b7a' }}>$6.5K</span></Row>
            <Sep />
            <SectionLabel>Liabilities</SectionLabel>
            <Row label="SBA Loan">$320.5K</Row>
            <Row label="Headway LOC">$0.0K</Row>
            <Row label="AMEX LOC">$42.5K <span style={{ color: '#ff6b7a', fontSize: 9 }}>↓9%</span></Row>
            <Row label="M&T LOC">$89.2K</Row>
            <Row label="Other Loans">$253.8K</Row>
            <Row label="CC's (Est)">$26.8K <span style={{ color: '#3de89a', fontSize: 9 }}>↑55%</span></Row>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', borderTop: '1px solid rgba(40,100,180,0.3)', marginTop: 3 }}>
              <span style={{ fontSize: 11, color: 'rgba(120,180,240,0.5)', fontWeight: 600 }}>Totals</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ffc53d' }}>$732.8K</span>
            </div>
          </div>
        </Card>

        {/* Col 3: FinServ + DSCR + TTM */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* FinServ */}
          <Card>
            <div style={{ padding: '12px 14px' }}>
              <SectionLabel>FinServ</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 9, color: 'rgba(120,180,240,0.45)' }}>Revenue</div><div style={{ fontSize: 14, fontWeight: 700, color: '#e8f6ff' }}>$35.6K <span style={{ color: '#3de89a', fontSize: 9 }}>↑21%</span></div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(120,180,240,0.45)' }}>Profit</div><div style={{ fontSize: 14, fontWeight: 700, color: '#e8f6ff' }}>$3.3K</div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(120,180,240,0.45)' }}>Next 3Mo Rev</div><div style={{ fontSize: 14, fontWeight: 700, color: '#4db8ff' }}>$131K</div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(120,180,240,0.45)' }}>Next 3Mo Profit</div><div style={{ fontSize: 14, fontWeight: 700, color: '#3de89a' }}>$19.1K</div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(120,180,240,0.45)' }}>CF Forecast</div><div style={{ fontSize: 14, fontWeight: 700, color: '#3de89a' }}>$29.0K</div></div>
                <div><div style={{ fontSize: 9, color: 'rgba(120,180,240,0.45)' }}>Run Rate</div><div style={{ fontSize: 14, fontWeight: 700, color: '#4db8ff' }}>$749K</div></div>
              </div>
              <Sep />
              <div style={{ fontSize: 9, color: 'rgba(120,180,240,0.4)', marginBottom: 4 }}>Active vs Potential</div>
              <div style={{ height: 4, background: 'rgba(20,60,120,0.7)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: '24%', height: '100%', background: 'linear-gradient(90deg,#1e7fc8,#4db8ff)', borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(120,180,240,0.35)', marginTop: 3 }}>
                <span>$0.4MM active</span><span>$1.7MM potential</span>
              </div>
            </div>
          </Card>

          {/* DSCR */}
          <Card>
            <div style={{ padding: '12px 14px' }}>
              <SectionLabel>DSCR &amp; Debt Service</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, textAlign: 'center', marginBottom: 8 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: '#ff6b7a' }}>-6.30</div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)', marginTop: 1 }}>TTM DSCR</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: '#ffc53d' }}>0.06</div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)', marginTop: 1 }}>Fwd 12</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 700, color: '#ff6b7a' }}>-12.46</div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)', marginTop: 1 }}>Debt:Cash</div></div>
              </div>
              <div style={{ position: 'relative', height: 82 }}><canvas ref={dcRef} /></div>
            </div>
          </Card>

          {/* TTM Revenue */}
          <Card>
            <div style={{ padding: '12px 14px' }}>
              <SectionLabel>TTM Revenue</SectionLabel>
              <div style={{ position: 'relative', height: 90 }}><canvas ref={ttmcRef} /></div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── 4. Pipeline + Monthly Snapshot ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.85fr)', gap: 10, marginBottom: 10 }}>
        {/* Pipeline */}
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>Deal Pipeline — Debt Solutions</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px 62px', gap: 4, marginBottom: 5 }}>
              <div style={{ fontSize: 8, color: 'rgba(100,160,220,0.3)', fontWeight: 600, letterSpacing: '.5px' }}>DEAL</div>
              <div style={{ fontSize: 8, color: 'rgba(100,160,220,0.3)', fontWeight: 600, letterSpacing: '.5px', textAlign: 'right' }}>REVENUE</div>
              <div style={{ fontSize: 8, color: 'rgba(100,160,220,0.3)', fontWeight: 600, letterSpacing: '.5px', textAlign: 'center' }}>STATUS</div>
            </div>
            {[
              { name: 'TNT', rev: '$90,000', status: 'risk' as const },
              { name: 'Infillion', rev: '$963,000', status: 'track' as const },
              { name: 'Back Bar', rev: '$130,000', status: 'risk' as const },
              { name: 'OpConnect', rev: '$90,500', status: 'track' as const },
            ].map((d, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 78px 62px', gap: 4, padding: '4px 0', borderBottom: '1px solid rgba(40,100,180,0.2)', fontSize: 11, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#cce8ff' }}>{d.name}</span>
                <span style={{ textAlign: 'right', color: 'rgba(160,210,255,0.6)' }}>{d.rev}</span>
                <span style={{ textAlign: 'center' }}><Badge variant={d.status}>{d.status === 'risk' ? 'At Risk' : 'On Track'}</Badge></span>
              </div>
            ))}
            <Sep />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, textAlign: 'center' }}>
              {[
                { val: '7', label: 'Deals' }, { val: '$83MM', label: 'Volume' },
                { val: '2.4', label: 'Signings' }, { val: '$0K', label: 'DS Next 3Mo' },
              ].map((s, i) => (
                <div key={i}><div style={{ fontSize: 16, fontWeight: 700, color: '#4db8ff' }}>{s.val}</div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)' }}>{s.label}</div></div>
              ))}
            </div>
          </div>
        </Card>

        {/* Monthly Snapshot */}
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>Monthly Snapshot</SectionLabel>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  {['Metric','Dec-25','Jan-26','Feb-26','Mar-26','Apr-26','May-26','Jun-26'].map((h, i) => (
                    <th key={i} style={{ color: i === 4 ? '#4db8ff' : 'rgba(120,180,240,0.45)', fontWeight: 600, textAlign: i === 0 ? 'left' : 'right', padding: '4px 5px', borderBottom: '1px solid rgba(40,100,180,0.25)', fontSize: 9, letterSpacing: '.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { m: 'Revenue', vals: ['$153.7K','$33.2K','$62.0K','$229.9K','$185.4K','$55.4K','$269.7K'] },
                  { m: 'Liquidity', vals: ['$227K','$71K','-$59K','$6K','$69K','$14K','$103K'], negIdx: [2,3] },
                  { m: 'TTM Rev', vals: ['$2.4MM','$1.7MM','$1.6MM','$1.7MM','$1.8MM','$1.8MM','$1.6MM'] },
                  { m: 'DSCR', vals: ['-2.88','-9.10','-8.79','-6.30','-3.44','-2.13','-1.32'], allNeg: true },
                  { m: 'Debt Bal.', vals: ['$753K','$734K','$734K','$733K','$705K','$694K','$686K'] },
                  { m: 'Mo Payment', vals: ['$18K','$18K','$18K','$18K','$18K','$17K','$17K'], amber: true },
                  { m: 'Liq Change', vals: ['-$157K','-$130K','$66K','$62K','-$55K','$89K','—'], mixedColor: true },
                ].map((row, ri) => (
                  <tr key={ri}>
                    <td style={{ textAlign: 'left', padding: '4px 5px', borderBottom: '1px solid rgba(40,100,180,0.1)', color: 'rgba(120,170,220,0.5)' }}>{row.m}</td>
                    {row.vals.map((v, ci) => {
                      let color = 'rgba(190,225,255,0.7)';
                      if (ci === 3) color = '#4db8ff'; // Mar-26 highlight
                      if (row.allNeg) color = ci === 3 ? '#ff6b7a' : '#ff6b7a';
                      if (row.amber && ci !== 3) color = '#ffc53d';
                      if (row.negIdx?.includes(ci)) color = ci === 3 ? '#ff6b7a' : '#ff6b7a';
                      if (row.mixedColor && ci !== 3) {
                        color = v.startsWith('-') ? '#ff6b7a' : v.startsWith('$') ? '#3de89a' : 'rgba(190,225,255,0.7)';
                      }
                      return <td key={ci} style={{ textAlign: 'right', padding: '4px 5px', borderBottom: '1px solid rgba(40,100,180,0.1)', color, fontWeight: ci === 3 ? 700 : 500 }}>{v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <Sep />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 5 }}>
              <div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)' }}>Debt A-rated</div><div style={{ fontSize: 12, fontWeight: 700, color: '#e8f6ff' }}>$410K <span style={{ fontSize: 9, opacity: 0.5 }}>→$404K</span></div></div>
              <div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)' }}>Debt B-rated</div><div style={{ fontSize: 12, fontWeight: 700, color: '#e8f6ff' }}>$201K <span style={{ fontSize: 9, opacity: 0.5 }}>→$176K</span></div></div>
              <div><div style={{ fontSize: 8, color: 'rgba(120,180,240,0.4)' }}>Debt C-rated</div><div style={{ fontSize: 12, fontWeight: 700, color: '#ff6b7a' }}>$122K <span style={{ fontSize: 9, opacity: 0.5 }}>→$107K</span></div></div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── 5. Cashflow 12-Week ── */}
      <Card className="mb-2.5">
        <div style={{ padding: '12px 14px' }}>
          <SectionLabel>Cashflow — 12-Week Rolling Forecast (Mar 13 – May 29)</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 12 }}>
            <div style={{ position: 'relative', height: 185 }}><canvas ref={cfcRef} /></div>
            <div>
              <div style={{ fontSize: 9, color: 'rgba(120,180,240,0.4)', marginBottom: 5, letterSpacing: '.5px', textTransform: 'uppercase', fontWeight: 600 }}>6-Wk Firm Liquidity</div>
              <div style={{ position: 'relative', height: 185 }}><canvas ref={wlcRef} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── 6. Bottom 3-col ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>6-Mo Operating Liquidity</SectionLabel>
            <div style={{ position: 'relative', height: 120 }}><canvas ref={ol6Ref} /></div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>6-Mo Firm Liquidity</SectionLabel>
            <div style={{ position: 'relative', height: 120 }}><canvas ref={fl6Ref} /></div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: '12px 14px' }}>
            <SectionLabel>Debt by Rating</SectionLabel>
            <div style={{ position: 'relative', height: 120 }}><canvas ref={dbcRef} /></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
