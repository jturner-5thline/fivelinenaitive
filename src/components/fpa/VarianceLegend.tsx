import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface LegendItem {
  label: string;
  range: string;
  colorClass: string;
  bgClass: string;
}

const VARIANCE_LEVELS: LegendItem[] = [
  { label: 'Favorable', range: '> +5%', colorClass: 'text-emerald-600', bgClass: 'bg-emerald-500' },
  { label: 'On Track', range: '±5%', colorClass: 'text-muted-foreground', bgClass: 'bg-muted-foreground' },
  { label: 'Watch', range: '-5% to -10%', colorClass: 'text-amber-600', bgClass: 'bg-amber-500' },
  { label: 'Alert', range: '< -10%', colorClass: 'text-destructive', bgClass: 'bg-destructive' },
];

interface VarianceLegendProps {
  className?: string;
  compact?: boolean;
}

export function VarianceLegend({ className, compact = false }: VarianceLegendProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        {VARIANCE_LEVELS.map(level => (
          <div key={level.label} className="flex items-center gap-1">
            <div className={cn("h-2 w-2 rounded-full", level.bgClass)} />
            <span className={cn("text-[9px]", level.colorClass)}>{level.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card className={cn("border-border/50", className)}>
      <CardContent className="p-3">
        <p className="text-[10px] font-medium text-muted-foreground mb-2">Variance Legend</p>
        <div className="flex items-center gap-4">
          {VARIANCE_LEVELS.map(level => (
            <div key={level.label} className="flex items-center gap-1.5">
              <div className={cn("h-2.5 w-2.5 rounded-sm", level.bgClass)} />
              <div>
                <span className={cn("text-[10px] font-medium", level.colorClass)}>{level.label}</span>
                <span className="text-[9px] text-muted-foreground ml-1">{level.range}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
