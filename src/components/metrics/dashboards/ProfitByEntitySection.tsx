import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { useMonthlyEntityProfit, type ProfitMonthBucket } from '@/hooks/useMonthlyEntityProfit';

const formatCurrency = (value: number) => {
  const neg = value < 0;
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) formatted = `$${(abs / 1_000).toFixed(1)}k`;
  else formatted = `$${abs.toFixed(0)}`;
  return neg ? `(${formatted})` : formatted;
};

const formatCurrencyFull = (value: number) => {
  const neg = value < 0;
  const abs = Math.abs(value);
  const str = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
  return neg ? `(${str})` : str;
};

/* Restrained loss/profit palette tuned for dark navy UI */
const LOSS_COLOR = 'hsl(354, 62%, 56%)';     // muted rose, not neon
const LOSS_COLOR_SOFT = 'hsl(354, 62%, 56%, 0.65)';
const PROFIT_COLOR = 'hsl(152, 58%, 52%)';   // restrained green
const ZERO_LINE_COLOR = 'rgba(220, 232, 255, 0.85)';

// Visual surface tokens are now centralized in the shared `.glass-module`
// utility (see src/index.css) and the <GlassCard> primitive. We keep the
// sheen no-op here so legacy `<div style={GLASS_SHEEN_STYLE} />` overlays
// remain harmless (the unified surface already paints its own sheen).
const GLASS_CARD_STYLE: React.CSSProperties = {};
const GLASS_SHEEN_STYLE: React.CSSProperties = { display: 'none' };

