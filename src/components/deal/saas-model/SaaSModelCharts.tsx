import { useMemo, useState, useRef, useCallback, memo } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Download, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

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

function annualLast(arr: number[], months: SaaSModelData['months']): { year: number; value: number }[] {
  const years = [...new Set(months.map(m => m.year))];
  return years.map(year => {
    const indices = months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    return { year, value: arr[indices[indices.length - 1]] || 0 };
  });
}

// ── Color Palette ────────────────────────────────────────
const TEAL = '#2ED3B7';
const TEAL_50 = 'rgba(46,211,183,0.5)';
const TEAL_80 = 'rgba(46,211,183,0.8)';
const TEAL_20 = 'rgba(46,211,183,0.2)';
const RED = '#F97373';
const RED_50 = 'rgba(249,115,115,0.5)';
const RED_20 = 'rgba(249,115,115,0.15)';
const BLUE = '#4C6FFF';
const BLUE_70 = 'rgba(76,111,255,0.7)';
const BLUE_20 = 'rgba(76,111,255,0.15)';
const AMBER = '#FFB547';
const AMBER_70 = 'rgba(255,181,71,0.7)';
const AMBER_20 = 'rgba(255,181,71,0.15)';
const PURPLE = '#A78BFA';
const PURPLE_60 = 'rgba(167,139,250,0.6)';
const TEXT_PRIMARY = '#E8E9ED';
const TEXT_SECONDARY = '#8B8FA3';
const GRID_LINE = 'rgba(255,255,255,0.06)';

// ── Tooltip Hook ─────────────────────────────────────────
function useTooltip() {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const show = useCallback((e: React.MouseEvent<SVGElement>, content: string) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    // Use client coordinates relative to SVG
    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, content });
  }, []);

  const hide = useCallback(() => setTooltip(null), []);

  return { tooltip, show, hide, svgRef };
}

function SvgTooltip({ tooltip, svgWidth }: { tooltip: { x: number; y: number; content: string } | null; svgWidth: number }) {
  if (!tooltip) return null;
  // Position tooltip above the mouse, clamped to viewport
  const tipX = Math.min(Math.max(tooltip.x, 60), svgWidth - 60);
  const tipY = tooltip.y - 12;
  return (
    <div
      className="absolute pointer-events-none z-50 px-2 py-1 rounded text-[10px] font-mono bg-popover border border-border shadow-lg text-popover-foreground whitespace-nowrap"
      style={{ left: tipX, top: tipY, transform: 'translate(-50%, -100%)' }}
    >
      {tooltip.content}
    </div>
  );
}

