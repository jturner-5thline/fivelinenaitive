import { useMemo, useState } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct } from './formatters';
import { annualRollup } from './calculations';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ShieldCheck, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ReferenceLine, Legend,
} from 'recharts';

interface Props {
  model: SaaSModelData;
}

// ── Credit Scoring Engine ────────────────────────────────
interface ScoreFactor {
  name: string;
  category: 'financial' | 'growth' | 'efficiency' | 'leverage';
  weight: number;
  getValue: (m: SaaSModelData) => number;
  score: (v: number) => number; // 0-100
  format: (v: number) => string;
  benchmark: string;
}

const SCORE_FACTORS: ScoreFactor[] = [
  {
    name: 'Gross Margin', category: 'financial', weight: 15,
    getValue: m => m.latestGrossMargin,
    score: v => v >= 75 ? 100 : v >= 65 ? 80 : v >= 50 ? 60 : v >= 35 ? 35 : 15,
    format: v => `${v.toFixed(1)}%`,
    benchmark: '≥ 70%',
  },
  {
    name: 'Revenue Growth (YoY)', category: 'growth', weight: 15,
    getValue: m => m.yoyRevGrowth,
    score: v => v >= 40 ? 100 : v >= 25 ? 85 : v >= 15 ? 65 : v >= 5 ? 40 : 20,
    format: v => `${v.toFixed(1)}%`,
    benchmark: '≥ 25%',
  },
  {
    name: 'Net Revenue Retention', category: 'growth', weight: 12,
    getValue: m => m.netRevenueRetention,
    score: v => v >= 120 ? 100 : v >= 110 ? 85 : v >= 100 ? 65 : v >= 90 ? 40 : 20,
    format: v => `${v.toFixed(0)}%`,
    benchmark: '≥ 110%',
  },
  {
    name: 'Rule of 40', category: 'efficiency', weight: 12,
    getValue: m => {
      const last = m.months.length - 1;
      const ebitdaMargin = m.totalRevenue[last] > 0 ? (m.ebitda[last] / m.totalRevenue[last]) * 100 : 0;
      return m.yoyRevGrowth + ebitdaMargin;
    },
    score: v => v >= 60 ? 100 : v >= 40 ? 85 : v >= 25 ? 60 : v >= 10 ? 35 : 15,
    format: v => `${v.toFixed(0)}%`,
    benchmark: '≥ 40%',
  },
  {
    name: 'DSCR', category: 'leverage', weight: 14,
    getValue: m => {
      const last = m.months.length - 1;
      const ebitda = m.ebitda[last] * 12;
      const interest = m.interestExpense[last] * 12;
      return interest > 0 ? ebitda / interest : 0;
    },
    score: v => v >= 3.0 ? 100 : v >= 2.0 ? 80 : v >= 1.5 ? 60 : v >= 1.0 ? 30 : 10,
    format: v => `${v.toFixed(2)}x`,
    benchmark: '≥ 2.0x',
  },
  {
    name: 'Total Leverage', category: 'leverage', weight: 14,
    getValue: m => {
      const last = m.months.length - 1;
      const debt = m.balanceSheet.stDebt[last] + m.balanceSheet.ltDebt[last];
      const ebitda = m.ebitda[last] * 12;
      return ebitda > 0 ? debt / ebitda : 0;
    },
    score: v => v === 0 ? 50 : v <= 2.0 ? 100 : v <= 3.5 ? 75 : v <= 5.0 ? 45 : 15,
    format: v => `${v.toFixed(1)}x`,
    benchmark: '≤ 3.5x',
  },
  {
    name: 'Current Ratio', category: 'financial', weight: 10,
    getValue: m => m.currentRatio,
    score: v => v >= 2.0 ? 100 : v >= 1.5 ? 80 : v >= 1.0 ? 55 : 25,
    format: v => `${v.toFixed(2)}x`,
    benchmark: '≥ 1.5x',
  },
  {
    name: 'Cash / Total Assets', category: 'financial', weight: 8,
    getValue: m => m.cashTotalAssets * 100,
    score: v => v >= 20 ? 100 : v >= 10 ? 75 : v >= 5 ? 50 : 20,
    format: v => `${v.toFixed(1)}%`,
    benchmark: '≥ 15%',
  },
];

