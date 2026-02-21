import { AlertTriangle, CheckCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ThresholdAlertBadgeProps {
  value: number;
  thresholds: { warn: number; critical: number; direction: 'above' | 'below' };
  label?: string;
}

export function ThresholdAlertBadge({ value, thresholds, label }: ThresholdAlertBadgeProps) {
  const isAbove = thresholds.direction === 'above';
  const isCritical = isAbove ? value >= thresholds.critical : value <= thresholds.critical;
  const isWarning = isAbove
    ? value >= thresholds.warn && value < thresholds.critical
    : value <= thresholds.warn && value > thresholds.critical;
  const isOk = !isCritical && !isWarning;

  if (isOk) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-success border-success/30 bg-success/10">
        <CheckCircle className="h-3 w-3" />
        {label || 'On Track'}
      </Badge>
    );
  }

  if (isWarning) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-yellow-600 border-yellow-500/30 bg-yellow-500/10 animate-pulse">
        <AlertTriangle className="h-3 w-3" />
        {label || 'Warning'}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30 bg-destructive/10 animate-pulse">
      <AlertTriangle className="h-3 w-3" />
      {label || 'Critical'}
    </Badge>
  );
}
