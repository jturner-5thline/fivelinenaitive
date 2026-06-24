import { Clock } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';

interface LastContactChipProps {
  /** ISO timestamp string, Date, or null/undefined when there's been no activity yet. */
  value: string | Date | null | undefined;
  /** "long" = "Jun 14, 2026 · 10 days ago", "short" = "10d ago". */
  variant?: 'long' | 'short';
  className?: string;
  /** Hide the leading clock icon. */
  hideIcon?: boolean;
  /** Custom label. Defaults to "Last contact". */
  label?: string;
}

/** Team-wide "last contact at" chip — reused across contact detail, CRM list,
 *  deal contacts panel, and the approval queue. */
export function LastContactChip({
  value,
  variant = 'long',
  className,
  hideIcon,
  label = 'Last contact',
}: LastContactChipProps) {
  if (!value) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs text-muted-foreground',
          className,
        )}
      >
        {!hideIcon && <Clock className="h-3.5 w-3.5 opacity-60" />}
        {label}: <span className="italic">No activity yet</span>
      </span>
    );
  }
  const date = value instanceof Date ? value : new Date(value);
  const relative = formatDistanceToNowStrict(date, { addSuffix: true });
  const absolute = format(date, 'MMM d, yyyy');
  if (variant === 'short') {
    return (
      <span
        title={`${label}: ${absolute}`}
        className={cn(
          'inline-flex items-center gap-1 text-xs text-muted-foreground',
          className,
        )}
      >
        {!hideIcon && <Clock className="h-3 w-3 opacity-60" />}
        {formatDistanceToNowStrict(date)} ago
      </span>
    );
  }
  return (
    <span
      title={absolute}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      {!hideIcon && <Clock className="h-3.5 w-3.5 opacity-60" />}
      <span className="text-foreground/80">{label}:</span>
      <span>
        {absolute} <span className="text-muted-foreground/70">· {relative}</span>
      </span>
    </span>
  );
}