/**
 * Reusable chart overlay components for /metrics dashboards:
 * - Trendline (linear regression)
 * - Prior-period variance badge
 * - Plan/target reference line
 */
import { ReferenceLine, Line } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ─── Trendline ───

/**
 * Computes linear regression on an array of { x, y } points.
 * Returns slope, intercept, and projected line data.
 */
export function linearRegression(data: { x: number; y: number }[]) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumXX = data.reduce((s, d) => s + d.x * d.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Given chart data with a numeric value key, returns augmented data with a `_trend` field.
 * Usage: add <Line dataKey="_trend" ... /> to your chart.
 */
export function addTrendlineData<T extends Record<string, unknown>>(
  data: T[],
  valueKey: string
): (T & { _trend: number })[] {
  const points = data.map((d, i) => ({ x: i, y: Number(d[valueKey]) || 0 }));
  const { slope, intercept } = linearRegression(points);
  return data.map((d, i) => ({
    ...d,
    _trend: Math.round((slope * i + intercept) * 100) / 100,
  }));
}

/** Recharts Line element for trendline – add alongside your other chart series */
export function TrendlineOverlay({
  dataKey = '_trend',
  color = 'hsl(var(--muted-foreground))',
}: { dataKey?: string; color?: string }) {
  return (
    <Line
      type="monotone"
      dataKey={dataKey}
      stroke={color}
      strokeWidth={0.75}
      strokeDasharray="6 3"
      dot={false}
      activeDot={false}
      name="Trend"
      legendType="none"
    />
  );
}

// ─── Plan / Target Line ───

export interface PlanLineConfig {
  /** The target/plan value */
  value: number;
  /** Label shown on the line */
  label?: string;
  /** Line color */
  color?: string;
}

/**
 * Renders a horizontal reference line for plan/target values.
 * If no value is provided or value is 0, renders nothing.
 */
export function PlanReferenceLine({ value, label, color = 'hsl(var(--chart-4))' }: PlanLineConfig) {
  if (!value) return null;
  return (
    <ReferenceLine
      y={value}
      stroke={color}
      strokeWidth={0.75}
      strokeDasharray="8 4"
      label={{
        value: label || `Plan: ${value.toLocaleString()}`,
        position: 'right',
        fontSize: 10,
        fill: color,
      }}
    />
  );
}

// ─── Period Variance Badge ───

export interface VarianceInfo {
  currentValue: number;
  priorValue: number;
  /** If true, format as currency */
  isCurrency?: boolean;
  label?: string;
}

export function computeVariance(current: number, prior: number) {
  const delta = current - prior;
  const pctChange = prior !== 0 ? (delta / Math.abs(prior)) * 100 : current !== 0 ? 100 : 0;
  return { delta, pctChange };
}

/**
 * Inline badge showing period-to-period variance.
 * Shows both absolute and percentage change.
 */
export function VarianceBadge({ currentValue, priorValue, isCurrency, label }: VarianceInfo) {
  const { delta, pctChange } = computeVariance(currentValue, priorValue);
  const isUp = delta > 0;
  const isFlat = delta === 0;

  const formatDelta = (v: number) => {
    const abs = Math.abs(v);
    if (isCurrency) {
      if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
      return `$${abs.toFixed(0)}`;
    }
    return abs.toLocaleString();
  };

  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {label && <span className="text-muted-foreground">{label}</span>}
      <Badge
        variant="outline"
        className={`gap-1 py-0 px-1.5 text-[10px] font-medium border-0 ${
          isFlat
            ? 'bg-muted/40 text-muted-foreground'
            : isUp
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400'
        }`}
      >
        <Icon className="h-3 w-3" />
        {isUp ? '+' : delta < 0 ? '-' : ''}
        {formatDelta(delta)} ({Math.abs(pctChange).toFixed(1)}%)
      </Badge>
    </div>
  );
}
