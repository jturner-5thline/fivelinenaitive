import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EnhancedKPICardProps {
  label: string;
  value: number;
  formattedValue: string;
  delta?: number; // percentage change
  deltaLabel?: string; // e.g. "YoY", "MoM"
  sparklineData?: number[];
  icon: React.ElementType;
  className?: string;
}

// Count-up animation hook
function useCountUp(target: number, duration = 600) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef<number>();
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplay(target);
      return;
    }
    hasAnimated.current = true;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(eased * target);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

// Inline SVG sparkline
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;

  const width = 120;
  const height = 40;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  const strokeColor = positive ? '#2ED3B7' : '#F97373';
  const gradientId = `spark-grad-${positive ? 'pos' : 'neg'}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Delta badge pill
function DeltaBadge({ delta, label }: { delta: number; label?: string }) {
  const isPositive = delta > 0;
  const isFlat = delta === 0;

  const bgColor = isFlat
    ? 'rgba(255,181,71,0.15)'
    : isPositive
      ? 'rgba(46,211,183,0.15)'
      : 'rgba(249,115,115,0.15)';

  const textColor = isFlat
    ? '#FFB547'
    : isPositive
      ? '#2ED3B7'
      : '#F97373';

  const arrow = isFlat ? '—' : isPositive ? '↑' : '↓';
  const text = isFlat
    ? 'Stable'
    : `${isPositive ? '+' : ''}${delta.toFixed(1)}%`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {arrow} {text}{label ? ` ${label}` : ''}
    </span>
  );
}

export function EnhancedKPICard({
  label,
  value,
  formattedValue,
  delta,
  deltaLabel,
  sparklineData,
  icon: Icon,
  className,
}: EnhancedKPICardProps) {
  // Animate the displayed value
  const animatedValue = useCountUp(value);

  // Format the animated value the same way as the final formatted value
  // We use the ratio of animated/target to interpolate the display
  const displayValue = value === 0
    ? formattedValue
    : animatedValue === value
      ? formattedValue
      : formatAnimatedValue(animatedValue, value, formattedValue);

  const isPositiveTrend = delta !== undefined ? delta >= 0 : true;

  return (
    <Card className={cn("border-border/30 bg-card transition-all hover:border-[rgba(255,255,255,0.12)]", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground/50" />
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xl font-bold font-mono tabular-nums truncate">{displayValue}</div>
            {delta !== undefined && (
              <div className="mt-1.5">
                <DeltaBadge delta={delta} label={deltaLabel} />
              </div>
            )}
          </div>

          {sparklineData && sparklineData.length >= 2 && (
            <Sparkline data={sparklineData} positive={isPositiveTrend} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Helper: interpolate the formatted value during count-up
function formatAnimatedValue(current: number, target: number, finalFormatted: string): string {
  if (target === 0) return finalFormatted;

  // Detect format type from the final string
  if (finalFormatted.includes('%')) {
    const abs = Math.abs(current);
    const formatted = `${abs.toFixed(1)}%`;
    return current < 0 ? `(${formatted})` : formatted;
  }

  if (finalFormatted.includes('$')) {
    const abs = Math.abs(current);
    let formatted: string;
    if (finalFormatted.includes('B')) formatted = `$${(abs / 1_000_000_000).toFixed(1)}B`;
    else if (finalFormatted.includes('MM')) formatted = `$${(abs / 1_000_000).toFixed(1)}MM`;
    else if (finalFormatted.includes('K')) formatted = `$${(abs / 1_000).toFixed(1)}K`;
    else formatted = `$${abs.toFixed(0)}`;
    return current < 0 ? `(${formatted})` : formatted;
  }

  if (finalFormatted.includes('x')) {
    return `${Math.abs(current).toFixed(1)}x`;
  }

  // Fallback: comma-separated number
  return current.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