function computeCreditScore(model: SaaSModelData): { total: number; factors: { factor: ScoreFactor; value: number; score: number; weighted: number }[] } {
  const factors = SCORE_FACTORS.map(f => {
    const value = f.getValue(model);
    const score = f.score(value);
    const weighted = (score * f.weight) / 100;
    return { factor: f, value, score, weighted };
  });
  const total = factors.reduce((s, f) => s + f.weighted, 0);
  return { total, factors };
}

function getRatingFromScore(score: number): { grade: string; label: string; color: string; bg: string } {
  if (score >= 85) return { grade: 'AAA', label: 'Prime', color: '#2ED3B7', bg: 'rgba(46,211,183,0.15)' };
  if (score >= 75) return { grade: 'AA', label: 'High Grade', color: '#2ED3B7', bg: 'rgba(46,211,183,0.12)' };
  if (score >= 65) return { grade: 'A', label: 'Upper Medium', color: '#4C6FFF', bg: 'rgba(76,111,255,0.15)' };
  if (score >= 55) return { grade: 'BBB', label: 'Medium Grade', color: '#4C6FFF', bg: 'rgba(76,111,255,0.12)' };
  if (score >= 45) return { grade: 'BB', label: 'Speculative', color: '#FFB547', bg: 'rgba(255,181,71,0.15)' };
  if (score >= 35) return { grade: 'B', label: 'Highly Speculative', color: '#FFB547', bg: 'rgba(255,181,71,0.12)' };
  return { grade: 'CCC', label: 'Substantial Risk', color: '#F97373', bg: 'rgba(249,115,115,0.15)' };
}

// ── Risk Matrix ──────────────────────────────────────────
interface RiskItem {
  category: string;
  risk: string;
  likelihood: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
  mitigant: string;
}

function generateRiskMatrix(model: SaaSModelData): RiskItem[] {
  const last = model.months.length - 1;
  const items: RiskItem[] = [];

  // Revenue concentration
  const recurringPct = model.totalRevenue[last] > 0
    ? (model.revenue.recurring[last] / model.totalRevenue[last]) * 100 : 0;
  items.push({
    category: 'Revenue',
    risk: recurringPct < 70 ? 'Low recurring revenue mix' : 'Customer concentration risk',
    likelihood: recurringPct < 70 ? 'High' : 'Medium',
    impact: 'High',
    mitigant: recurringPct < 70 ? 'Expand subscription offerings' : 'Diversify customer base',
  });

  // Margin risk
  items.push({
    category: 'Profitability',
    risk: model.latestGrossMargin < 60 ? 'Below-market gross margins' : 'Operating leverage risk',
    likelihood: model.latestGrossMargin < 60 ? 'High' : 'Low',
    impact: 'Medium',
    mitigant: model.latestGrossMargin < 60 ? 'Optimize COGS structure' : 'Monitor OpEx scaling',
  });

  // Liquidity
  const cash = model.balanceSheet.cash[last];
  const monthlyBurn = model.ebitda[last] < 0 ? Math.abs(model.ebitda[last]) : 0;
  const runway = monthlyBurn > 0 ? cash / monthlyBurn : 99;
  items.push({
    category: 'Liquidity',
    risk: runway < 12 ? 'Limited cash runway' : 'Working capital management',
    likelihood: runway < 12 ? 'High' : 'Low',
    impact: runway < 12 ? 'High' : 'Low',
    mitigant: runway < 12 ? 'Secure additional credit facilities' : 'Maintain current ratios',
  });

  // Leverage
  const debt = model.balanceSheet.stDebt[last] + model.balanceSheet.ltDebt[last];
  const ebitdaAnn = model.ebitda[last] * 12;
  const leverage = ebitdaAnn > 0 ? debt / ebitdaAnn : 99;
  items.push({
    category: 'Leverage',
    risk: leverage > 4.5 ? 'Excessive debt load' : 'Refinancing risk',
    likelihood: leverage > 4.5 ? 'High' : 'Low',
    impact: 'High',
    mitigant: leverage > 4.5 ? 'Accelerate deleveraging' : 'Stagger debt maturities',
  });

  // Growth
  items.push({
    category: 'Growth',
    risk: model.yoyRevGrowth < 10 ? 'Stalling growth trajectory' : 'Scaling execution risk',
    likelihood: model.yoyRevGrowth < 10 ? 'Medium' : 'Low',
    impact: 'Medium',
    mitigant: model.yoyRevGrowth < 10 ? 'Invest in GTM expansion' : 'Hire ahead of demand curve',
  });

  return items;
}

