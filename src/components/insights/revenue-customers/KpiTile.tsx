import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';

interface KpiTileProps {
  label: string;
  value: string | ReactNode;
  delta?: number | null;       // -0.12 = -12%
  deltaLabel?: string;          // "vs prior year"
  sparklineData?: { v: number }[];
  sparklineType?: 'line' | 'area';
  loading?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function KpiTile({
  label, value, delta, deltaLabel, sparklineData, sparklineType = 'line',
  loading, onClick, icon, className,
}: KpiTileProps) {
  const deltaDir = delta == null ? 'flat' : delta > 0.001 ? 'up' : delta < -0.001 ? 'down' : 'flat';
  const deltaColor =
    deltaDir === 'up' ? 'text-emerald-500' :
    deltaDir === 'down' ? 'text-rose-500' :
    'text-muted-foreground';
  const DeltaIcon = deltaDir === 'up' ? TrendingUp : deltaDir === 'down' ? TrendingDown : Minus;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'p-4 flex flex-col gap-2 min-h-[124px] relative overflow-hidden',
        onClick && 'cursor-pointer hover:border-primary/40 transition-colors',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium leading-tight">
          {label}
        </span>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      </div>

      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <div className="text-2xl font-semibold tracking-tight tabular-nums leading-tight">{value}</div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto">
        {delta != null && !loading ? (
          <div className={cn('flex items-center gap-1 text-xs font-medium', deltaColor)}>
            <DeltaIcon className="h-3 w-3" />
            <span className="tabular-nums">{(delta * 100).toFixed(1)}%</span>
            {deltaLabel && <span className="text-muted-foreground font-normal">{deltaLabel}</span>}
          </div>
        ) : <span />}

        {sparklineData && sparklineData.length > 1 && !loading && (
          <div className="h-8 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              {sparklineType === 'area' ? (
                <AreaChart data={sparklineData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                  <Area dataKey="v" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" strokeWidth={1.5} isAnimationActive={false} />
                </AreaChart>
              ) : (
                <LineChart data={sparklineData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                  <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}