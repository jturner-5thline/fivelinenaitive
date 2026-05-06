import { useEffect, useRef } from 'react';
import ChartJS from 'chart.js/auto';

// ── Chart defaults ──
const setDefaults = () => {
  ChartJS.defaults.color = 'rgba(130,165,190,0.5)';
  ChartJS.defaults.borderColor = 'rgba(255,255,255,0.04)';
  ChartJS.defaults.font.size = 9;
  ChartJS.defaults.font.family = 'system-ui, sans-serif';
};

// ── Colors ──
const CR = 'rgba(40,200,130,0.8)', CF = 'rgba(30,160,100,0.12)';
const CO = 'rgba(80,155,210,0.8)', CA = 'rgba(220,175,45,0.9)';
const CC = 'rgba(160,100,230,0.8)', CDN = 'rgba(220,70,85,0.75)';
const Q = ['Q1','Q2','Q3','Q4'];
const gx: any = { ticks: { color: 'rgba(130,165,190,0.5)', font: { size: 9 } }, grid: { display: false }, border: { display: false } };
const gy: any = { ticks: { color: 'rgba(130,165,190,0.4)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } };
const def: any = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };
const fmtM = (v: number) => '$' + v.toFixed(1) + 'MM';

// ── Data ──
const rrev = [1.18, .76, .81, 1.05], oprev = [.64, .76, .81, .99], arev = [.33, .19, .41, .96];
const rprof = [748.7, 113.8, 129.6, 221.0], opprof = [225.6, 173.8, 186.0, 223.7], aprof = [-40.5, -120.0, 54.4, 553.4];
const ttmr = [2.53, 2.70, 3.15, 3.74], ttmo = [1.99, 2.17, 2.62, 3.20], ttma = [1.69, 1.30, 1.34, 1.88];
const ttmpr = [.33, .46, .47, .64], ttmpo = [.35, .45, .46, .63], ttmpa = [.27, .24, .28, .33];
const gmu = [90, 80, 81, 81], gml = [84, 82, 83, 82], gma = [65, 53, 75, 87];
const ytdr = [1.18, 1.94, 2.75, 3.80], ytdo = [.64, 1.40, 2.21, 3.20], ytda = [.33, .52, .93, 1.88];
const ytdop = [225.6, 399.4, 585.4, 809.1], ytdap = [-40.5, -160.5, -106.2, 447.3];
const p2RevR = [1.2, .8, .8, 1.0], p2RevO = [.6, .8, .8, 1.0], p2RevC = [.35, .41, .81, .99], p2RevA = [.33, .19, .41, .96];
const p2LiqR = [795, 958, 1020, 1190], p2LiqO = [396, 530, 663, 866], p2LiqC = [259, 111, 409, 743], p2LiqAct = [-98, -300, -394, 16];
const p2FundR = [60, 190, 253, 321], p2FundO = [48, 128, 215, 310], p2FundC = [20, 70, 133, 201], p2FundA = [157, 59, 122, 191];
const p2SignR = [33, 66, 99, 144], p2SignO = [33, 66, 99, 144], p2SignC = [0, 25, 99, 144], p2SignA = [22.8, 37.2, 51.6, 66];

// ── Card ──
function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ background: '#182535', border: '1px solid rgba(255,255,255,0.07)', ...style }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(120,190,255,0.15),transparent)' }} />
      {children}
    </div>
  );
}

function Ct({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' as const, color: 'rgba(160,190,210,0.45)', marginBottom: 8 }}>{children}</div>;
}

function Sep() { return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />; }

function Pill({ variant, children }: { variant: 'r' | 'o' | 'c' | 'a'; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    r: { background: 'rgba(40,190,120,0.15)', color: '#4de8a0', border: '1px solid rgba(40,190,120,0.25)' },
    o: { background: 'rgba(60,140,210,0.15)', color: '#7cc8f0', border: '1px solid rgba(60,150,220,0.25)' },
    c: { background: 'rgba(140,90,210,0.15)', color: '#c4a0f0', border: '1px solid rgba(140,100,220,0.25)' },
    a: { background: 'rgba(220,170,40,0.15)', color: '#f0c84a', border: '1px solid rgba(220,175,40,0.25)' },
  };
  return <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, ...s[variant] }}>{children}</span>;
}