// ── Covenant Tracking ────────────────────────────────────
interface Covenant {
  name: string;
  threshold: string;
  operator: 'lte' | 'gte';
  thresholdNum: number;
  getValue: (m: SaaSModelData, monthIdx: number) => number;
  format: (v: number) => string;
}

const COVENANTS: Covenant[] = [
  {
    name: 'Total Leverage', threshold: '≤ 4.5x', operator: 'lte', thresholdNum: 4.5,
    getValue: (m, i) => {
      const debt = m.balanceSheet.stDebt[i] + m.balanceSheet.ltDebt[i];
      const ebitda = m.ebitda[i] * 12;
      return ebitda > 0 ? debt / ebitda : 0;
    },
    format: v => `${v.toFixed(1)}x`,
  },
  {
    name: 'Senior Leverage', threshold: '≤ 3.5x', operator: 'lte', thresholdNum: 3.5,
    getValue: (m, i) => {
      const debt = m.balanceSheet.ltDebt[i];
      const ebitda = m.ebitda[i] * 12;
      return ebitda > 0 ? debt / ebitda : 0;
    },
    format: v => `${v.toFixed(1)}x`,
  },
  {
    name: 'Interest Coverage', threshold: '≥ 2.0x', operator: 'gte', thresholdNum: 2.0,
    getValue: (m, i) => {
      const ebitda = m.ebitda[i] * 12;
      const interest = m.interestExpense[i] * 12;
      return interest > 0 ? ebitda / interest : 0;
    },
    format: v => `${v.toFixed(1)}x`,
  },
  {
    name: 'Fixed Charge Coverage', threshold: '≥ 1.25x', operator: 'gte', thresholdNum: 1.25,
    getValue: (m, i) => {
      const ebitda = m.ebitda[i] * 12;
      const fixedCharges = (m.interestExpense[i] + m.taxExpense[i]) * 12;
      return fixedCharges > 0 ? ebitda / fixedCharges : 0;
    },
    format: v => `${v.toFixed(2)}x`,
  },
  {
    name: 'Min Liquidity', threshold: '≥ $50M', operator: 'gte', thresholdNum: 50_000_000,
    getValue: (m, i) => m.balanceSheet.cash[i] + m.balanceSheet.marketableSecurities[i],
    format: v => fmtCurrency(v, true),
  },
  {
    name: 'Max Capex', threshold: '≤ $85M', operator: 'lte', thresholdNum: 85_000_000,
    getValue: (m, i) => m.balanceSheet.ppe[i] * 0.1 * 12,
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

function getTrend(current: number, previous: number, op: 'lte' | 'gte'): 'improving' | 'stable' | 'deteriorating' {
  if (previous === 0 || current === 0) return 'stable';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(change) < 2) return 'stable';
  if (op === 'lte') return current < previous ? 'improving' : 'deteriorating';
  return current > previous ? 'improving' : 'deteriorating';
}

const STATUS_STYLES = {
  pass: { bg: 'rgba(46,211,183,0.15)', color: '#2ED3B7', dot: '#2ED3B7', label: 'Pass' },
  watch: { bg: 'rgba(255,181,71,0.15)', color: '#FFB547', dot: '#FFB547', label: 'Watch' },
  breach: { bg: 'rgba(249,115,115,0.15)', color: '#F97373', dot: '#F97373', label: 'Breach' },
};

const TREND_CONFIG = {
  improving: { icon: TrendingUp, color: '#2ED3B7', label: 'Improving' },
  stable: { icon: Minus, color: '#FFB547', label: 'Stable' },
  deteriorating: { icon: TrendingDown, color: '#F97373', label: 'Worsening' },
};

const LIKELIHOOD_COLORS = {
  Low: { bg: 'rgba(46,211,183,0.15)', color: '#2ED3B7' },
  Medium: { bg: 'rgba(255,181,71,0.15)', color: '#FFB547' },
  High: { bg: 'rgba(249,115,115,0.15)', color: '#F97373' },
};

// ── Mini Sparkline ───────────────────────────────────────
function MiniSparkline({ data, threshold, op }: { data: number[]; threshold?: number; op?: 'lte' | 'gte' }) {
  if (data.length < 2) return null;
  const w = 80, h = 30, p = 2;
  const allVals = threshold != null ? [...data, threshold] : data;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const toY = (v: number) => h - p - ((v - min) / range) * (h - p * 2);
  const pts = data.map((v, i) => {
    const x = p + (i / (data.length - 1)) * (w - p * 2);
    return `${x},${toY(v)}`;
  }).join(' ');

  const thresholdY = threshold != null ? toY(threshold) : null;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      {thresholdY != null && (
        <line x1={p} y1={thresholdY} x2={w - p} y2={thresholdY} stroke="#F97373" strokeWidth={0.75} strokeDasharray="3,2" opacity={0.5} />
      )}
      <polyline points={pts} fill="none" stroke="#4C6FFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Credit Score Gauge (SVG arc) ─────────────────────────
function CreditGauge({ score, rating }: { score: number; rating: ReturnType<typeof getRatingFromScore> }) {
  const radius = 70;
  const strokeWidth = 12;
  const cx = 90, cy = 90;
  const startAngle = 135;
  const endAngle = 405;
  const totalAngle = endAngle - startAngle;
  const progressAngle = startAngle + (score / 100) * totalAngle;

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const arcPath = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={180} height={140} viewBox="0 0 180 140">
        {/* Background arc */}
        <path d={arcPath(startAngle, endAngle)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />
        {/* Score arc */}
        <path d={arcPath(startAngle, progressAngle)} fill="none" stroke={rating.color} strokeWidth={strokeWidth} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${rating.color}40)` }} />
        {/* Score text */}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-foreground" style={{ fontSize: 28, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
          {Math.round(score)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11, fill: rating.color, fontWeight: 600 }}>
          {rating.grade}
        </text>
        <text x={cx} y={cy + 28} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9 }}>
          {rating.label}
        </text>
      </svg>
    </div>
  );
}

// ── Score Bar ─────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Debt Waterfall ───────────────────────────────────────
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

// ── Main Component ───────────────────────────────────────
export function SaaSModelCreditAnalysis({ model }: Props) {
  const [activeView, setActiveView] = useState<'overview' | 'covenants' | 'risks'>('overview');
  const last = model.months.length - 1;
  const prevIdx = Math.max(0, last - 3); // 3 months ago for trend

  const creditResult = useMemo(() => computeCreditScore(model), [model]);
  const rating = getRatingFromScore(creditResult.total);
  const risks = useMemo(() => generateRiskMatrix(model), [model]);

  // Covenant historical data (last 6 points quarterly)
  const covenantHistory = useMemo(() => {
    const indices = [];
    for (let i = Math.max(0, last - 11); i <= last; i += 2) indices.push(i);
    if (indices[indices.length - 1] !== last) indices.push(last);
    return indices;
  }, [last]);

  // Debt waterfall
  const debtValues = DEBT_LAYERS.map(l => ({ ...l, amount: l.getValue(model) }));
  const totalDebtWaterfall = debtValues.reduce((s, d) => s + d.amount, 0);
  const maxDebt = Math.max(totalDebtWaterfall, 1);

  // Amortization
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

  // Summary counts
  const passCount = COVENANTS.filter(c => getStatus(c.getValue(model, last), c.thresholdNum, c.operator) === 'pass').length;
  const watchCount = COVENANTS.filter(c => getStatus(c.getValue(model, last), c.thresholdNum, c.operator) === 'watch').length;
  const breachCount = COVENANTS.filter(c => getStatus(c.getValue(model, last), c.thresholdNum, c.operator) === 'breach').length;
  const highRisks = risks.filter(r => r.likelihood === 'High').length;

  return (
    <div className="space-y-4">
      {/* Top summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border/30 col-span-2 md:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: rating.bg }}>
              <ShieldCheck className="h-5 w-5" style={{ color: rating.color }} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Credit Rating</p>
              <p className="text-lg font-bold font-mono" style={{ color: rating.color }}>{rating.grade}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Score</p>
            <p className="text-xl font-bold font-mono tabular-nums">{Math.round(creditResult.total)}<span className="text-xs text-muted-foreground font-normal">/100</span></p>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Covenants</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium" style={{ color: '#2ED3B7' }}>{passCount} Pass</span>
              {watchCount > 0 && <span className="text-xs font-medium" style={{ color: '#FFB547' }}>{watchCount} Watch</span>}
              {breachCount > 0 && <span className="text-xs font-medium" style={{ color: '#F97373' }}>{breachCount} Breach</span>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Debt</p>
            <p className="text-xl font-bold font-mono tabular-nums">{fmtCurrency(totalDebtWaterfall, true)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/30">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Key Risks</p>
            <div className="flex items-center gap-1.5">
              {highRisks > 0 ? (
                <><AlertTriangle className="h-4 w-4" style={{ color: '#F97373' }} /><span className="text-sm font-medium" style={{ color: '#F97373' }}>{highRisks} High</span></>
              ) : (
                <><CheckCircle2 className="h-4 w-4" style={{ color: '#2ED3B7' }} /><span className="text-sm font-medium" style={{ color: '#2ED3B7' }}>Low</span></>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View switcher */}
      <Tabs value={activeView} onValueChange={v => setActiveView(v as any)}>
        <TabsList className="h-8 bg-muted/30 rounded-sm">
          <TabsTrigger value="overview" className="text-xs rounded-sm h-7">Overview</TabsTrigger>
          <TabsTrigger value="covenants" className="text-xs rounded-sm h-7">Covenants</TabsTrigger>
          <TabsTrigger value="risks" className="text-xs rounded-sm h-7">Risk Matrix</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Credit Score Gauge */}
            <Card className="border-border/30">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-2">Credit Score</h3>
                <CreditGauge score={creditResult.total} rating={rating} />
              </CardContent>
            </Card>

            {/* Score Factors */}
            <Card className="border-border/30 lg:col-span-2">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Scoring Factors</h3>
                <div className="space-y-3">
                  {creditResult.factors.map(({ factor, value, score }) => {
                    const barColor = score >= 70 ? '#2ED3B7' : score >= 45 ? '#FFB547' : '#F97373';
                    return (
                      <div key={factor.name} className="grid grid-cols-[140px_60px_1fr_50px_50px] gap-2 items-center text-xs">
                        <span className="text-muted-foreground truncate">{factor.name}</span>
                        <span className="font-mono tabular-nums text-right">{factor.format(value)}</span>
                        <ScoreBar score={score} color={barColor} />
                        <span className="font-mono tabular-nums text-right text-muted-foreground">{factor.benchmark}</span>
                        <span className="font-mono tabular-nums text-right font-medium">{score}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-border/20 flex justify-between text-xs">
                  <span className="text-muted-foreground">Weighted Total</span>
                  <span className="font-bold font-mono">{Math.round(creditResult.total)} / 100</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Capital Structure + Amortization */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
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
                          <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${Math.max(pct, 0)}%`, backgroundColor: layer.color }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-border/20 flex items-center justify-between text-xs">
                    <span className="font-semibold">Total Debt</span>
                    <span className="font-mono tabular-nums font-bold">{fmtCurrency(totalDebtWaterfall, true)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/30">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Amortization Schedule</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Period</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Begin</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Princ.</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Int.</th>
                        <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortData.map(row => (
                        <tr key={row.year} className="border-b border-border/10 hover:bg-muted/10">
                          <td className="py-1.5 px-2 font-medium">FY{row.year}E</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums">{fmtCurrency(row.beginning, true)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums">{fmtCurrency(row.principal, true)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums">{fmtCurrency(row.interest, true)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums">{fmtCurrency(row.ending, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── COVENANTS ── */}
        <TabsContent value="covenants" className="mt-4 space-y-4">
          {/* Covenant Trend Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {COVENANTS.slice(0, 4).map(cov => {
              const chartData = covenantHistory.map(i => ({
                period: model.months[i]?.label || `M${i}`,
                value: cov.getValue(model, i),
                threshold: cov.thresholdNum < 1000 ? cov.thresholdNum : undefined,
              }));
              const status = getStatus(cov.getValue(model, last), cov.thresholdNum, cov.operator);
              const s = STATUS_STYLES[status];

              return (
                <Card key={cov.name} className="border-border/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold">{cov.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono tabular-nums">{cov.format(cov.getValue(model, last))}</span>
                        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ backgroundColor: s.bg, color: s.color }}>
                          <span className="w-1 h-1 rounded-full" style={{ backgroundColor: s.dot }} />
                          {s.label}
                        </span>
                      </div>
                    </div>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                          <XAxis dataKey="period" tick={{ fontSize: 8 }} />
                          <YAxis tick={{ fontSize: 8 }} domain={['auto', 'auto']} />
                          <RechartsTooltip
                            formatter={(v: number) => [cov.format(v), cov.name]}
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 10 }}
                          />
                          <Line type="monotone" dataKey="value" stroke="#4C6FFF" strokeWidth={1} dot={{ r: 3 }} />
                          {cov.thresholdNum < 1000 && (
                            <ReferenceLine y={cov.thresholdNum} stroke="#F97373" strokeDasharray="4 3" strokeWidth={0.5}
                              label={{ value: cov.threshold, position: 'right', style: { fontSize: 8, fill: '#F97373' } }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Covenant Table */}
          <Card className="border-border/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Covenant Compliance Tracker</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Covenant</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Threshold</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Actual</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Headroom</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Trend</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">History</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COVENANTS.map(cov => {
                      const actual = cov.getValue(model, last);
                      const prev = cov.getValue(model, prevIdx);
                      const status = getStatus(actual, cov.thresholdNum, cov.operator);
                      const headroom = getHeadroom(actual, cov.thresholdNum, cov.operator);
                      const trend = getTrend(actual, prev, cov.operator);
                      const s = STATUS_STYLES[status];
                      const t = TREND_CONFIG[trend];
                      const TrendIcon = t.icon;
                      const historyData = covenantHistory.map(i => cov.getValue(model, i));

                      return (
                        <tr key={cov.name} className="border-b border-border/10 hover:bg-muted/10">
                          <td className="py-2 px-3 font-medium">{cov.name}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">{cov.threshold}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{cov.format(actual)}</td>
                          <td className={cn("py-2 px-3 text-right font-mono tabular-nums",
                            status === 'breach' ? 'text-destructive' : status === 'watch' ? 'text-amber-400' : 'text-emerald-400'
                          )}>{headroom}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: t.color }}>
                              <TrendIcon className="h-3 w-3" />
                            </span>
                          </td>
                          <td className="py-2 px-3 flex justify-center">
                            <MiniSparkline data={historyData} threshold={cov.thresholdNum < 1000 ? cov.thresholdNum : undefined} op={cov.operator} />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: s.bg, color: s.color }}>
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
        </TabsContent>

        {/* ── RISK MATRIX ── */}
        <TabsContent value="risks" className="mt-4">
          <Card className="border-border/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Risk Assessment Matrix</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Category</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Risk Factor</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Likelihood</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">Impact</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Mitigant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risks.map((risk, i) => {
                      const lc = LIKELIHOOD_COLORS[risk.likelihood];
                      const ic = LIKELIHOOD_COLORS[risk.impact];
                      return (
                        <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                              {risk.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium">{risk.risk}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: lc.bg, color: lc.color }}>
                              {risk.likelihood}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: ic.bg, color: ic.color }}>
                              {risk.impact}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">{risk.mitigant}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
