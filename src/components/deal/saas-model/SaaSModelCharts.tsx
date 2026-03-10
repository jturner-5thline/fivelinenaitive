import { useMemo } from 'react';
import { SaaSModelData } from './types';
import { annualRollup } from './calculations';
import { fmtCurrency } from './formatters';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  model: SaaSModelData;
}

// ── helpers ──────────────────────────────────────────────
function annualSum(arr: number[], months: SaaSModelData['months']): { year: number; value: number }[] {
  const years = [...new Set(months.map(m => m.year))];
  return years.map(year => {
    const indices = months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    return { year, value: indices.reduce((s, i) => s + (arr[i] || 0), 0) };
  });
}

function annualAvg(arr: number[], months: SaaSModelData['months']): { year: number; value: number }[] {
  const years = [...new Set(months.map(m => m.year))];
  return years.map(year => {
    const indices = months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    const vals = indices.map(i => arr[i] || 0);
    return { year, value: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
  });
}

const TEAL = '#2ED3B7';
const TEAL_50 = 'rgba(46,211,183,0.5)';
const TEAL_80 = 'rgba(46,211,183,0.8)';
const RED_50 = 'rgba(249,115,115,0.5)';
const BLUE_70 = 'rgba(76,111,255,0.7)';
const AMBER_70 = 'rgba(255,181,71,0.7)';
const TEXT_PRIMARY = '#E8E9ED';
const TEXT_SECONDARY = '#8B8FA3';
const GRID_LINE = 'rgba(255,255,255,0.06)';

// ── Chart 1: Revenue Waterfall ──────────────────────────
function RevenueWaterfall({ model }: Props) {
  const annuals = annualSum(model.totalRevenue, model.months);
  if (annuals.length < 2) return <EmptyState />;

  const maxVal = Math.max(...annuals.map(a => a.value), 1);
  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const barW = Math.min(60, (w - pad.l - pad.r) / annuals.length - 20);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
        <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
      ))}
      {annuals.map((a, i) => {
        const barH = (a.value / maxVal) * plotH;
        const x = pad.l + (i + 0.5) * ((w - pad.l - pad.r) / annuals.length) - barW / 2;
        const y = pad.t + plotH - barH;

        // Connector dashed line
        const prevBarH = i > 0 ? (annuals[i - 1].value / maxVal) * plotH : 0;
        const prevX = i > 0 ? pad.l + (i - 0.5) * ((w - pad.l - pad.r) / annuals.length) + barW / 2 : 0;
        const prevY = pad.t + plotH - prevBarH;

        return (
          <g key={a.year}>
            {i > 0 && (
              <line x1={prevX} y1={prevY} x2={x} y2={prevY} stroke={TEXT_SECONDARY} strokeDasharray="4 3" strokeWidth={1} opacity={0.4} />
            )}
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={i === 0 ? TEAL_50 : TEAL_80} />
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={10} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              {fmtCurrency(a.value, true)}
            </text>
            <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>
              FY{a.year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Chart 2: EBITDA Bridge ──────────────────────────────
function EBITDABridge({ model }: Props) {
  const lastYear = model.months[model.months.length - 1]?.year;
  const indices = model.months.map((m, i) => m.year === lastYear ? i : -1).filter(i => i >= 0);
  const sum = (arr: number[]) => indices.reduce((s, i) => s + (arr[i] || 0), 0);

  const revenue = sum(model.totalRevenue);
  const cogs = sum(model.totalCOGS);
  const sm = sum(model.opex.salesMarketing);
  const rd = sum(model.opex.rnd);
  const ga = sum(model.opex.gna) + sum(model.opex.salaries) + sum(model.opex.professionalFees);
  const ebitda = sum(model.ebitda);

  const items = [
    { label: 'Revenue', value: revenue, isTotal: true },
    { label: 'COGS', value: -cogs, isTotal: false },
    { label: 'S&M', value: -sm, isTotal: false },
    { label: 'R&D', value: -rd, isTotal: false },
    { label: 'G&A', value: -ga, isTotal: false },
    { label: 'EBITDA', value: ebitda, isTotal: true },
  ];

  const maxVal = Math.max(revenue, 1);
  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const barW = Math.min(55, (w - pad.l - pad.r) / items.length - 15);

  let runningTotal = 0;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
        <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
      ))}
      {items.map((item, i) => {
        const x = pad.l + (i + 0.5) * ((w - pad.l - pad.r) / items.length) - barW / 2;
        let barY: number, barH: number;

        if (item.isTotal) {
          barH = (Math.abs(item.value) / maxVal) * plotH;
          barY = pad.t + plotH - barH;
          runningTotal = item.value;
        } else {
          const prevTotal = runningTotal;
          runningTotal += item.value;
          const topVal = Math.max(prevTotal, runningTotal);
          const botVal = Math.min(prevTotal, runningTotal);
          barY = pad.t + plotH - (topVal / maxVal) * plotH;
          barH = ((topVal - botVal) / maxVal) * plotH;
        }

        const fill = item.isTotal ? TEAL_50 : RED_50;

        // Connector
        const nextX = i < items.length - 1
          ? pad.l + (i + 1.5) * ((w - pad.l - pad.r) / items.length) - barW / 2
          : 0;
        const connectorY = pad.t + plotH - (runningTotal / maxVal) * plotH;

        return (
          <g key={item.label}>
            <rect x={x} y={barY} width={barW} height={Math.max(barH, 1)} rx={3} fill={fill} />
            <text x={x + barW / 2} y={barY - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={9} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              {fmtCurrency(Math.abs(item.value), true)}
            </text>
            <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>
              {item.label}
            </text>
            {i < items.length - 1 && (
              <line x1={x + barW} y1={connectorY} x2={nextX} y2={connectorY} stroke={TEXT_SECONDARY} strokeDasharray="4 3" strokeWidth={1} opacity={0.4} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Chart 3: Margin Trends ──────────────────────────────
function MarginTrends({ model }: Props) {
  const grossData = annualAvg(model.grossMarginPct, model.months);
  const ebitdaMargin = annualAvg(
    model.totalRevenue.map((r, i) => r > 0 ? (model.ebitda[i] / r) * 100 : 0),
    model.months
  );
  const smPct = annualAvg(
    model.totalRevenue.map((r, i) => r > 0 ? (model.opex.salesMarketing[i] / r) * 100 : 0),
    model.months
  );

  const years = grossData.map(d => d.year);
  if (years.length < 2) return <EmptyState />;

  const allVals = [...grossData, ...ebitdaMargin, ...smPct].map(d => d.value);
  const maxY = Math.min(100, Math.max(...allVals, 10) * 1.15);
  const minY = Math.max(0, Math.min(...allVals.filter(v => v > 0)) * 0.8);

  const w = 500, h = 220, pad = { t: 20, b: 40, l: 40, r: 80 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const toX = (i: number) => pad.l + (i / (years.length - 1)) * plotW;
  const toY = (v: number) => pad.t + plotH - ((v - minY) / (maxY - minY)) * plotH;

  const lines = [
    { data: grossData, color: TEAL, label: 'Gross' },
    { data: ebitdaMargin, color: '#4C6FFF', label: 'EBITDA' },
    { data: smPct, color: '#FFB547', label: 'S&M' },
  ];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {/* Y-axis grid */}
      {[0, 25, 50, 75, 100].filter(v => v >= minY && v <= maxY).map(v => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={toY(v)} y2={toY(v)} stroke={GRID_LINE} />
          <text x={pad.l - 6} y={toY(v) + 3} textAnchor="end" fill={TEXT_SECONDARY} fontSize={9}>{v}%</text>
        </g>
      ))}
      {/* X-axis */}
      {years.map((yr, i) => (
        <text key={yr} x={toX(i)} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{yr}</text>
      ))}
      {/* Lines */}
      {lines.map(line => {
        const points = line.data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
        const areaPoints = points + ` ${toX(line.data.length - 1)},${pad.t + plotH} ${toX(0)},${pad.t + plotH}`;
        const lastPt = line.data[line.data.length - 1];
        return (
          <g key={line.label}>
            <polygon points={areaPoints} fill={line.color} opacity={0.06} />
            <polyline points={points} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {line.data.map((d, i) => (
              <circle key={i} cx={toX(i)} cy={toY(d.value)} r={3} fill={line.color} />
            ))}
            {/* Direct label at last point */}
            <text x={toX(line.data.length - 1) + 8} y={toY(lastPt.value) + 4} fill={line.color} fontSize={10} fontWeight={600}>
              {line.label} {lastPt.value.toFixed(1)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Chart 4: Revenue Composition (Stacked Bar) ─────────
function RevenueComposition({ model }: Props) {
  const recurring = annualSum(model.revenue.recurring, model.months);
  const nonRecurring = annualSum(model.revenue.nonRecurring, model.months);
  const other = annualSum(model.revenue.other, model.months);

  // Split recurring into 2 segments for visual interest
  const segments = recurring.map((r, i) => ({
    year: r.year,
    seg1: r.value * 0.7, // "Operational Platform"
    seg2: r.value * 0.3, // "Data Infrastructure"
    seg3: nonRecurring[i]?.value || 0, // "Professional Services"
    seg4: other[i]?.value || 0, // "Product Sales"
    total: (r.value || 0) + (nonRecurring[i]?.value || 0) + (other[i]?.value || 0),
  }));

  const maxVal = Math.max(...segments.map(s => s.total), 1);
  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const barW = Math.min(60, (w - pad.l - pad.r) / segments.length - 20);

  const segColors = [TEAL_80, TEAL_50, BLUE_70, AMBER_70];
  const segLabels = ['Op. Platform', 'Data Infra', 'Prof. Services', 'Product Sales'];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
        <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
      ))}
      {segments.map((s, i) => {
        const x = pad.l + (i + 0.5) * ((w - pad.l - pad.r) / segments.length) - barW / 2;
        const parts = [s.seg1, s.seg2, s.seg3, s.seg4];
        let cumY = pad.t + plotH;

        return (
          <g key={s.year}>
            {parts.map((val, pi) => {
              const segH = (val / maxVal) * plotH;
              cumY -= segH;
              return (
                <rect key={pi} x={x} y={cumY} width={barW} height={Math.max(segH, 0)} rx={pi === parts.length - 1 ? 0 : 0}
                  fill={segColors[pi]} />
              );
            })}
            {/* Total label */}
            <text x={x + barW / 2} y={cumY - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={9} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
              {fmtCurrency(s.total, true)}
            </text>
            <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{s.year}</text>
          </g>
        );
      })}
      {/* Legend */}
      {segLabels.map((label, i) => (
        <g key={label} transform={`translate(${w - pad.r - 120}, ${pad.t + i * 16})`}>
          <rect x={0} y={-6} width={10} height={10} rx={2} fill={segColors[i]} />
          <text x={14} y={3} fill={TEXT_SECONDARY} fontSize={9}>{label}</text>
        </g>
      ))}
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-xs" style={{ color: TEXT_SECONDARY }}>No data mapped yet</p>
    </div>
  );
}

// ── Main Charts Tab ─────────────────────────────────────
export function SaaSModelCharts({ model }: Props) {
  const charts = [
    { title: 'Revenue Waterfall', component: <RevenueWaterfall model={model} /> },
    { title: 'EBITDA Bridge', component: <EBITDABridge model={model} /> },
    { title: 'Margin Trends', component: <MarginTrends model={model} /> },
    { title: 'Revenue Composition', component: <RevenueComposition model={model} /> },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {charts.map(chart => (
        <Card key={chart.title} className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">{chart.title}</h3>
            <div className="h-56">
              {chart.component}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
