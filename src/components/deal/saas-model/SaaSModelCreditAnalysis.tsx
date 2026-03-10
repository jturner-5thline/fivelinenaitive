import { useMemo } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtRatio } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  model: SaaSModelData;
}

// ── Covenant Data ────────────────────────────────────────
interface Covenant {
  name: string;
  threshold: string;
  operator: 'lte' | 'gte';
  thresholdNum: number;
  getValue: (m: SaaSModelData) => number;
  format: (v: number) => string;
}

const COVENANTS: Covenant[] = [
  {
    name: 'Total Leverage (x)', threshold: '≤ 4.5x', operator: 'lte', thresholdNum: 4.5,
    getValue: m => {
      const last = m.months.length - 1;
      const debt = m.balanceSheet.stDebt[last] + m.balanceSheet.ltDebt[last];
      const ebitda = m.ebitda[last] * 12;
      return ebitda > 0 ? debt / ebitda : 0;
    },
    format: v => `${v.toFixed(1)}x`,
  },
  {
    name: 'Senior Leverage (x)', threshold: '≤ 3.5x', operator: 'lte', thresholdNum: 3.5,
    getValue: m => {
      const last = m.months.length - 1;
      const debt = m.balanceSheet.ltDebt[last];
      const ebitda = m.ebitda[last] * 12;
      return ebitda > 0 ? debt / ebitda : 0;
    },
    format: v => `${v.toFixed(1)}x`,
  },
  {
    name: 'Interest Coverage (x)', threshold: '≥ 2.0x', operator: 'gte', thresholdNum: 2.0,
    getValue: m => {
      const last = m.months.length - 1;
      const ebitda = m.ebitda[last] * 12;
      const interest = m.interestExpense[last] * 12;
      return interest > 0 ? ebitda / interest : 0;
    },
    format: v => `${v.toFixed(1)}x`,
  },
  {
    name: 'Fixed Charge Coverage', threshold: '≥ 1.25x', operator: 'gte', thresholdNum: 1.25,
    getValue: m => {
      const last = m.months.length - 1;
      const ebitda = m.ebitda[last] * 12;
      const fixedCharges = (m.interestExpense[last] + m.taxExpense[last]) * 12;
      return fixedCharges > 0 ? ebitda / fixedCharges : 0;
    },
    format: v => `${v.toFixed(2)}x`,
  },
  {
    name: 'Min Liquidity ($M)', threshold: '≥ $50M', operator: 'gte', thresholdNum: 50_000_000,
    getValue: m => {
      const last = m.months.length - 1;
      return m.balanceSheet.cash[last] + m.balanceSheet.marketableSecurities[last];
    },
    format: v => fmtCurrency(v, true),
  },
  {
    name: 'Max Capex ($M)', threshold: '≤ $85M', operator: 'lte', thresholdNum: 85_000_000,
    getValue: m => {
      const last = m.months.length - 1;
      return m.balanceSheet.ppe[last] * 0.1 * 12; // estimate
    },
    format: v => fmtCurrency(v, true),
  },
];

function getStatus(actual: number, threshold: number, op: 'lte' | 'gte'): 'pass' | 'watch' | 'breach' {
  if (actual === 0) return 'watch';
  if (op === 'lte') {
    if (actual <= threshold) return actual <= threshold * 0.9 ? 'pass' : 'watch';
    return 'breach';
  }
  if (actual >= threshold) return actual >= threshold * 1.1 ? 'pass' : 'watch';
  return 'breach';
}

