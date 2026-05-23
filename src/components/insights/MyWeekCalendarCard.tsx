/**
 * MyWeekCalendarCard
 * ------------------
 * /insights surface for the canonical NaitiveCalendar. Renders the
 * signed-in user's primary Google Calendar in the default week view,
 * full-width inside the Insights grid.
 */
import { NaitiveCalendar } from '@/components/calendar/NaitiveCalendar';

interface Props {
  height?: number;
}

export function MyWeekCalendarCard(_props: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">My Week</h3>
        <span className="text-[10.5px] text-muted-foreground">From your connected Google Calendar</span>
      </div>
      <NaitiveCalendar view="week" />
    </div>
  );
}

export default MyWeekCalendarCard;
