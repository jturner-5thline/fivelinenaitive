import React from 'react';
import { SortableWidgetGrid, SortableItem } from './SortableWidgetGrid';
import WhatWorkingSections from './WhatWorkingSections';
import {
  PLAN_COLORS,
  PlanToggleLegend,
  usePlanVisibility,
  type TogglePlanKey,
} from './planScenarios';
import { useConsolidatedOperatingProfit } from '@/hooks/useConsolidatedOperatingProfit';
import { QBO_REALM_DEBT } from '@/config/qboEntities';

// Format a dollar amount to the same "$226K / $1.21MM" convention used by
// the surrounding hardcoded plan cells so live actuals visually match.
function fmtCompactUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}MM`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function actualsRowFromQuarters(
  q: { q1: number; q2: number; q3: number; q4: number; total: number },
  isYtd = false,
): { vals: string[]; negCells: boolean[] } {
  const quarters = isYtd
    ? [q.q1, q.q1 + q.q2, q.q1 + q.q2 + q.q3, q.q1 + q.q2 + q.q3 + q.q4]
    : [q.q1, q.q2, q.q3, q.q4];
  const total = q.total;
  return {
    vals: [...quarters.map(fmtCompactUsd), fmtCompactUsd(total)],
    negCells: quarters.map((v) => v < 0),
  };
}

// ── Card ──
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type PlanRow = { plan: string; color: string; q1: string; q2: string; q3: string; q4: string; total: string; totalColor?: string; negCells?: boolean[] };

function MetricGrid({ title, rows }: { title: string; rows: PlanRow[] }) {
  return (
    <Card style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.95)', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{title}</div>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
        {['Plan','Q1-2026','Q2-2026','Q3-2026','Q4-2026','2026'].map((h, i) => (
          <span key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>
      {/* Rows */}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', alignItems: 'center', padding: '4px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontSize: 11 }}>
          <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.95)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            {r.plan}
          </div>
          {[r.q1, r.q2, r.q3, r.q4].map((v, j) => (
            <div key={j} style={{ textAlign: 'right', color: r.negCells?.[j] ? '#ff6b7a' : v === '0%' || v === '$0K' || v === '$0.00MM' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)' }}>{v}</div>
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
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.95)', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 2 }}>
        {headers.map((h, i) => (
          <span key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '105px repeat(5, minmax(0,1fr))', alignItems: 'center', padding: '4px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontSize: 11 }}>
          <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.95)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            {r.plan}
          </div>
          {[r.q1, r.q2, r.q3, r.q4].map((v, j) => (
            <div key={j} style={{ textAlign: 'right', color: r.negCells?.[j] ? '#ff6b7a' : v === '0%' || v === '$0K' || v === '$0.00MM' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.95)' }}>{v}</div>
          ))}
          <div style={{ textAlign: 'right', color: r.totalColor || r.color, fontWeight: 700 }}>{r.total}</div>
        </div>
      ))}
    </Card>
  );
}

export function KeyMetricsPage({ isEditMode = false }: { isEditMode?: boolean } = {}) {
  const { visible, toggle } = usePlanVisibility();
  // Live Actuals for the Operating Profit tiles — pulled from QuickBooks
  // snapshots and summed across every connected entity (Consolidated view).
  const YEAR = new Date().getFullYear();
  const consolidatedOp = useConsolidatedOperatingProfit(YEAR);
  const debtOp = useConsolidatedOperatingProfit(YEAR, {
    realmIds: [QBO_REALM_DEBT],
  });
  const consolidatedActuals = actualsRowFromQuarters(consolidatedOp);
  const consolidatedYtdActuals = actualsRowFromQuarters(consolidatedOp, true);
  const debtActuals = actualsRowFromQuarters(debtOp);

  const planVisible = (plan: string) => {
    if (plan === 'Actuals') return true;
    if (plan === 'Reach' || plan === 'Operating' || plan === 'Conservative') {
      return visible[plan as TogglePlanKey];
    }
    return true;
  };
  const filterRows = (rows: PlanRow[]) => rows.filter(r => planVisible(r.plan));
  const mkRow = (plan: string, color: string, vals: string[], totalColor?: string, negCells?: boolean[]): PlanRow => ({
    plan, color, q1: vals[0], q2: vals[1], q3: vals[2], q4: vals[3], total: vals[4], totalColor, negCells,
  });

  const items: SortableItem[] = [
    { id: 'consolidated-revenue', render: () => <MetricGrid title="Consolidated Revenue" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$1.2MM','$0.8MM','$0.8MM','$1.0MM','$3.8MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$0.6MM','$0.8MM','$0.8MM','$1.0MM','$3.2MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$0.3MM','$0.4MM','$0.8MM','$1.0MM','$2.6MM']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['$0.3MM','$0.2MM','$0.4MM','$1.0MM','$1.9MM']),
    ])} /> },
    { id: 'consolidated-op-profit', render: () => <MetricGrid title="Consolidated Operating Profit" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$749K','$114K','$130K','$221K','$1.21MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$226K','$174K','$186K','$224K','$0.81MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['-$38K','$20K','$362K','$445K','$0.79MM'], undefined, [true]),
      mkRow('Actuals', PLAN_COLORS.Actuals, consolidatedActuals.vals, undefined, consolidatedActuals.negCells),
    ])} /> },
    { id: 'services-revenue', render: () => <MetricGrid title="Services Revenue" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$1.2MM','$0.8MM','$0.8MM','$1.0MM','$3.8MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$0.6MM','$0.8MM','$0.8MM','$1.0MM','$3.2MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$347.2K','$414.9K','$812.4K','$994.0K','$2.6MM']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['$325.1K','$193.8K','$406.3K','$956.3K','$1.9MM']),
    ])} /> },
    { id: 'services-gm', render: () => <MetricGrid title="Services Gross Margin %" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['95%','88%','88%','86%','90%']),
      mkRow('Operating', PLAN_COLORS.Operating, ['92%','89%','90%','88%','89%']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['89%','91%','95%','94%','93%']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['0%','0%','0%','0%','0%']),
    ])} /> },
    { id: 'liquidity', render: () => <MetricGrid title="Liquidity" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$795K','$958K','$1.02MM','$1.19MM','$1.19MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$396K','$530K','$663K','$866K','$866K']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$259K','$111K','$409K','$743K','$743K']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['-$98K','-$300K','-$394K','$16K','$16K'], undefined, [true, true, true]),
    ])} /> },
    { id: 'debt-advisory-op-profit', render: () => <MetricGrid title="Debt Advisory Operating Profit" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$0.9MM','$0.4MM','$0.4MM','$0.5MM','$2.1MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$0.4MM','$0.4MM','$0.4MM','$0.5MM','$1.7MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$0.1MM','$0.2MM','$0.5MM','$0.6MM','$1.4MM']),
      mkRow('Actuals', PLAN_COLORS.Actuals, debtActuals.vals, undefined, debtActuals.negCells),
    ])} /> },
    { id: 'ytd-revenue', render: () => <MetricGrid title="YTD Revenue" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$1.2MM','$1.9MM','$2.7MM','$3.8MM','$3.8MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$0.6MM','$1.4MM','$2.2MM','$3.2MM','$3.2MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$0.3MM','$0.8MM','$1.6MM','$2.6MM','$2.6MM']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['$0.6MM','$1.4MM','$2.2MM','$3.2MM','$3.2MM']),
    ])} /> },
    { id: 'ytd-op-profit', render: () => <MetricGrid title="YTD Operating Profit" rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$0.7MM','$0.9MM','$1.0MM','$1.2MM','$1.2MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$226K','$399K','$585K','$809K','$809K']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['-$38K','-$18K','$344K','$789K','$789K'], undefined, [true, true]),
      mkRow('Actuals', PLAN_COLORS.Actuals, consolidatedYtdActuals.vals, undefined, consolidatedYtdActuals.negCells),
    ])} /> },
    { id: 'dollars-funded-ytd', render: () => <MetricGridShort title="Dollars Funded YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$60MM','$190MM','$253MM','$321MM','$321MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$48MM','$128MM','$215MM','$310MM','$310MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$20MM','$70MM','$133MM','$201MM','$201MM']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['$157MM','$59MM','$122MM','$191MM','$191MM']),
    ])} /> },
    { id: 'deals-closed-ytd', render: () => <MetricGridShort title="Deals Closed YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['1','6','10','15','15']),
      mkRow('Operating', PLAN_COLORS.Operating, ['6','15','23','32','32']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['1','6','10','15','15']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['2','6','10','15','15']),
    ])} /> },
    { id: 'deals-signed-ytd', render: () => <MetricGridShort title="Deals Signed YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['9','18','27','36','36']),
      mkRow('Operating', PLAN_COLORS.Operating, ['9','18','27','36','36']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['0','2','27','36','36']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['3','5','8','10','10']),
    ])} /> },
    { id: 'dollars-signed-ytd', render: () => <MetricGridShort title="Dollars Signed YTD" headers={['Plan','Q1','Q2','Q3','Q4','Total']} rows={filterRows([
      mkRow('Reach', PLAN_COLORS.Reach, ['$33MM','$66MM','$99MM','$144MM','$144MM']),
      mkRow('Operating', PLAN_COLORS.Operating, ['$33MM','$66MM','$99MM','$144MM','$144MM']),
      mkRow('Conservative', PLAN_COLORS.Conservative, ['$0MM','$25MM','$99MM','$144MM','$144MM']),
      mkRow('Actuals', PLAN_COLORS.Actuals, ['$22.8MM','$37.2MM','$51.6MM','$66.0MM','$66MM']),
    ])} /> },
  ];

  return (
    <div style={{ background: 'transparent', color: '#c8e8ff', fontFamily: 'system-ui, sans-serif', padding: '14px 0' }}>
      <PlanToggleLegend visible={visible} onToggle={toggle} />
      <SortableWidgetGrid
        storageKey="insights.keyMetrics.widgetOrder.v1"
        isEditMode={isEditMode}
        items={items}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}
      />
    </div>
  );
}
