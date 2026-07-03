import { useMemo } from 'react';

/**
 * Least-squares linear best-fit trend across an ordered series.
 * Nulls/non-finite entries are treated as gaps but keep their index so the
 * fitted line still spans them.
 */
export function computeLinearTrend(
  values: Array<number | null | undefined>,
): (number | null)[] {
  const pts: Array<{ x: number; y: number }> = [];
  values.forEach((v, i) => {
    if (typeof v === 'number' && Number.isFinite(v)) pts.push({ x: i, y: v });
  });
  if (pts.length < 2) return values.map(() => null);
  const n = pts.length;
  const sumX = pts.reduce((a, p) => a + p.x, 0);
  const sumY = pts.reduce((a, p) => a + p.y, 0);
  const sumXY = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = pts.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return values.map(() => null);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, i) => intercept + slope * i);
}

export function TrendToggleButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title="Toggle trend line"
      className={
        'text-[11px] px-2 py-0.5 rounded-md border border-border/60 transition-colors ' +
        (active
          ? 'bg-primary/20 text-foreground'
          : 'bg-white/[0.04] text-muted-foreground hover:text-foreground')
      }
    >
      Trend
    </button>
  );
}

export function TrendDeltaText({
  values,
  format,
  className = '',
}: {
  values: Array<number | null | undefined>;
  format: (v: number) => string;
  className?: string;
}) {
  const trend = useMemo(() => computeLinearTrend(values), [values]);
  const first = trend.find((v) => v != null) as number | undefined;
  const last = [...trend].reverse().find((v) => v != null) as number | undefined;
  if (first == null || last == null) return null;
  const delta = last - first;
  const pct = first !== 0 ? (delta / first) * 100 : null;
  const positive = delta >= 0;
  const color =
    delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground';
  return (
    <span className={`text-xs font-medium ${color} ${className}`}>
      Trend: {positive ? '+' : ''}
      {pct != null ? `${pct.toFixed(1)}%` : '—'}
      {' / '}
      {positive ? '+' : ''}
      {format(delta)}
      <span className="text-muted-foreground font-normal"> vs start of period</span>
    </span>
  );
}