export function ProfitBarChart({
  title,
  entityName,
  months,
  isLoading,
  total,
  color,
}: {
  title: string;
  entityName: string;
  months: ProfitMonthBucket[];
  isLoading: boolean;
  total: number;
  color: string;
}) {
  if (isLoading) {
    return (
      <Card className="glass-module">
        <div style={GLASS_SHEEN_STYLE} />
        <CardHeader className="pb-2 relative"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent className="relative"><Skeleton className="h-[260px] w-full" /></CardContent>
      </Card>
    );
  }

  const hasNegative = months.some(m => m.profit < 0);
  const hasPositive = months.some(m => m.profit > 0);
  const isLossQuarter = total < 0;

  // Auto-scale: include 0 in range, pad so bars don't touch edges. When the
  // chart contains both losses and profits, force a *symmetric* domain around
  // zero so that negative bars are visually as tall as positive bars of the
  // same magnitude — this makes "below zero" instantly readable.
  const minVal = Math.min(...months.map(m => m.profit), 0);
  const maxVal = Math.max(...months.map(m => m.profit), 0);
  const mixed = hasNegative && hasPositive;
  let domainMin: number;
  let domainMax: number;
  if (mixed) {
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal), 1000);
    const pad = absMax * 0.18;
    domainMin = -(absMax + pad);
    domainMax = absMax + pad;
  } else {
    const range = Math.max(maxVal - minVal, 1000);
    domainMin = minVal - range * 0.15;
    domainMax = maxVal + range * 0.2;
  }

  return (
    <Card
      style={GLASS_CARD_STYLE}
      className="glass-module glass-module-interactive"
    >
      <div style={GLASS_SHEEN_STYLE} />
      <CardHeader className="pb-3 pt-5 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle
              className="text-[11px] font-medium uppercase tracking-[0.08em]"
              style={{ color: 'rgba(160, 200, 255, 0.50)' }}
            >
              {title}
            </CardTitle>
            <p
              className="text-[11px] mt-1 truncate"
              style={{ color: 'rgba(120, 170, 255, 0.45)' }}
            >
              Operating Profit · {entityName.split(',')[0]}
            </p>
          </div>
          <span
            className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0"
            style={
              isLossQuarter
                ? {
                    background: 'rgba(220, 70, 90, 0.10)',
                    border: '0.5px solid rgba(220, 70, 90, 0.28)',
                    color: LOSS_COLOR,
                  }
                : {
                    background: 'rgba(34, 201, 122, 0.12)',
                    border: '0.5px solid rgba(34, 201, 122, 0.30)',
                    color: '#22c97a',
                  }
            }
          >
            {isLossQuarter ? 'Loss' : 'Profit'}
          </span>
        </div>

        {/* Focal quarter total */}
        <div className="mt-4">
          <p
            className="text-3xl font-semibold tabular-nums leading-none tracking-tight"
            style={{ color: isLossQuarter ? LOSS_COLOR : '#dde8f8' }}
          >
            {formatCurrency(total)}
          </p>
          <p
            className="text-[10px] mt-1.5 uppercase tracking-wider"
            style={{ color: 'rgba(120, 170, 255, 0.40)' }}
          >
            {months.length}-Month Quarter Total
          </p>
        </div>
      </CardHeader>
      <CardContent className="relative pt-1">
        <div style={{ height: 236 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 12, right: 8, left: -10, bottom: 28 }} barCategoryGap="28%">
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="rgba(160, 200, 255, 0.10)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'rgba(160, 200, 255, 0.50)' }}
                axisLine={false}
                tickLine={false}
                height={28}
                dy={8}
              />
              <YAxis
                domain={[domainMin, domainMax]}
                allowDataOverflow
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: 'rgba(160, 200, 255, 0.40)' }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickCount={4}
              />
              <Tooltip
                formatter={(v: number) => [
                  `${v < 0 ? '−' : ''}${formatCurrencyFull(Math.abs(v)).replace(/^\(|\)$/g, '')}`,
                  v < 0 ? 'Loss' : 'Profit',
                ]}
                labelFormatter={(label) => `${label} · ${entityName.split(',')[0]}`}
                contentStyle={{
                  backgroundColor: 'rgba(16, 28, 52, 0.95)',
                  border: '0.5px solid rgba(80, 140, 255, 0.30)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#dde8f8',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(12px)',
                }}
                cursor={{ fill: 'rgba(160, 200, 255, 0.06)' }}
              />
              {/* Zero baseline — strong, solid, full-width so the
                  positive/negative split is unmistakable. */}
              <ReferenceLine
                y={0}
                stroke={ZERO_LINE_COLOR}
                strokeWidth={0.75}
                ifOverflow="extendDomain"
                label={{
                  value: '0',
                  position: 'insideLeft',
                  fill: 'rgba(220, 232, 255, 0.7)',
                  fontSize: 9,
                  offset: 4,
                }}
              />
              <Bar
                dataKey="profit"
                shape={createGlassBarShape({ radius: 4, dataKey: 'profit' })}
                maxBarSize={44}
              >
                {months.map((m, i) => (
                  <Cell
                    key={i}
                    fill={m.profit >= 0 ? PROFIT_COLOR : LOSS_COLOR}
                    fillOpacity={m.profit >= 0 ? 0.95 : 0.92}
                    stroke={m.profit >= 0 ? PROFIT_COLOR : LOSS_COLOR}
                    strokeOpacity={0.6}
                    strokeWidth={0.38}
                  />
                ))}
                <LabelList
                  dataKey="profit"
                  position="top"
                  formatter={(v: number) =>
                    v === 0 ? '' : `${v < 0 ? '−' : '+'}${formatCurrency(Math.abs(v))}`
                  }
                  content={(props: any) => {
                    const { x, y, width, value, height } = props;
                    if (value === 0 || value == null) return null;
                    const isNeg = value < 0;
                    const cx = (x ?? 0) + (width ?? 0) / 2;
                    // Anchor the label *outside* the exposed end of the bar:
                    // above the top for positives, below the bottom for negatives.
                    const cy = isNeg ? (y ?? 0) + (height ?? 0) + 12 : (y ?? 0) - 6;
                    return (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill={isNeg ? LOSS_COLOR : PROFIT_COLOR}
                      >
                        {isNeg ? '−' : '+'}
                        {formatCurrency(Math.abs(value))}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfitByEntitySection({ selectedQuarter }: { selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption }) {
  const debt = useMonthlyEntityProfit('5th Line Capital Advisors, LLC', selectedQuarter.months);
  const finserv = useMonthlyEntityProfit('5th Line Financial Services, LLC', selectedQuarter.months);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Profit by Entity</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {selectedQuarter.label} · QuickBooks operating profit
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProfitBarChart
          title="Debt Profit"
          entityName="5th Line Capital Advisors, LLC"
          months={debt.months}
          isLoading={debt.isLoading}
          total={debt.total}
          color="hsl(var(--primary))"
        />
        <ProfitBarChart
          title="FinServ Profit"
          entityName="5th Line Financial Services, LLC"
          months={finserv.months}
          isLoading={finserv.isLoading}
          total={finserv.total}
          color="hsl(var(--chart-4))"
        />
      </div>
    </div>
  );
}

export function DebtProfitWidget({ selectedQuarter }: { selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption }) {
  const debt = useMonthlyEntityProfit('5th Line Capital Advisors, LLC', selectedQuarter.months);
  return <div className="h-full"><ProfitBarChart title="Debt Profit" entityName="5th Line Capital Advisors, LLC" months={debt.months} isLoading={debt.isLoading} total={debt.total} color="hsl(var(--primary))" /></div>;
}

export function FinServProfitWidget({ selectedQuarter }: { selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption }) {
  const finserv = useMonthlyEntityProfit('5th Line Financial Services, LLC', selectedQuarter.months);
  return <div className="h-full"><ProfitBarChart title="FinServ Profit" entityName="5th Line Financial Services, LLC" months={finserv.months} isLoading={finserv.isLoading} total={finserv.total} color="hsl(var(--chart-4))" /></div>;
}
