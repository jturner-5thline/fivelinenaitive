import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarPlus, ListPlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';
import { useAddToDealCalendar } from '@/components/calendar/AddToDealCalendarProvider';

interface Props {
  eventId: string;
  eventTitle: string;
  eventStartISO?: string | null;
  /** Linked deal for this meeting, when present. Null = plain-task mode. */
  linkedDealId: string | null;
}

/**
 * Combined "Create follow-up" inline action that replaces the separate
 * Create-task + Add-to-deal-calendar buttons. Opens the unified
 * AddToDealCalendarDialog where the user can create a task, an event,
 * or both at once. When no deal is linked, the dialog falls back to
 * plain-task creation (no calendar option).
 */
export function MeetingFollowUpInlineAction({
  eventId,
  eventTitle,
  eventStartISO,
  linkedDealId,
}: Props) {
  const { openManual } = useAddToDealCalendar();
  const ctx = useMeetingClaapContext(eventId);
  const suggestions = ctx.actionItems.filter(Boolean);

  const open = (initialTitle?: string) => {
    const title = (initialTitle?.trim() || `Follow-up: ${eventTitle}`).trim();
    openManual({
      title,
      sourceText: initialTitle?.trim() || `Follow-up to meeting "${eventTitle}"`,
      ctx: {
        module: 'rundown_item',
        recordId: eventId,
        sourceTimestamp: eventStartISO || new Date().toISOString(),
        dealId: linkedDealId,
        label: eventTitle,
      },
    });
  };

  if (suggestions.length === 0) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 justify-start gap-2 text-xs"
        onClick={() => open()}
        disabled={ctx.isLoading && ctx.source === 'none'}
      >
        {linkedDealId ? (
          <CalendarPlus className="h-3.5 w-3.5" />
        ) : (
          <ListPlus className="h-3.5 w-3.5" />
        )}
        Create follow-up
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border px-2.5 py-1.5 flex items-center gap-2',
        'border-emerald-500/30 bg-emerald-500/[0.05]',
      )}
    >
      <div
        className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-white"
        title={suggestions.join(' • ')}
      >
        <ListPlus className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">
          ▶ {suggestions.length} task{suggestions.length === 1 ? '' : 's'} suggested
        </span>
      </div>
      <Badge
        variant="outline"
        className="h-5 px-1.5 text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
      >
        <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI suggested
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[10px] gap-1 text-emerald-200 hover:text-emerald-100 hover:bg-emerald-500/10 shrink-0"
        onClick={() => open(suggestions[0])}
      >
        Review
      </Button>
    </div>
  );
}