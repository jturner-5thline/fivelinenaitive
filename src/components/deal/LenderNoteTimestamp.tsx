import { format, formatDistanceToNowStrict, differenceInDays } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface LenderNoteTimestampProps {
  updatedAt: string | Date | null | undefined;
  /**
   * Additional timestamps to consider (status note, status change, milestone
   * change). The component renders the most recent of `updatedAt` and any of
   * these values so the "Updated …" label reflects the last change to the
   * funding source overall, not just the notes field.
   */
  additionalDates?: Array<string | Date | null | undefined>;
  noteCount?: number;
  className?: string;
}

/**
 * Inline, always-visible "Updated {relative}" label for the most recent
 * lender note on a deal's Funding Sources card. Full timestamp on hover.
 */
export function LenderNoteTimestamp({ updatedAt, additionalDates, noteCount, className }: LenderNoteTimestampProps) {
  const candidates = [updatedAt, ...(additionalDates ?? [])]
    .map((v) => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      return isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null);
  if (candidates.length === 0) return null;
  const date = candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));

  const daysAgo = differenceInDays(new Date(), date);
  const now = new Date();
  let relative: string;
  if (daysAgo < 7) {
    relative = `${formatDistanceToNowStrict(date)} ago`;
  } else if (date.getFullYear() === now.getFullYear()) {
    relative = format(date, 'MMM d');
  } else {
    relative = format(date, 'MMM d, yyyy');
  }

  const full = format(date, "MMM d, yyyy 'at' h:mm a");
  const count = noteCount && noteCount > 1 ? noteCount : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap',
            className,
          )}
        >
          <span>Updated {relative}</span>
          {count > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-[1px] text-[9px] font-medium text-muted-foreground">
              {count} notes
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{full}</p>
      </TooltipContent>
    </Tooltip>
  );
}