// ── Chart 1: Revenue Waterfall ──────────────────────────
const RevenueWaterfall = memo(function RevenueWaterfall({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const annuals = annualSum(model.totalRevenue, model.months);
  if (annuals.length < 2) return <EmptyState />;

  const maxVal = Math.max(...annuals.map(a => a.value), 1);
  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const barW = Math.min(60, (w - pad.l - pad.r) / annuals.length - 20);

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
        ))}
        {annuals.map((a, i) => {
          const barH = (a.value / maxVal) * plotH;
          const x = pad.l + (i + 0.5) * ((w - pad.l - pad.r) / annuals.length) - barW / 2;
          const y = pad.t + plotH - barH;
          const prevBarH = i > 0 ? (annuals[i - 1].value / maxVal) * plotH : 0;
          const prevX = i > 0 ? pad.l + (i - 0.5) * ((w - pad.l - pad.r) / annuals.length) + barW / 2 : 0;
          const prevY = pad.t + plotH - prevBarH;
          const yoyGrowth = i > 0 && annuals[i - 1].value > 0
            ? ((a.value - annuals[i - 1].value) / annuals[i - 1].value * 100) : null;

          return (
            <g key={a.year}>
              {i > 0 && (
                <line x1={prevX} y1={prevY} x2={x} y2={prevY} stroke={TEXT_SECONDARY} strokeDasharray="4 3" strokeWidth={1} opacity={0.4} />
              )}
              <rect
                x={x} y={y} width={barW} height={barH} rx={3}
                fill={i === 0 ? TEAL_50 : TEAL_80}
                className="transition-opacity hover:opacity-80 cursor-pointer"
                onMouseMove={(e) => show(e, `FY${a.year}: ${fmtCurrency(a.value)}${yoyGrowth !== null ? ` (${yoyGrowth > 0 ? '+' : ''}${yoyGrowth.toFixed(1)}% YoY)` : ''}`)}
                onMouseLeave={hide}
              />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={10} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                {fmtCurrency(a.value, true)}
              </text>
              {yoyGrowth !== null && (
                <text x={x + barW / 2} y={y - 18} textAnchor="middle" fill={yoyGrowth >= 0 ? TEAL : RED} fontSize={8} fontWeight="600">
                  {yoyGrowth > 0 ? '+' : ''}{yoyGrowth.toFixed(0)}%
                </text>
              )}
              <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{a.year}</text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 2: EBITDA Bridge ──────────────────────────────
function EBITDABridge({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
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
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
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

          const fill = item.isTotal ? (item.value >= 0 ? TEAL_50 : RED_50) : RED_50;
          const nextX = i < items.length - 1
            ? pad.l + (i + 1.5) * ((w - pad.l - pad.r) / items.length) - barW / 2
            : 0;
          const connectorY = pad.t + plotH - (runningTotal / maxVal) * plotH;
          const pctOfRev = revenue > 0 ? (Math.abs(item.value) / revenue * 100).toFixed(1) : '0';

          return (
            <g key={item.label}>
              <rect
                x={x} y={barY} width={barW} height={Math.max(barH, 1)} rx={3} fill={fill}
                className="transition-opacity hover:opacity-80 cursor-pointer"
                onMouseMove={(e) => show(e, `${item.label}: ${fmtCurrency(Math.abs(item.value))} (${pctOfRev}% of Rev)`)}
                onMouseLeave={hide}
              />
              <text x={x + barW / 2} y={barY - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={9} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                {fmtCurrency(Math.abs(item.value), true)}
              </text>
              <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>{item.label}</text>
              {i < items.length - 1 && (
                <line x1={x + barW} y1={connectorY} x2={nextX} y2={connectorY} stroke={TEXT_SECONDARY} strokeDasharray="4 3" strokeWidth={1} opacity={0.4} />
              )}
            </g>
          );
        })}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 3: Margin Trends ──────────────────────────────
function MarginTrends({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const grossData = annualAvg(model.grossMarginPct, model.months);
  const ebitdaMargin = annualAvg(
    model.totalRevenue.map((r, i) => r > 0 ? (model.ebitda[i] / r) * 100 : 0),
    model.months
  );
  const netMargin = annualAvg(
    model.totalRevenue.map((r, i) => r > 0 ? (model.netIncome[i] / r) * 100 : 0),
    model.months
  );

  const years = grossData.map(d => d.year);
  if (years.length < 2) return <EmptyState />;

  const allVals = [...grossData, ...ebitdaMargin, ...netMargin].map(d => d.value);
  const maxY = Math.min(100, Math.max(...allVals, 10) * 1.15);
  const minY = Math.min(0, Math.min(...allVals) * 1.15);

  const w = 500, h = 220, pad = { t: 20, b: 40, l: 40, r: 90 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const toX = (i: number) => pad.l + (i / (years.length - 1)) * plotW;
  const toY = (v: number) => pad.t + plotH - ((v - minY) / (maxY - minY)) * plotH;

  const lines = [
    { data: grossData, color: TEAL, fillColor: TEAL_20, label: 'Gross' },
    { data: ebitdaMargin, color: BLUE, fillColor: BLUE_20, label: 'EBITDA' },
    { data: netMargin, color: AMBER, fillColor: AMBER_20, label: 'Net' },
  ];

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {/* Zero line */}
        {minY < 0 && <line x1={pad.l} x2={w - pad.r} y1={toY(0)} y2={toY(0)} stroke={TEXT_SECONDARY} strokeWidth={0.5} opacity={0.5} />}
        {/* Y-axis grid */}
        {[0, 25, 50, 75, 100].filter(v => v >= minY && v <= maxY).map(v => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={toY(v)} y2={toY(v)} stroke={GRID_LINE} />
            <text x={pad.l - 6} y={toY(v) + 3} textAnchor="end" fill={TEXT_SECONDARY} fontSize={9}>{v}%</text>
          </g>
        ))}
        {years.map((yr, i) => (
          <text key={yr} x={toX(i)} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{yr}</text>
        ))}
        {lines.map(line => {
          const points = line.data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
          const areaPoints = points + ` ${toX(line.data.length - 1)},${toY(0)} ${toX(0)},${toY(0)}`;
          const lastPt = line.data[line.data.length - 1];
          return (
            <g key={line.label}>
              <polygon points={areaPoints} fill={line.fillColor} />
              <polyline points={points} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {line.data.map((d, i) => (
                <circle
                  key={i} cx={toX(i)} cy={toY(d.value)} r={4} fill={line.color}
                  className="cursor-pointer"
                  onMouseMove={(e) => show(e, `${line.label} Margin FY${d.year}: ${d.value.toFixed(1)}%`)}
                  onMouseLeave={hide}
                  stroke="rgba(0,0,0,0.3)" strokeWidth={1}
                />
              ))}
              <text x={toX(line.data.length - 1) + 8} y={toY(lastPt.value) + 4} fill={line.color} fontSize={10} fontWeight={600}>
                {line.label} {lastPt.value.toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 4: Revenue Composition (Stacked Bar) ─────────
function RevenueComposition({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const recurring = annualSum(model.revenue.recurring, model.months);
  const nonRecurring = annualSum(model.revenue.nonRecurring, model.months);
  const other = annualSum(model.revenue.other, model.months);

  const segments = recurring.map((r, i) => ({
    year: r.year,
    recurring: r.value,
    nonRecurring: nonRecurring[i]?.value || 0,
    other: other[i]?.value || 0,
    total: (r.value || 0) + (nonRecurring[i]?.value || 0) + (other[i]?.value || 0),
  }));

  const maxVal = Math.max(...segments.map(s => s.total), 1);
  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const barW = Math.min(60, (w - pad.l - pad.r) / segments.length - 20);

  const segColors = [TEAL_80, BLUE_70, AMBER_70];
  const segLabels = ['Recurring', 'Non-Recurring', 'Other'];

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
        ))}
        {segments.map((s, i) => {
          const x = pad.l + (i + 0.5) * ((w - pad.l - pad.r) / segments.length) - barW / 2;
          const parts = [s.recurring, s.nonRecurring, s.other];
          let cumY = pad.t + plotH;
          const recPct = s.total > 0 ? (s.recurring / s.total * 100).toFixed(0) : '0';

          return (
            <g key={s.year}>
              {parts.map((val, pi) => {
                const segH = (val / maxVal) * plotH;
                cumY -= segH;
                return (
                  <rect
                    key={pi} x={x} y={cumY} width={barW} height={Math.max(segH, 0)} rx={0}
                    fill={segColors[pi]}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onMouseMove={(e) => show(e, `FY${s.year} ${segLabels[pi]}: ${fmtCurrency(val)} (${s.total > 0 ? (val / s.total * 100).toFixed(0) : 0}%)`)}
                    onMouseLeave={hide}
                  />
                );
              })}
              <text x={x + barW / 2} y={cumY - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={9} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                {fmtCurrency(s.total, true)}
              </text>
              <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{s.year}</text>
            </g>
          );
        })}
        {segLabels.map((label, i) => (
          <g key={label} transform={`translate(${w - pad.r - 100}, ${pad.t + i * 16})`}>
            <rect x={0} y={-6} width={10} height={10} rx={2} fill={segColors[i]} />
            <text x={14} y={3} fill={TEXT_SECONDARY} fontSize={9}>{label}</text>
          </g>
        ))}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 5: Cash & Liquidity Trend ─────────────────────
function CashTrend({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const cashData = annualLast(model.balanceSheet.cash, model.months);
  const arData = annualLast(model.balanceSheet.ar, model.months);
  const apData = annualLast(model.balanceSheet.ap, model.months);

  const years = cashData.map(d => d.year);
  if (years.length < 2) return <EmptyState />;

  const allVals = [...cashData, ...arData, ...apData].map(d => d.value);
  const maxY = Math.max(...allVals, 1) * 1.15;
  const minY = 0;

  const w = 500, h = 220, pad = { t: 20, b: 40, l: 60, r: 80 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const toX = (i: number) => pad.l + (i / Math.max(years.length - 1, 1)) * plotW;
  const toY = (v: number) => pad.t + plotH - ((v - minY) / (maxY - minY)) * plotH;

  const lines = [
    { data: cashData, color: TEAL, label: 'Cash' },
    { data: arData, color: BLUE, label: 'A/R' },
    { data: apData, color: AMBER, label: 'A/P' },
  ];

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const val = minY + (maxY - minY) * pct;
          return (
            <g key={pct}>
              <line x1={pad.l} x2={w - pad.r} y1={toY(val)} y2={toY(val)} stroke={GRID_LINE} />
              <text x={pad.l - 6} y={toY(val) + 3} textAnchor="end" fill={TEXT_SECONDARY} fontSize={8} fontFamily="'JetBrains Mono', monospace">
                {fmtCurrency(val, true)}
              </text>
            </g>
          );
        })}
        {years.map((yr, i) => (
          <text key={yr} x={toX(i)} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{yr}</text>
        ))}
        {lines.map(line => {
          if (years.length === 1) {
            return (
              <g key={line.label}>
                <circle cx={toX(0)} cy={toY(line.data[0].value)} r={4} fill={line.color} />
              </g>
            );
          }
          const points = line.data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
          const lastPt = line.data[line.data.length - 1];
          return (
            <g key={line.label}>
              <polyline points={points} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {line.data.map((d, i) => (
                <circle
                  key={i} cx={toX(i)} cy={toY(d.value)} r={4} fill={line.color}
                  className="cursor-pointer"
                  onMouseMove={(e) => show(e, `${line.label} FY${d.year}: ${fmtCurrency(d.value)}`)}
                  onMouseLeave={hide}
                  stroke="rgba(0,0,0,0.3)" strokeWidth={1}
                />
              ))}
              <text x={toX(line.data.length - 1) + 8} y={toY(lastPt.value) + 4} fill={line.color} fontSize={10} fontWeight={600}>
                {line.label}
              </text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 6: Rule of 40 ────────────────────────────────
function RuleOf40({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const years = [...new Set(model.months.map(m => m.year))];
  if (years.length < 2) return <EmptyState />;

  const data = years.map((year, yi) => {
    const indices = model.months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    const rev = indices.reduce((s, i) => s + (model.totalRevenue[i] || 0), 0);
    const prevIndices = yi > 0
      ? model.months.map((m, i) => m.year === years[yi - 1] ? i : -1).filter(i => i >= 0)
      : [];
    const prevRev = prevIndices.reduce((s, i) => s + (model.totalRevenue[i] || 0), 0);
    const growth = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : 0;
    const ebitdaSum = indices.reduce((s, i) => s + (model.ebitda[i] || 0), 0);
    const margin = rev > 0 ? (ebitdaSum / rev) * 100 : 0;
    const score = growth + margin;
    return { year, growth, margin, score };
  });

  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const barW = Math.min(50, (w - pad.l - pad.r) / data.length - 20);
  const maxScore = Math.max(...data.map(d => Math.abs(d.score)), 40) * 1.2;

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {/* 40% threshold line */}
        {(() => {
          const threshY = pad.t + plotH - (40 / maxScore) * plotH;
          return (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={threshY} y2={threshY} stroke={TEAL} strokeDasharray="6 3" strokeWidth={1} opacity={0.6} />
              <text x={w - pad.r + 4} y={threshY + 3} fill={TEAL} fontSize={8} fontWeight="600">40%</text>
            </g>
          );
        })()}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
        ))}
        {data.map((d, i) => {
          const x = pad.l + (i + 0.5) * ((w - pad.l - pad.r) / data.length) - barW / 2;
          const barH = (Math.abs(d.score) / maxScore) * plotH;
          const y = pad.t + plotH - barH;
          const meetsRule = d.score >= 40;

          return (
            <g key={d.year}>
              <rect
                x={x} y={y} width={barW} height={barH} rx={3}
                fill={meetsRule ? TEAL_80 : RED_50}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseMove={(e) => show(e, `FY${d.year} Score: ${d.score.toFixed(1)}% (Growth: ${d.growth.toFixed(1)}% + Margin: ${d.margin.toFixed(1)}%)`)}
                onMouseLeave={hide}
              />
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={meetsRule ? TEAL : RED} fontSize={10} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                {d.score.toFixed(0)}%
              </text>
              <text x={x + barW / 2} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{d.year}</text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 7: Debt Service Coverage ──────────────────────
function DebtCoverage({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const years = [...new Set(model.months.map(m => m.year))];
  if (years.length < 2) return <EmptyState />;

  const data = years.map(year => {
    const indices = model.months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    const ebitda = indices.reduce((s, i) => s + (model.ebitda[i] || 0), 0);
    const interest = indices.reduce((s, i) => s + (model.interestExpense[i] || 0), 0);
    const dscr = interest > 0 ? ebitda / interest : 0;
    const fccr = interest > 0 ? (ebitda + indices.reduce((s, i) => s + (model.interestIncome[i] || 0), 0)) / interest : 0;
    return { year, dscr, fccr, ebitda, interest };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.dscr, d.fccr)), 2) * 1.2;
  const w = 500, h = 220, pad = { t: 30, b: 40, l: 10, r: 10 };
  const plotH = h - pad.t - pad.b;
  const groupW = (w - pad.l - pad.r) / data.length;
  const barW = Math.min(25, groupW / 3);

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {/* 1.25x threshold */}
        {(() => {
          const threshY = pad.t + plotH - (1.25 / maxVal) * plotH;
          return (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={threshY} y2={threshY} stroke={AMBER} strokeDasharray="6 3" strokeWidth={1} opacity={0.6} />
              <text x={w - pad.r + 4} y={threshY + 3} fill={AMBER} fontSize={8} fontWeight="600">1.25x</text>
            </g>
          );
        })()}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={pad.l} x2={w - pad.r} y1={pad.t + plotH * (1 - pct)} y2={pad.t + plotH * (1 - pct)} stroke={GRID_LINE} />
        ))}
        {data.map((d, i) => {
          const cx = pad.l + (i + 0.5) * groupW;
          const dscrH = (d.dscr / maxVal) * plotH;
          const fccrH = (d.fccr / maxVal) * plotH;

          return (
            <g key={d.year}>
              <rect
                x={cx - barW - 2} y={pad.t + plotH - dscrH} width={barW} height={dscrH} rx={3}
                fill={d.dscr >= 1.25 ? TEAL_80 : RED_50}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseMove={(e) => show(e, `FY${d.year} DSCR: ${d.dscr.toFixed(2)}x (EBITDA: ${fmtCurrency(d.ebitda, true)})`)}
                onMouseLeave={hide}
              />
              <rect
                x={cx + 2} y={pad.t + plotH - fccrH} width={barW} height={fccrH} rx={3}
                fill={d.fccr >= 1.25 ? BLUE_70 : PURPLE_60}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseMove={(e) => show(e, `FY${d.year} FCCR: ${d.fccr.toFixed(2)}x`)}
                onMouseLeave={hide}
              />
              <text x={cx - barW / 2 - 2} y={pad.t + plotH - dscrH - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={8} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                {d.dscr.toFixed(1)}x
              </text>
              <text x={cx + barW / 2 + 2} y={pad.t + plotH - fccrH - 6} textAnchor="middle" fill={TEXT_PRIMARY} fontSize={8} fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                {d.fccr.toFixed(1)}x
              </text>
              <text x={cx} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{d.year}</text>
            </g>
          );
        })}
        {/* Legend */}
        <g transform={`translate(${pad.l + 6}, ${pad.t + 6})`}>
          <rect x={0} y={-6} width={10} height={10} rx={2} fill={TEAL_80} />
          <text x={14} y={3} fill={TEXT_SECONDARY} fontSize={9}>DSCR</text>
          <rect x={55} y={-6} width={10} height={10} rx={2} fill={BLUE_70} />
          <text x={69} y={3} fill={TEXT_SECONDARY} fontSize={9}>FCCR</text>
        </g>
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

// ── Chart 8: OpEx Efficiency (Burn Multiple) ────────────
function OpExEfficiency({ model }: Props) {
  const { tooltip, show, hide, svgRef } = useTooltip();
  const years = [...new Set(model.months.map(m => m.year))];
  if (years.length < 2) return <EmptyState />;

  const data = years.map(year => {
    const indices = model.months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    const rev = indices.reduce((s, i) => s + (model.totalRevenue[i] || 0), 0);
    const sm = indices.reduce((s, i) => s + (model.opex.salesMarketing[i] || 0), 0);
    const rd = indices.reduce((s, i) => s + (model.opex.rnd[i] || 0), 0);
    const ga = indices.reduce((s, i) => s + (model.opex.gna[i] || 0), 0) +
               indices.reduce((s, i) => s + (model.opex.salaries[i] || 0), 0) +
               indices.reduce((s, i) => s + (model.opex.professionalFees[i] || 0), 0);
    return {
      year,
      smPct: rev > 0 ? (sm / rev) * 100 : 0,
      rdPct: rev > 0 ? (rd / rev) * 100 : 0,
      gaPct: rev > 0 ? (ga / rev) * 100 : 0,
    };
  });

  const w = 500, h = 220, pad = { t: 20, b: 40, l: 40, r: 90 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const allVals = data.flatMap(d => [d.smPct, d.rdPct, d.gaPct]);
  const maxY = Math.max(...allVals, 10) * 1.15;

  const toX = (i: number) => pad.l + (i / Math.max(years.length - 1, 1)) * plotW;
  const toY = (v: number) => pad.t + plotH - (v / maxY) * plotH;

  const lines = [
    { key: 'smPct' as const, color: TEAL, label: 'S&M' },
    { key: 'rdPct' as const, color: BLUE, label: 'R&D' },
    { key: 'gaPct' as const, color: AMBER, label: 'G&A' },
  ];

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const val = maxY * pct;
          return (
            <g key={pct}>
              <line x1={pad.l} x2={w - pad.r} y1={toY(val)} y2={toY(val)} stroke={GRID_LINE} />
              <text x={pad.l - 6} y={toY(val) + 3} textAnchor="end" fill={TEXT_SECONDARY} fontSize={9}>{val.toFixed(0)}%</text>
            </g>
          );
        })}
        {data.map((d, i) => (
          <text key={d.year} x={toX(i)} y={h - 12} textAnchor="middle" fill={TEXT_SECONDARY} fontSize={9}>FY{d.year}</text>
        ))}
        {lines.map(line => {
          const points = data.map((d, i) => `${toX(i)},${toY(d[line.key])}`).join(' ');
          const lastVal = data[data.length - 1][line.key];
          return (
            <g key={line.label}>
              <polyline points={points} fill="none" stroke={line.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {data.map((d, i) => (
                <circle
                  key={i} cx={toX(i)} cy={toY(d[line.key])} r={4} fill={line.color}
                  className="cursor-pointer"
                  onMouseMove={(e) => show(e, `${line.label} FY${d.year}: ${d[line.key].toFixed(1)}% of Revenue`)}
                  onMouseLeave={hide}
                  stroke="rgba(0,0,0,0.3)" strokeWidth={1}
                />
              ))}
              <text x={toX(data.length - 1) + 8} y={toY(lastVal) + 4} fill={line.color} fontSize={10} fontWeight={600}>
                {line.label} {lastVal.toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>
      <SvgTooltip tooltip={tooltip} svgWidth={w} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-xs text-muted-foreground">No data mapped yet</p>
    </div>
  );
}

// ── Export Chart to Image ────────────────────────────────
async function exportChartToImage(cardEl: HTMLElement, title: string) {
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardEl, {
      backgroundColor: '#1a1a2e',
      scale: 2,
      logging: false,
    });
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success(`Exported "${title}" as PNG`);
  } catch (err) {
    console.error('Export failed:', err);
    toast.error('Failed to export chart');
  }
}

// ── Main Charts Tab ─────────────────────────────────────
type ChartView = 'overview' | 'profitability' | 'liquidity';

export function SaaSModelCharts({ model }: Props) {
  const [view, setView] = useState<ChartView>('overview');
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const chartGroups: Record<ChartView, { title: string; component: JSX.Element }[]> = {
    overview: [
      { title: 'Revenue Waterfall', component: <RevenueWaterfall model={model} /> },
      { title: 'EBITDA Bridge', component: <EBITDABridge model={model} /> },
      { title: 'Revenue Composition', component: <RevenueComposition model={model} /> },
      { title: 'Rule of 40', component: <RuleOf40 model={model} /> },
    ],
    profitability: [
      { title: 'Margin Trends', component: <MarginTrends model={model} /> },
      { title: 'OpEx as % of Revenue', component: <OpExEfficiency model={model} /> },
      { title: 'EBITDA Bridge', component: <EBITDABridge model={model} /> },
      { title: 'Rule of 40', component: <RuleOf40 model={model} /> },
    ],
    liquidity: [
      { title: 'Cash & Working Capital', component: <CashTrend model={model} /> },
      { title: 'Debt Service Coverage', component: <DebtCoverage model={model} /> },
      { title: 'Revenue Waterfall', component: <RevenueWaterfall model={model} /> },
      { title: 'Margin Trends', component: <MarginTrends model={model} /> },
    ],
  };

  const charts = chartGroups[view];

  const handleExportAll = useCallback(async () => {
    toast.promise(
      (async () => {
        for (const chart of charts) {
          const el = chartRefs.current[chart.title];
          if (el) await exportChartToImage(el, chart.title);
        }
      })(),
      { loading: 'Exporting all charts…', success: 'All charts exported', error: 'Export failed' }
    );
  }, [charts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as ChartView)}>
          <TabsList className="h-7 bg-muted/30 rounded-sm">
            <TabsTrigger value="overview" className="text-xs rounded-sm h-6 px-3">Overview</TabsTrigger>
            <TabsTrigger value="profitability" className="text-xs rounded-sm h-6 px-3">Profitability</TabsTrigger>
            <TabsTrigger value="liquidity" className="text-xs rounded-sm h-6 px-3">Liquidity & Debt</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={handleExportAll}>
            <Download className="h-3 w-3" /> Export All
          </Button>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Hover charts for details
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {charts.map(chart => (
          <Card key={chart.title} className="border-border/30 group relative"
            ref={(el) => { chartRefs.current[chart.title] = el; }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{chart.title}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => {
                    const el = chartRefs.current[chart.title];
                    if (el) exportChartToImage(el, chart.title);
                  }}
                  title="Export as PNG"
                >
                  <ImageIcon className="h-3 w-3" />
                </Button>
              </div>
              <div className="h-56">
                {chart.component}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
