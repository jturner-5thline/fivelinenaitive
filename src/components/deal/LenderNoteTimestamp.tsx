import { format, formatDistanceToNowStrict, differenceInDays } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface LenderNoteTimestampProps {
  updatedAt: string | Date | null | undefined;
  noteCount?: number;
  className?: string;
}

/**
 * Inline, always-visible "Updated {relative}" label for the most recent
 * lender note on a deal's Funding Sources card. Full timestamp on hover.
 */
export function LenderNoteTimestamp({ updatedAt, noteCount, className }: LenderNoteTimestampProps) {
  if (!updatedAt) return null;
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (isNaN(date.getTime())) return null;

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