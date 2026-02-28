import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FinancialMetric } from '../types';

interface KPICardProps {
  metric: FinancialMetric;
  onClick?: () => void;
  className?: string;
}

export function KPICard({ metric, onClick, className }: KPICardProps) {
  const TrendIcon = metric.trend === 'up' ? TrendingUp : metric.trend === 'down' ? TrendingDown : Minus;
  const trendColor = metric.trend === 'up' ? 'text-emerald-400' : metric.trend === 'down' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border/30 bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/30 group",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] text-muted-foreground font-medium truncate pr-2">{metric.label}</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Click to see calculation breakdown</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl font-bold font-mono tabular-nums">
          {metric.formatted}
        </span>
        {metric.trend && (
          <span className={cn("flex items-center gap-0.5 text-xs pb-0.5", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            {metric.trendPct != null && `${metric.trendPct > 0 ? '+' : ''}${metric.trendPct}%`}
          </span>
        )}
      </div>
      {metric.confidence != null && metric.confidence < 0.8 && (
        <p className="text-[10px] text-amber-400/70 mt-1">Low confidence ({Math.round(metric.confidence * 100)}%)</p>
      )}
    </button>
  );
}