function getHeadroom(actual: number, threshold: number, op: 'lte' | 'gte'): string {
  const diff = op === 'lte' ? threshold - actual : actual - threshold;
  if (Math.abs(threshold) > 1000) return fmtCurrency(diff, true);
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}x`;
}

const STATUS_STYLES = {
  pass: { bg: 'rgba(46,211,183,0.15)', color: '#2ED3B7', dot: '#2ED3B7', label: 'Pass' },
  watch: { bg: 'rgba(255,181,71,0.15)', color: '#FFB547', dot: '#FFB547', label: 'Watch' },
  breach: { bg: 'rgba(249,115,115,0.15)', color: '#F97373', dot: '#F97373', label: 'Breach' },
};

// ── Debt Waterfall Data ──────────────────────────────────
interface DebtLayer {
  label: string;
  color: string;
  getValue: (m: SaaSModelData) => number;
}

const DEBT_LAYERS: DebtLayer[] = [
  { label: 'Revolver', color: '#2ED3B7', getValue: m => m.balanceSheet.stDebt[m.months.length - 1] * 0.3 },
  { label: 'Term Loan A', color: '#4C6FFF', getValue: m => m.balanceSheet.ltDebt[m.months.length - 1] * 0.4 },
  { label: 'Term Loan B', color: 'rgba(76,111,255,0.6)', getValue: m => m.balanceSheet.ltDebt[m.months.length - 1] * 0.4 },
  { label: 'Subordinated', color: '#FFB547', getValue: m => m.balanceSheet.ltDebt[m.months.length - 1] * 0.2 },
];

// ── Sparkline Mini ───────────────────────────────────────
function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 60, h = 25, p = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = p + (i / (data.length - 1)) * (w - p * 2);
    const y = h - p - ((v - min) / range) * (h - p * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#2ED3B7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Main Component ───────────────────────────────────────
export function SaaSModelCreditAnalysis({ model }: Props) {
  const last = model.months.length - 1;

  // Coverage ratio cards
  const ebitdaAnnual = model.ebitda[last] * 12;
  const interestAnnual = model.interestExpense[last] * 12;
  const totalDebt = model.balanceSheet.stDebt[last] + model.balanceSheet.ltDebt[last];

  const coverageCards = [
    { label: 'DSCR', value: interestAnnual > 0 ? ebitdaAnnual / interestAnnual : 0, format: 'x', sparkData: model.ebitda.slice(-12) },
    { label: 'Interest Coverage', value: interestAnnual > 0 ? ebitdaAnnual / interestAnnual : 0, format: 'x', sparkData: model.ebitda.slice(-12) },
    { label: 'Leverage', value: ebitdaAnnual > 0 ? totalDebt / ebitdaAnnual : 0, format: 'x', sparkData: model.balanceSheet.ltDebt.slice(-12) },
    { label: 'FCF Yield', value: ebitdaAnnual > 0 ? ((ebitdaAnnual - interestAnnual) / Math.max(totalDebt, 1)) * 100 : 0, format: '%', sparkData: model.ebitda.slice(-12) },
  ];

  // Debt waterfall values
  const debtValues = DEBT_LAYERS.map(l => ({ ...l, amount: l.getValue(model) }));
  const totalDebtWaterfall = debtValues.reduce((s, d) => s + d.amount, 0);
  const maxDebt = Math.max(totalDebtWaterfall, 1);

  // Amortization schedule (annual)
  const amortData = useMemo(() => {
    const annuals = annualRollup(model, [
      { key: 'debt', source: model.balanceSheet.ltDebt.map((v, i) => v + model.balanceSheet.stDebt[i]), type: 'last' },
      { key: 'interest', source: model.interestExpense, type: 'sum' },
      { key: 'ebitda', source: model.ebitda, type: 'sum' },
    ]);
    let prevBalance = 0;
    return annuals.map((a, i) => {
      const balance = a.values.debt;
      const interest = a.values.interest;
      const principal = i > 0 ? Math.max(0, prevBalance - balance) : 0;
      const total = principal + interest;
      prevBalance = balance;
      return { year: a.year, beginning: i === 0 ? balance : annuals[i - 1].values.debt, principal, interest, total, ending: balance };
    });
  }, [model]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Section A: Covenant Compliance */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Covenant Compliance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30" style={{ backgroundColor: '#141A33' }}>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Covenant</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Threshold</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Actual</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Headroom</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {COVENANTS.map(cov => {
                    const actual = cov.getValue(model);
                    const status = getStatus(actual, cov.thresholdNum, cov.operator);
                    const headroom = getHeadroom(actual, cov.thresholdNum, cov.operator);
                    const s = STATUS_STYLES[status];
                    return (
                      <tr key={cov.name} className="border-b border-border/10">
                        <td className="py-2 px-3 font-medium">{cov.name}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">{cov.threshold}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{cov.format(actual)}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{headroom}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: s.bg, color: s.color }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Section B: Debt Waterfall */}
        <Card className="border-border/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Capital Structure</h3>
            <div className="space-y-3">
              {debtValues.map(layer => {
                const pct = maxDebt > 0 ? (layer.amount / maxDebt) * 100 : 0;
                return (
                  <div key={layer.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{layer.label}</span>
                      <span className="font-mono tabular-nums font-medium">{fmtCurrency(layer.amount, true)}</span>
                    </div>
                    <div className="h-5 rounded-sm overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                      <div
                        className="h-full rounded-sm transition-all duration-500"
                        style={{ width: `${Math.max(pct, 0)}%`, backgroundColor: layer.color }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* Total */}
              <div className="pt-2 border-t border-border/20 flex items-center justify-between text-xs">
                <span className="font-semibold">Total Debt</span>
                <span className="font-mono tabular-nums font-bold">{fmtCurrency(totalDebtWaterfall, true)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section C: Coverage Ratio Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {coverageCards.map(card => (
          <Card key={card.label} className="border-border/30">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{card.label}</p>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold font-mono tabular-nums">
                  {card.format === '%' ? `${card.value.toFixed(1)}%` : `${card.value.toFixed(1)}x`}
                </span>
                <MiniSparkline data={card.sparkData} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Section D: Amortization Schedule */}
      <Card className="border-border/30">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Amortization Schedule</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30" style={{ backgroundColor: '#141A33' }}>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Period</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Beginning Balance</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Principal</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Interest</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Total Payment</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Ending Balance</th>
                </tr>
              </thead>
              <tbody>
                {amortData.map(row => (
                  <tr key={row.year} className="border-b border-border/10 hover:bg-muted/10">
                    <td className="py-2 px-3 font-medium">FY{row.year}E</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtCurrency(row.beginning, true)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtCurrency(row.principal, true)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtCurrency(row.interest, true)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtCurrency(row.total, true)}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums">{fmtCurrency(row.ending, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
