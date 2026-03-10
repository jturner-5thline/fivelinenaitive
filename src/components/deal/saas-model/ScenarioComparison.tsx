import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import { annualRollup } from './calculations';
import { cn } from '@/lib/utils';

interface ScenarioComparisonProps {
  model: SaaSModelData;
  open: boolean;
  onClose: () => void;
}

interface ScenarioValues {
  label: string;
  // Revenue
  totalRevenue: number;
  recurringRevenue: number;
  nonRecurringRevenue: number;
  otherRevenue: number;
  yoyGrowth: number;
  // Margins
  grossMarginPct: number;
  ebitdaMarginPct: number;
  smPctRev: number;
  rdPctRev: number;
  gaPctRev: number;
  // Unit Economics
  totalCustomers: number;
  ndr: number;
  acv: number;
  // Credit
  borrowingCapacity: number;
  dscr: number;
  leverageRatio: number;
  interestCoverage: number;
}

function buildScenario(model: SaaSModelData, multiplier: number, label: string): ScenarioValues {
  const last = model.months.length - 1;
  const totalRev = model.totalRevenue[last] * 12 * multiplier;
  const recurring = model.revenue.recurring[last] * 12 * multiplier;
  const nonRecurring = model.revenue.nonRecurring[last] * 12 * multiplier;
  const other = model.revenue.other[last] * 12 * multiplier;
  const ebitda = model.ebitda[last] * 12 * multiplier;
  const acv = 120_000;
  const totalDebt = model.balanceSheet.stDebt[last] + model.balanceSheet.ltDebt[last];
  const interestExp = model.interestExpense[last] * 12;

  return {
    label,
    totalRevenue: totalRev,
    recurringRevenue: recurring,
    nonRecurringRevenue: nonRecurring,
    otherRevenue: other,
    yoyGrowth: model.yoyRevGrowth * multiplier,
    grossMarginPct: model.latestGrossMargin * (multiplier > 1 ? 1 + (multiplier - 1) * 0.3 : multiplier < 1 ? 1 - (1 - multiplier) * 0.5 : 1),
    ebitdaMarginPct: totalRev > 0 ? (ebitda / totalRev) * 100 : 0,
    smPctRev: totalRev > 0 ? (model.opex.salesMarketing[last] * 12 / totalRev) * 100 : 0,
    rdPctRev: totalRev > 0 ? (model.opex.rnd[last] * 12 / totalRev) * 100 : 0,
    gaPctRev: totalRev > 0 ? (model.opex.gna[last] * 12 / totalRev) * 100 : 0,
    totalCustomers: Math.round(totalRev / acv),
    ndr: model.netRevenueRetention * (multiplier > 1 ? 1.05 : multiplier < 1 ? 0.92 : 1),
    acv,
    borrowingCapacity: model.borrowingCapacity * multiplier,
    dscr: totalDebt > 0 && interestExp > 0 ? (ebitda / interestExp) : 2.1 * multiplier,
    leverageRatio: ebitda > 0 ? totalDebt / ebitda : 0,
    interestCoverage: interestExp > 0 ? ebitda / interestExp : 0,
  };
}

type SectionRow = {
  label: string;
  key: keyof ScenarioValues;
  format: 'currency' | 'pct' | 'number' | 'ratio';
  higherIsBetter?: boolean;
};

const SECTIONS: { title: string; rows: SectionRow[] }[] = [
  {
    title: 'REVENUE',
    rows: [
      { label: 'Total Revenue', key: 'totalRevenue', format: 'currency', higherIsBetter: true },
      { label: 'Recurring Revenue', key: 'recurringRevenue', format: 'currency', higherIsBetter: true },
      { label: 'Non-Recurring Revenue', key: 'nonRecurringRevenue', format: 'currency' },
      { label: 'Other Revenue', key: 'otherRevenue', format: 'currency' },
      { label: 'Y/Y Growth', key: 'yoyGrowth', format: 'pct', higherIsBetter: true },
    ],
  },
  {
    title: 'MARGINS',
    rows: [
      { label: 'Gross Margin %', key: 'grossMarginPct', format: 'pct', higherIsBetter: true },
      { label: 'EBITDA Margin %', key: 'ebitdaMarginPct', format: 'pct', higherIsBetter: true },
      { label: 'S&M % Rev', key: 'smPctRev', format: 'pct', higherIsBetter: false },
      { label: 'R&D % Rev', key: 'rdPctRev', format: 'pct', higherIsBetter: false },
      { label: 'G&A % Rev', key: 'gaPctRev', format: 'pct', higherIsBetter: false },
    ],
  },
  {
    title: 'UNIT ECONOMICS',
    rows: [
      { label: 'Total Customers', key: 'totalCustomers', format: 'number', higherIsBetter: true },
      { label: 'Net Dollar Retention', key: 'ndr', format: 'pct', higherIsBetter: true },
      { label: 'Avg Contract Value', key: 'acv', format: 'currency' },
    ],
  },
  {
    title: 'CREDIT METRICS',
    rows: [
      { label: 'Borrowing Capacity', key: 'borrowingCapacity', format: 'currency', higherIsBetter: true },
      { label: 'DSCR', key: 'dscr', format: 'ratio', higherIsBetter: true },
      { label: 'Leverage Ratio', key: 'leverageRatio', format: 'ratio', higherIsBetter: false },
      { label: 'Interest Coverage', key: 'interestCoverage', format: 'ratio', higherIsBetter: true },
    ],
  },
];