// Plan table component
function PlanTable({ title, pill, pillVariant, rows, ttmRows }: {
  title: string; pill: string; pillVariant: 'r' | 'o' | 'c' | 'a';
  rows: { label: string; q1: string; q2: string; q3: string; q4: string; total: string; totalColor?: string; isNeg?: boolean[] }[];
  ttmRows?: { label: string; q1: string; q2: string; q3: string; q4: string }[];
}) {
  return (
    <Card style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Ct>{title}</Ct>
        <Pill variant={pillVariant}>{pill}</Pill>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>{['Metric','Q1','Q2','Q3','Q4','Total'].map(h => (
            <th key={h} style={{ color: 'rgba(140,175,200,0.45)', fontWeight: 700, textAlign: h === 'Metric' ? 'left' : 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(130,165,190,0.55)', fontSize: 10 }}>{r.label}</td>
              {[r.q1, r.q2, r.q3, r.q4].map((v, j) => (
                <td key={j} style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: r.isNeg?.[j] ? '#ff6b7a' : 'rgba(190,215,230,0.7)', fontSize: 11 }}>{v}</td>
              ))}
              <td style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 700, color: r.totalColor || '#e8f4ff', fontSize: 11 }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ttmRows && (
        <div style={{ background: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '7px 10px', marginTop: 8 }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.9px', textTransform: 'uppercase' as const, color: 'rgba(120,160,190,0.38)', marginBottom: 5 }}>TTM</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>{['','Q1','Q2','Q3','Q4',''].map((h, i) => (
                <th key={i} style={{ color: 'rgba(140,175,200,0.45)', fontWeight: 700, textAlign: i === 0 ? 'left' : 'right', padding: '3px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 8 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {ttmRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left', padding: '3px 6px', color: 'rgba(120,160,190,0.5)', fontSize: 9 }}>{r.label}</td>
                  {[r.q1, r.q2, r.q3, r.q4].map((v, j) => (
                    <td key={j} style={{ textAlign: 'right', padding: '3px 6px', color: 'rgba(170,205,225,0.65)', fontSize: 10 }}>{v}</td>
                  ))}
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 700, color: '#e8f4ff' }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Chart hook
function useChart(ref: React.RefObject<HTMLCanvasElement | null>, builder: () => any) {
  useEffect(() => {
    if (!ref.current) return;
    setDefaults();
    const chart = new ChartJS(ref.current, builder());
    return () => chart.destroy();
  }, []);
}

// Chart card
function ChartCard({ title, height = 140, chartRef }: { title: string; height?: number; chartRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <Card style={{ padding: '12px 14px' }}>
      <Ct>{title}</Ct>
      <div style={{ position: 'relative', width: '100%', height }}><canvas ref={chartRef} /></div>
    </Card>
  );
}

// Attainment table
function AttainmentTable() {
  const data = [
    { label: 'Revenue', vals: ['51%','26%','50%','96%','59%'], highlight: [false,false,false,true,true] },
    { label: 'Gross Profit', vals: ['39%','17%','45%','102%','55%'], highlight: [false,false,false,true,true] },
    { label: 'Gross %', vals: ['77%','65%','90%','106%','93%'], highlight: [false,false,false,true,true] },
    { label: 'Op. Profit', vals: ['-18%','-69%','29%','247%','55%'], highlight: [false,false,false,true,true], neg: [true,true,false,false,false] },
    { label: 'YTD Revenue', vals: ['51%','37%','42%','59%','50%'], highlight: [false,false,false,true,true] },
    { label: 'YTD Op. Profit', vals: ['-18%','-40%','-18%','55%','55%'], highlight: [false,false,false,true,true], neg: [true,true,true,false,false] },
  ];
  return (
    <Card style={{ padding: '12px 14px' }}>
      <Ct>Actuals vs Plan Attainment %</Ct>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>{['Metric','Q1','Q2','Q3','Q4','Full Yr'].map(h => (
            <th key={h} style={{ color: 'rgba(140,175,200,0.45)', fontWeight: 700, textAlign: h === 'Metric' ? 'left' : 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(130,165,190,0.55)', fontSize: 10 }}>{r.label}</td>
              {r.vals.map((v, j) => {
                const isNeg = r.neg?.[j];
                const isHl = r.highlight[j];
                return (
                  <td key={j} style={{
                    textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 10,
                    color: isHl ? '#3de89a' : isNeg ? '#ff6b7a' : '#3de89a',
                    fontWeight: isHl ? 700 : 400,
                    background: isHl ? 'rgba(40,210,130,0.1)' : 'transparent',
                    borderRadius: isHl ? 4 : 0,
                  }}>{v}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function BenchmarkForecastsPage() {
  // 10 chart refs
  const qrevRef = useRef<HTMLCanvasElement>(null);
  const ytdrevRef = useRef<HTMLCanvasElement>(null);
  const ttmrevRef = useRef<HTMLCanvasElement>(null);
  const ttmprofRef = useRef<HTMLCanvasElement>(null);
  const gmRef = useRef<HTMLCanvasElement>(null);
  const qprofRef = useRef<HTMLCanvasElement>(null);
  const ytdprofRef = useRef<HTMLCanvasElement>(null);
  const ytdrevcumRef = useRef<HTMLCanvasElement>(null);
  const p2revRef = useRef<HTMLCanvasElement>(null);
  const p2liqRef = useRef<HTMLCanvasElement>(null);
  const p2fundRef = useRef<HTMLCanvasElement>(null);
  const p2signRef = useRef<HTMLCanvasElement>(null);

  const barsCfg = (r: number[], o: number[], a: number[], yCb?: (v: number) => string): any => ({
    type: 'bar', data: { labels: Q, datasets: [
      { data: r, backgroundColor: 'rgba(30,160,100,0.35)', borderColor: CR, borderWidth: 1, borderRadius: 3 },
      { data: o, backgroundColor: 'rgba(50,120,190,0.35)', borderColor: CO, borderWidth: 1, borderRadius: 3 },
      { data: a, backgroundColor: a.map(v => v >= 0 ? 'rgba(200,145,30,0.45)' : 'rgba(210,60,75,0.4)'), borderColor: a.map(v => v >= 0 ? CA : CDN), borderWidth: 1, borderRadius: 3 },
    ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: yCb || fmtM } } } }
  });

  const lineCfg = (d1: number[], d2: number[], d3: number[], yCb?: (v: number) => string): any => ({
    type: 'line', data: { labels: Q, datasets: [
      { data: d1, borderColor: CR, backgroundColor: CF, fill: true, borderWidth: 2, tension: .35, pointRadius: 3 },
      { data: d2, borderColor: CO, backgroundColor: 'transparent', fill: false, borderWidth: 2, tension: .35, pointRadius: 3, borderDash: [5, 3] },
      { data: d3, borderColor: CA, backgroundColor: 'transparent', fill: false, borderWidth: 2.5, tension: .35, pointRadius: 4, pointBackgroundColor: CA },
    ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: yCb || fmtM } } } }
  });

  const bars4Cfg = (d1: number[], d2: number[], d3: number[], d4: number[], yCb: (v: number) => string): any => ({
    type: 'bar', data: { labels: Q, datasets: [
      { data: d1, backgroundColor: 'rgba(30,160,100,0.35)', borderColor: CR, borderWidth: 1, borderRadius: 3 },
      { data: d2, backgroundColor: 'rgba(50,120,190,0.35)', borderColor: CO, borderWidth: 1, borderRadius: 3 },
      { data: d3, backgroundColor: 'rgba(120,70,200,0.3)', borderColor: CC, borderWidth: 1, borderRadius: 3 },
      { data: d4, backgroundColor: d4.map(v => v >= 0 ? 'rgba(200,145,30,0.45)' : 'rgba(210,60,75,0.4)'), borderColor: d4.map(v => v >= 0 ? CA : CDN), borderWidth: 1, borderRadius: 3 },
    ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: yCb } } } }
  });

  useChart(qrevRef, () => barsCfg(rrev, oprev, arev));
  useChart(ytdrevRef, () => lineCfg(ytdr, ytdo, ytda));
  useChart(ttmrevRef, () => lineCfg(ttmr, ttmo, ttma));
  useChart(ttmprofRef, () => lineCfg(ttmpr, ttmpo, ttmpa));
  useChart(gmRef, () => ({
    type: 'line', data: { labels: Q, datasets: [
      { data: gmu, borderColor: CR, backgroundColor: 'rgba(30,160,100,0.08)', fill: '+1', borderWidth: 2, tension: .35, pointRadius: 3 },
      { data: gml, borderColor: CO, backgroundColor: 'transparent', fill: false, borderWidth: 2, tension: .35, pointRadius: 3, borderDash: [4, 3] },
      { data: gma, borderColor: CA, backgroundColor: 'transparent', fill: false, borderWidth: 2.5, tension: .35, pointRadius: 4, pointBackgroundColor: CA },
    ] }, options: { ...def, scales: { x: gx, y: { ...gy, min: 0, max: 100, ticks: { ...gy.ticks, callback: (v: number) => v + '%' } } } }
  }));
  useChart(qprofRef, () => barsCfg(rprof, opprof, aprof, (v: number) => (v < 0 ? '-$' : '+$') + Math.abs(v) + 'K'));
  useChart(ytdprofRef, () => ({
    type: 'line', data: { labels: Q, datasets: [
      { data: ytdop, borderColor: CO, backgroundColor: 'rgba(50,120,190,0.08)', fill: true, borderWidth: 2, tension: .35, pointRadius: 3, borderDash: [5, 3] },
      { data: ytdap, borderColor: CA, backgroundColor: 'transparent', fill: false, borderWidth: 2.5, tension: .35, pointRadius: 4, pointBackgroundColor: CA },
    ] }, options: { ...def, scales: { x: gx, y: { ...gy, ticks: { ...gy.ticks, callback: (v: number) => (v < 0 ? '-$' : '+$') + Math.abs(v).toFixed(0) + 'K' } } } }
  }));
  useChart(ytdrevcumRef, () => lineCfg(ytdr, ytdo, ytda));
  useChart(p2revRef, () => bars4Cfg(p2RevR, p2RevO, p2RevC, p2RevA, (v: number) => '$' + v.toFixed(1) + 'MM'));
  useChart(p2liqRef, () => bars4Cfg(p2LiqR, p2LiqO, p2LiqC, p2LiqAct, (v: number) => (v < 0 ? '-$' : '+$') + Math.abs(v) + 'K'));
  useChart(p2fundRef, () => bars4Cfg(p2FundR, p2FundO, p2FundC, p2FundA, (v: number) => '$' + v + 'MM'));
  useChart(p2signRef, () => bars4Cfg(p2SignR, p2SignO, p2SignC, p2SignA, (v: number) => '$' + v + 'MM'));

  return (
    <div style={{ background: 'transparent', color: '#d0dce8', fontFamily: 'system-ui, sans-serif', padding: '14px 0' }}>
      {/* Header */}
      <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '12px 14px', background: '#1a2d42', borderColor: 'rgba(255,255,255,0.09)' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#e8f4ff', letterSpacing: '-.3px' }}>5th<span style={{ color: '#5ba3d0' }}>Line</span> Benchmark Forecasts</div>
          <div style={{ fontSize: 9, color: 'rgba(140,175,200,0.4)', marginTop: 2, fontStyle: 'italic' }}>Last Updated: 12/1/2025 · By: JT · Actuals Thru: <span style={{ color: '#5ba3d0', fontWeight: 600 }}>Mar-26</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Pill variant="r">Reach Plan</Pill>
          <Pill variant="o">Operating Plan</Pill>
          <Pill variant="c">Conservative</Pill>
          <Pill variant="a">Actuals</Pill>
        </div>
      </Card>

      {/* Main: tables left, charts right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.5fr)', gap: 10, marginBottom: 10 }}>
        {/* Left tables */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PlanTable title="Reach Plan" pill="Best Case" pillVariant="r"
            rows={[
              { label: 'Revenue', q1: '$1.18MM', q2: '$0.76MM', q3: '$0.81MM', q4: '$1.05MM', total: '$3.80MM', totalColor: '#4de8a0' },
              { label: 'Gross Profit', q1: '$1,059.5K', q2: '$609.1K', q3: '$656.4K', q4: '$854.1K', total: '$3.18MM' },
              { label: 'Gross %', q1: '90%', q2: '80%', q3: '81%', q4: '81%', total: '84%' },
              { label: 'Op. Profit', q1: '$748.7K', q2: '$113.8K', q3: '$129.6K', q4: '$221.0K', total: '$1.21MM' },
            ]}
            ttmRows={[
              { label: 'TTM Revenue', q1: '$2.53MM', q2: '$2.70MM', q3: '$3.15MM', q4: '$3.74MM' },
              { label: 'TTM Profit', q1: '$0.33MM', q2: '$0.46MM', q3: '$0.47MM', q4: '$0.64MM' },
            ]}
          />
          <PlanTable title="Operating Plan" pill="Base Case" pillVariant="o"
            rows={[
              { label: 'Revenue', q1: '$0.64MM', q2: '$0.76MM', q3: '$0.81MM', q4: '$0.99MM', total: '$3.20MM', totalColor: '#5ba3d0' },
              { label: 'Gross Profit', q1: '$536.4K', q2: '$620.0K', q3: '$672.9K', q4: '$816.7K', total: '$2.65MM' },
              { label: 'Gross %', q1: '84%', q2: '82%', q3: '83%', q4: '82%', total: '83%' },
              { label: 'Op. Profit', q1: '$225.6K', q2: '$173.8K', q3: '$186.0K', q4: '$223.7K', total: '$809.1K' },
            ]}
            ttmRows={[
              { label: 'TTM Revenue', q1: '$1.99MM', q2: '$2.17MM', q3: '$2.62MM', q4: '$3.20MM' },
              { label: 'TTM Profit', q1: '$0.35MM', q2: '$0.45MM', q3: '$0.46MM', q4: '$0.63MM' },
            ]}
          />
          <PlanTable title="Conservative Plan" pill="Floor Case" pillVariant="c"
            rows={[
              { label: 'Revenue', q1: '$0.35MM', q2: '$0.41MM', q3: '$0.81MM', q4: '$0.99MM', total: '$2.57MM', totalColor: '#c4a0f0' },
              { label: 'Gross Profit', q1: '$262.8K', q2: '$317.3K', q3: '$705.5K', q4: '$867.9K', total: '$2.15MM' },
              { label: 'Gross %', q1: '76%', q2: '76%', q3: '87%', q4: '87%', total: '84%' },
              { label: 'Op. Profit', q1: '-$38.1K', q2: '$20.4K', q3: '$361.6K', q4: '$445.3K', total: '$789.2K', isNeg: [true, false, false, false] },
            ]}
            ttmRows={[
              { label: 'TTM Revenue', q1: '$2.20MM', q2: '$2.03MM', q3: '$2.48MM', q4: '$2.57MM' },
              { label: 'TTM Profit', q1: '$0.29MM', q2: '$0.31MM', q3: '$0.33MM', q4: '$0.46MM' },
            ]}
          />

          {/* Actuals 2026 */}
          <PlanTable title="Actuals 2026" pill="Thru Mar-26" pillVariant="a"
            rows={[
              { label: 'Revenue', q1: '$0.33MM', q2: '$0.19MM', q3: '$0.41MM', q4: '$0.96MM', total: '$1.88MM', totalColor: '#ffc53d' },
              { label: 'Gross Profit', q1: '$210.4K', q2: '$102.6K', q3: '$303.4K', q4: '$836.0K', total: '$1.45MM' },
              { label: 'Gross %', q1: '65%', q2: '53%', q3: '75%', q4: '87%', total: '77%' },
              { label: 'Op. Profit', q1: '-$40.5K', q2: '-$120.0K', q3: '$54.4K', q4: '$553.4K', total: '$447.3K', totalColor: '#3de89a', isNeg: [true, true, false, false] },
            ]}
            ttmRows={[
              { label: 'TTM Revenue', q1: '$1.69MM', q2: '$1.30MM', q3: '$1.34MM', q4: '$1.88MM' },
              { label: 'TTM Profit', q1: '$0.27MM', q2: '$0.24MM', q3: '$0.28MM', q4: '$0.33MM' },
            ]}
          />

          {/* YTD Cumulative sub-section inside Actuals context */}
          <Card style={{ padding: '12px 14px' }}>
            <Ct>YTD Cumulative</Ct>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>{['Metric','Q1','Q2','Q3','Q4','Total'].map(h => (
                  <th key={h} style={{ color: 'rgba(140,175,200,0.45)', fontWeight: 700, textAlign: h === 'Metric' ? 'left' : 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {[
                  { label: 'YTD Revenue', vals: ['$0.33MM','$0.52MM','$0.93MM','$1.88MM','$1.88MM'], totalColor: '#ffc53d' },
                  { label: 'YTD Gross Profit', vals: ['$0.21MM','$0.31MM','$0.62MM','$1.45MM','$1.45MM'] },
                  { label: 'YTD GP%', vals: ['65%','62%','64%','71%','71%'] },
                  { label: 'YTD Op. Profit', vals: ['-$40.5K','-$160.5K','-$106.2K','$447.3K','$447.3K'], totalColor: '#3de89a', neg: [true, true, true, false, false] },
                ].map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(130,165,190,0.55)', fontSize: 10 }}>{r.label}</td>
                    {r.vals.slice(0, 4).map((v, j) => (
                      <td key={j} style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: r.neg?.[j] ? '#ff6b7a' : 'rgba(190,215,230,0.7)', fontSize: 11 }}>{v}</td>
                    ))}
                    <td style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: 700, color: r.totalColor || '#e8f4ff' }}>{r.vals[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <AttainmentTable />
        </div>

        {/* Right charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
          <ChartCard title="Quarterly Revenue" chartRef={qrevRef} />
          <ChartCard title="YTD Revenue" chartRef={ytdrevRef} />
          <ChartCard title="TTM Revenue" chartRef={ttmrevRef} />
          <ChartCard title="TTM Profit" chartRef={ttmprofRef} />
          <ChartCard title="Gross Margin %" chartRef={gmRef} />
          <ChartCard title="Quarterly Profit" chartRef={qprofRef} />
          <ChartCard title="YTD Profit" chartRef={ytdprofRef} />
          <ChartCard title="YTD Revenue — Cumulative" chartRef={ytdrevcumRef} />
          <ChartCard title="Consolidated Revenue — Plans" chartRef={p2revRef} />
          <ChartCard title="Liquidity by Plan" chartRef={p2liqRef} />
          <ChartCard title="Dollars Funded YTD" chartRef={p2fundRef} />
          <ChartCard title="Dollars Signed YTD" chartRef={p2signRef} />
        </div>
      </div>
    </div>
  );
}
