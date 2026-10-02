import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function formatTimeInStage(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const days = Math.max(0, Math.floor(ms / 86400000));
  if (days < 28) return `Time in Stage: ${days} ${days === 1 ? 'Day' : 'Days'}`;
  return `Time in Stage: ${Math.floor(days / 7)} Weeks`;
}

export function TimeInStageText({ enteredAt, className }: { enteredAt?: string | null; className?: string }) {
  const label = formatTimeInStage(enteredAt);
  if (!label || !enteredAt) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
          <Clock className="h-3 w-3" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>In current stage since {format(new Date(enteredAt), 'MMM d, yyyy')}</TooltipContent>
    </Tooltip>
  );
}

export function TimeInStageBadge({ enteredAt, className }: { enteredAt?: string | null; className?: string }) {
  const label = formatTimeInStage(enteredAt);
  if (!label || !enteredAt) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground whitespace-nowrap',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Clock className="h-2.5 w-2.5" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>In current stage since {format(new Date(enteredAt), 'MMM d, yyyy')}</TooltipContent>
    </Tooltip>
  );
}
