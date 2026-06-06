import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';
import { useAddToDealCalendar } from '@/components/calendar/AddToDealCalendarProvider';

interface Props {
  dealId: string;
  eventId: string;
  eventTitle: string;
  eventStartISO?: string | null;
}

export function AddToDealCalendarInlineAction({
  dealId,
  eventId,
  eventTitle,
  eventStartISO,
}: Props) {
  const { openManual } = useAddToDealCalendar();

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 justify-start gap-2 text-xs"
      onClick={() =>
        openManual({
          title: `Follow-up: ${eventTitle}`,
          sourceText: `Follow-up to meeting "${eventTitle}"`,
          ctx: {
            module: 'rundown_item',
            recordId: eventId,
            sourceTimestamp: eventStartISO || new Date().toISOString(),
            dealId,
            label: eventTitle,
          },
        })
      }
    >
      <CalendarPlus className="h-3.5 w-3.5" /> Add to deal calendar
    </Button>
  );
}