import React from 'react';
import { SortableWidgetGrid, SortableItem } from './SortableWidgetGrid';
import WhatWorkingSections from './WhatWorkingSections';

// ── Card ──
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="glass-module relative overflow-hidden rounded-xl" style={{ ...style }}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg,transparent,hsla(213,90%,70%,0.25),transparent)' }} />
      {children}
    </div>
  );
}

function Pill({ variant, children }: { variant: 'r' | 'o' | 'c' | 'a'; children: React.ReactNode }) {
  const s: Record<string, React.CSSProperties> = {
    r: { background: 'rgba(40,190,120,0.15)', color: '#4de8a0', border: '1px solid rgba(40,190,120,0.25)' },
    o: { background: 'rgba(60,140,210,0.15)', color: '#7cc8f0', border: '1px solid rgba(60,150,220,0.25)' },
    c: { background: 'rgba(140,90,210,0.15)', color: '#c4a0f0', border: '1px solid rgba(140,100,220,0.25)' },
    a: { background: 'rgba(220,170,40,0.15)', color: '#f0c84a', border: '1px solid rgba(220,175,40,0.25)' },
  };
  return <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, ...s[variant] }}>{children}</span>;
}

// Legend dot colors
const planColors = {
  Reach: '#4de8a0',
  Operating: '#7cc8f0',
  Conservative: '#c4a0f0',
  Actuals: '#f0c84a',
};

type PlanRow = { plan: string; color: string; q1: string; q2: string; q3: string; q4: string; total: string; totalColor?: string; negCells?: boolean[] };

function MetricGrid({ title, rows }: { title: string; rows: PlanRow[] }) {
  return (
    <Card style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{title}</div>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
        {['Plan','Q1-2026','Q2-2026','Q3-2026','Q4-2026','2026'].map((h, i) => (
          <span key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>
      {/* Rows */}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', alignItems: 'center', padding: '4px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontSize: 11 }}>
          <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            {r.plan}
          </div>
          {[r.q1, r.q2, r.q3, r.q4].map((v, j) => (
            <div key={j} style={{ textAlign: 'right', color: r.negCells?.[j] ? '#ff6b7a' : v === '0%' || v === '$0K' || v === '$0.00MM' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)' }}>{v}</div>
          ))}
          <div style={{ textAlign: 'right', color: r.totalColor || r.color, fontWeight: 700 }}>{r.total}</div>
        </div>
      ))}
    </Card>
  );
}

function MetricGridShort({ title, headers, rows }: { title: string; headers: string[]; rows: PlanRow[] }) {
  return (
    <Card style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
        {headers.map((h, i) => (
          <span key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', alignItems: 'center', padding: '4px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontSize: 11 }}>
          <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            {r.plan}
          </div>
          {[r.q1, r.q2, r.q3, r.q4].map((v, j) => (
            <div key={j} style={{ textAlign: 'right', color: r.negCells?.[j] ? '#ff6b7a' : v === '0%' || v === '$0K' || v === '$0.00MM' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)' }}>{v}</div>
          ))}
          <div style={{ textAlign: 'right', color: r.totalColor || r.color, fontWeight: 700 }}>{r.total}</div>
        </div>
      ))}
    </Card>
  );
}