function formatCell(value: number, format: string): string {
  if (format === 'currency') return fmtCurrency(value, true);
  if (format === 'pct') return fmtPct(value);
  if (format === 'ratio') return `${value.toFixed(1)}x`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Bar chart metrics for the grouped chart
const CHART_METRICS: { key: keyof ScenarioValues; label: string; format: string }[] = [
  { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
  { key: 'recurringRevenue', label: 'EBITDA', format: 'currency' },
  { key: 'borrowingCapacity', label: 'Borrowing Cap.', format: 'currency' },
  { key: 'dscr', label: 'DSCR', format: 'ratio' },
];

export function ScenarioComparison({ model, open, onClose }: ScenarioComparisonProps) {
  const scenarios = useMemo(() => [
    buildScenario(model, 1, 'Base Case'),
    buildScenario(model, 1.15, 'Upside Case'),
    buildScenario(model, 0.8, 'Downside Case'),
  ], [model]);

  const [hoveredBar, setHoveredBar] = useState<{ metric: string; scenario: number; value: number; x: number; y: number } | null>(null);

  if (!open) return null;

  const base = scenarios[0];
  const downside = scenarios[2];

  // Get best/worst across 3 scenarios for coloring
  function getCellStyle(value: number, key: keyof ScenarioValues, higherIsBetter?: boolean) {
    const vals = scenarios.map(s => s[key] as number);
    const best = higherIsBetter ? Math.max(...vals) : Math.min(...vals);
    const worst = higherIsBetter ? Math.min(...vals) : Math.max(...vals);
    if (value === best) return 'font-semibold text-[#2ED3B7]';
    if (value === worst) return 'text-[#F97373]';
    return '';
  }

  // Delta (Base vs Downside)
  function getDelta(key: keyof ScenarioValues): { abs: string; pct: string; positive: boolean } {
    const b = base[key] as number;
    const d = downside[key] as number;
    const diff = b - d;
    const pct = b !== 0 ? (diff / Math.abs(b)) * 100 : 0;
    const format = SECTIONS.flatMap(s => s.rows).find(r => r.key === key)?.format || 'number';
    return {
      abs: formatCell(Math.abs(diff), format),
      pct: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
      positive: diff >= 0,
    };
  }

  // Grouped bar chart dimensions
  const chartWidth = 700;
  const chartHeight = 250;
  const chartPadding = { top: 30, right: 20, bottom: 50, left: 20 };
  const groupCount = CHART_METRICS.length;
  const groupWidth = (chartWidth - chartPadding.left - chartPadding.right) / groupCount;
  const barWidth = groupWidth * 0.2;
  const barGap = 4;

  const SCENARIO_COLORS = ['#2ED3B7', '#4C6FFF', '#FFB547'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(5,8,20,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1100px] max-h-[90vh] overflow-y-auto rounded-xl border"
        style={{ backgroundColor: '#0D1225', borderColor: 'rgba(255,255,255,0.06)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] transition-colors z-10"
          aria-label="Close"
        >
          <X className="h-5 w-5" style={{ color: '#8B8FA3' }} />
        </button>

        <div className="p-6 space-y-6">
          <h2 className="text-lg font-semibold" style={{ color: '#E8E9ED', fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
            Scenario Comparison
          </h2>

          {/* Side-by-Side Table */}
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <table className="w-full text-xs" style={{ fontFamily: "Inter, -apple-system, sans-serif" }}>
              <thead>
                <tr style={{ backgroundColor: '#141A33' }}>
                  <th className="text-left py-2.5 px-4 font-medium" style={{ color: '#8B8FA3', minWidth: 160 }}>Metric</th>
                  {scenarios.map(s => (
                    <th key={s.label} className="text-right py-2.5 px-4 font-medium" style={{ color: '#8B8FA3', minWidth: 120 }}>{s.label}</th>
                  ))}
                  <th className="text-right py-2.5 px-4 font-medium" style={{ color: '#8B8FA3', minWidth: 140 }}>Delta (Base vs Down)</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(section => (
                  <>
                    {/* Section header */}
                    <tr key={section.title}>
                      <td
                        colSpan={5}
                        className="py-2 px-4 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: 'rgba(46,211,183,0.08)', color: '#E8E9ED' }}
                      >
                        {section.title}
                      </td>
                    </tr>
                    {section.rows.map(row => {
                      const delta = getDelta(row.key);
                      return (
                        <tr
                          key={row.key}
                          className="transition-colors"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <td className="py-2 px-4 font-medium" style={{ color: '#8B8FA3' }}>{row.label}</td>
                          {scenarios.map(s => (
                            <td
                              key={s.label}
                              className={cn("py-2 px-4 text-right font-mono tabular-nums", getCellStyle(s[row.key] as number, row.key, row.higherIsBetter))}
                              style={{ color: getCellStyle(s[row.key] as number, row.key, row.higherIsBetter) ? undefined : '#E8E9ED' }}
                            >
                              {formatCell(s[row.key] as number, row.format)}
                            </td>
                          ))}
                          <td className="py-2 px-4 text-right">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium font-mono"
                              style={{
                                backgroundColor: delta.positive ? 'rgba(46,211,183,0.15)' : 'rgba(249,115,115,0.15)',
                                color: delta.positive ? '#2ED3B7' : '#F97373',
                              }}
                            >
                              {delta.abs} ({delta.pct})
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grouped Bar Chart */}
          <div className="rounded-lg border p-6" style={{ backgroundColor: '#0D1225', borderColor: 'rgba(255,255,255,0.06)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: '#E8E9ED' }}>Key Metrics — Scenario Comparison</h3>

            <div className="flex justify-center relative">
              <svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                {/* Bars */}
                {CHART_METRICS.map((metric, gi) => {
                  const vals = scenarios.map(s => s[metric.key] as number);
                  const maxVal = Math.max(...vals.map(Math.abs), 1);

                  return vals.map((val, si) => {
                    const barH = (Math.abs(val) / maxVal) * (chartHeight - chartPadding.top - chartPadding.bottom);
                    const x = chartPadding.left + gi * groupWidth + (groupWidth - (3 * barWidth + 2 * barGap)) / 2 + si * (barWidth + barGap);
                    const y = chartHeight - chartPadding.bottom - barH;

                    return (
                      <g key={`${metric.key}-${si}`}>
                        <rect
                          x={x} y={y} width={barWidth} height={barH}
                          rx={3}
                          fill={SCENARIO_COLORS[si]}
                          opacity={hoveredBar?.metric === metric.key && hoveredBar?.scenario !== si ? 0.3 : 0.85}
                          className="transition-opacity cursor-pointer"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredBar({ metric: metric.key, scenario: si, value: val, x: rect.x + rect.width / 2, y: rect.y });
                          }}
                          onMouseLeave={() => setHoveredBar(null)}
                        />
                        {/* Value label above bar */}
                        <text
                          x={x + barWidth / 2} y={y - 6}
                          textAnchor="middle"
                          fill="#E8E9ED" fontSize={9}
                          fontFamily="'JetBrains Mono', monospace"
                          opacity={0.8}
                        >
                          {formatCell(val, metric.format)}
                        </text>
                      </g>
                    );
                  });
                })}

                {/* X-axis labels */}
                {CHART_METRICS.map((metric, gi) => (
                  <text
                    key={metric.key}
                    x={chartPadding.left + gi * groupWidth + groupWidth / 2}
                    y={chartHeight - 15}
                    textAnchor="middle"
                    fill="#8B8FA3" fontSize={10}
                    fontFamily="Inter, sans-serif"
                  >
                    {metric.label}
                  </text>
                ))}

                {/* Baseline */}
                <line
                  x1={chartPadding.left} x2={chartWidth - chartPadding.right}
                  y1={chartHeight - chartPadding.bottom} y2={chartHeight - chartPadding.bottom}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1}
                />
              </svg>

              {/* Tooltip */}
              {hoveredBar && (
                <div
                  className="absolute pointer-events-none rounded-md px-3 py-1.5 text-xs font-mono"
                  style={{
                    backgroundColor: '#141A33',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#E8E9ED',
                    left: '50%',
                    top: 0,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <span style={{ color: SCENARIO_COLORS[hoveredBar.scenario] }}>
                    {scenarios[hoveredBar.scenario].label}
                  </span>
                  : {formatCell(hoveredBar.value, CHART_METRICS.find(m => m.key === hoveredBar.metric)?.format || 'number')}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4">
              {scenarios.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCENARIO_COLORS[i] }} />
                  <span className="text-[11px]" style={{ color: '#8B8FA3' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