export function KeyMetricsPage() {
  const mkRow = (plan: string, color: string, vals: string[], totalColor?: string, negCells?: boolean[]): PlanRow => ({
    plan, color, q1: vals[0], q2: vals[1], q3: vals[2], q4: vals[3], total: vals[4], totalColor, negCells,
  });

  const items: SortableItem[] = [
    { id: 'consolidated-revenue', render: () => <MetricGrid title="Consolidated Revenue" rows={[
      mkRow('Reach', '#4de8a0', ['$1.2MM','$0.8MM','$0.8MM','$1.0MM','$3.8MM']),
      mkRow('Operating', '#7cc8f0', ['$0.6MM','$0.8MM','$0.8MM','$1.0MM','$3.2MM']),
      mkRow('Conservative', '#c4a0f0', ['$0.3MM','$0.4MM','$0.8MM','$1.0MM','$2.6MM']),
      mkRow('Actuals', '#f0c84a', ['$0.3MM','$0.2MM','$0.4MM','$1.0MM','$1.9MM']),
    ]} /> },
    { id: 'consolidated-op-profit', render: () => <MetricGrid title="Consolidated Operating Profit" rows={[
      mkRow('Reach', '#4de8a0', ['$749K','$114K','$130K','$221K','$1.21MM']),
      mkRow('Operating', '#7cc8f0', ['$226K','$174K','$186K','$224K','$0.81MM']),
      mkRow('Conservative', '#c4a0f0', ['-$38K','$20K','$362K','$445K','$0.79MM'], undefined, [true]),
      mkRow('Actuals', '#f0c84a', ['$268K','$243K','$278K','$329K','$1.12MM']),
    ]} /> },
    { id: 'services-revenue', render: () => <MetricGrid title="Services Revenue" rows={[
      mkRow('Reach', '#4de8a0', ['$1.2MM','$0.8MM','$0.8MM','$1.0MM','$3.8MM']),
      mkRow('Operating', '#7cc8f0', ['$0.6MM','$0.8MM','$0.8MM','$1.0MM','$3.2MM']),
      mkRow('Conservative', '#c4a0f0', ['$347.2K','$414.9K','$812.4K','$994.0K','$2.6MM']),
      mkRow('Actuals', '#f0c84a', ['$325.1K','$193.8K','$406.3K','$956.3K','$1.9MM']),
    ]} /> },
    { id: 'services-gm', render: () => <MetricGrid title="Services Gross Margin %" rows={[
      mkRow('Reach', '#4de8a0', ['95%','88%','88%','86%','90%']),
      mkRow('Operating', '#7cc8f0', ['92%','89%','90%','88%','89%']),
      mkRow('Conservative', '#c4a0f0', ['89%','91%','95%','94%','93%']),
      mkRow('Actuals', '#f0c84a', ['0%','0%','0%','0%','0%']),
    ]} /> },
    { id: 'liquidity', render: () => <MetricGrid title="Liquidity" rows={[
      mkRow('Reach', '#4de8a0', ['$795K','$958K','$1.02MM','$1.19MM','$1.19MM']),
      mkRow('Operating', '#7cc8f0', ['$396K','$530K','$663K','$866K','$866K']),
      mkRow('Conservative', '#c4a0f0', ['$259K','$111K','$409K','$743K','$743K']),
      mkRow('Actuals', '#f0c84a', ['-$98K','-$300K','-$394K','$16K','$16K'], undefined, [true, true, true]),
    ]} /> },
    { id: 'debt-advisory-op-profit', render: () => <MetricGrid title="Debt Advisory Operating Profit" rows={[
      mkRow('Reach', '#4de8a0', ['$0.9MM','$0.4MM','$0.4MM','$0.5MM','$2.1MM']),
      mkRow('Operating', '#7cc8f0', ['$0.4MM','$0.4MM','$0.4MM','$0.5MM','$1.7MM']),
      mkRow('Conservative', '#c4a0f0', ['$0.1MM','$0.2MM','$0.5MM','$0.6MM','$1.4MM']),
      mkRow('Actuals', '#f0c84a', ['$0K','$0K','$0K','$0K','$0.00MM']),
    ]} /> },
    { id: 'ytd-revenue', render: () => <MetricGrid title="YTD Revenue" rows={[
      mkRow('Reach', '#4de8a0', ['$1.2MM','$1.9MM','$2.7MM','$3.8MM','$3.8MM']),
      mkRow('Operating', '#7cc8f0', ['$0.6MM','$1.4MM','$2.2MM','$3.2MM','$3.2MM']),
      mkRow('Conservative', '#c4a0f0', ['$0.3MM','$0.8MM','$1.6MM','$2.6MM','$2.6MM']),
      mkRow('Actuals', '#f0c84a', ['$0.6MM','$1.4MM','$2.2MM','$3.2MM','$3.2MM']),
    ]} /> },
    { id: 'ytd-op-profit', render: () => <MetricGrid title="YTD Operating Profit" rows={[
      mkRow('Reach', '#4de8a0', ['$0.7MM','$0.9MM','$1.0MM','$1.2MM','$1.2MM']),
      mkRow('Operating', '#7cc8f0', ['$226K','$399K','$585K','$809K','$809K']),
      mkRow('Conservative', '#c4a0f0', ['-$38K','-$18K','$344K','$789K','$789K'], undefined, [true, true]),
      mkRow('Actuals', '#f0c84a', ['-$41K','-$161K','-$106K','$447K','$447K'], undefined, [true, true, true]),
    ]} /> },
    { id: 'dollars-funded-ytd', render: () => <MetricGridShort title="Dollars Funded YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={[
      mkRow('Reach', '#4de8a0', ['$60MM','$190MM','$253MM','$321MM','$321MM']),
      mkRow('Operating', '#7cc8f0', ['$48MM','$128MM','$215MM','$310MM','$310MM']),
      mkRow('Conservative', '#c4a0f0', ['$20MM','$70MM','$133MM','$201MM','$201MM']),
      mkRow('Actuals', '#f0c84a', ['$157MM','$59MM','$122MM','$191MM','$191MM']),
    ]} /> },
    { id: 'deals-closed-ytd', render: () => <MetricGridShort title="Deals Closed YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={[
      mkRow('Reach', '#4de8a0', ['1','6','10','15','15']),
      mkRow('Operating', '#7cc8f0', ['6','15','23','32','32']),
      mkRow('Conservative', '#c4a0f0', ['1','6','10','15','15']),
      mkRow('Actuals', '#f0c84a', ['2','6','10','15','15']),
    ]} /> },
    { id: 'deals-signed-ytd', render: () => <MetricGridShort title="Deals Signed YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={[
      mkRow('Reach', '#4de8a0', ['9','18','27','36','36']),
      mkRow('Operating', '#7cc8f0', ['9','18','27','36','36']),
      mkRow('Conservative', '#c4a0f0', ['0','2','27','36','36']),
      mkRow('Actuals', '#f0c84a', ['3','5','8','10','10']),
    ]} /> },
    { id: 'dollars-signed-ytd', gridColumn: '1 / -1', render: () => <MetricGrid title="Dollars Signed YTD" rows={[
      mkRow('Reach', '#4de8a0', ['$33MM','$66MM','$99MM','$144MM','$144MM']),
      mkRow('Operating', '#7cc8f0', ['$33MM','$66MM','$99MM','$144MM','$144MM']),
      mkRow('Conservative', '#c4a0f0', ['$0MM','$25MM','$99MM','$144MM','$144MM']),
      mkRow('Actuals', '#f0c84a', ['$22.8MM','$37.2MM','$51.6MM','$66.0MM','$66MM']),
    ]} /> },
  ];

  return (
    <div style={{ background: 'transparent', color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', padding: '14px 0' }}>
      {/* Header */}
      <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '12px 14px' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#e8f6ff', letterSpacing: '-.3px' }}>5th<span style={{ color: 'hsl(213,90%,70%)' }}>Line</span> Key Metrics</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 2, fontStyle: 'italic' }}>Parent Co. Total · Services · Debt Advisory · FinServ</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Pill variant="r">Reach Plan</Pill>
          <Pill variant="o">Operating Plan</Pill>
          <Pill variant="c">Conservative</Pill>
          <Pill variant="a">Actuals</Pill>
        </div>
      </Card>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, padding: '0 2px' }}>
        {Object.entries(planColors).map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            {label === 'Actuals' ? 'Actuals' : `${label} Plan`}
          </div>
        ))}
      </div>

      <SortableWidgetGrid
        storageKey="insights.keyMetrics.widgetOrder.v1"
        items={items}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}
      />
    </div>
  );
}
