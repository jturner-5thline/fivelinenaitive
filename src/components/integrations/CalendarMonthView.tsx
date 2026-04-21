import { useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  all_day: boolean;
  html_link?: string;
  hangout_link?: string;
}

interface CalendarMonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventEdit: (event: CalendarEvent) => void;
}

export function CalendarMonthView({ currentDate, events, onEventEdit }: CalendarMonthViewProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      try {
        const d = parseISO(event.start);
        const key = format(d, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(event);
      } catch { /* skip */ }
    });
    return map;
  }, [events]);

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 cal-grid-b">
        {weekDays.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate.get(dateStr) || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const isExpanded = expandedDay === dateStr;
          const visibleCount = isExpanded ? dayEvents.length : Math.min(dayEvents.length, 2);
          const hiddenCount = dayEvents.length - visibleCount;

          return (
            <div
              key={i}
              className={`cal-grid-r cal-grid-b p-1 min-h-[80px] transition-colors ${
                !inMonth ? 'opacity-40' : ''
              } ${today ? 'bg-[rgba(59,130,246,0.05)]' : ''}`}
            >
              <div className={`text-[11px] font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                today ? 'bg-primary text-primary-foreground' : 'text-foreground'
              }`}>
                {format(day, 'd')}
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, visibleCount).map(event => (
                  <div
                    key={event.id}
                    onClick={() => onEventEdit(event)}
                    className="text-[10px] px-1.5 py-0.5 bg-primary/[0.15] border-l-2 border-l-primary rounded-[2px] cursor-pointer hover:bg-primary/30 truncate transition-all"
                  >
                    {event.summary}
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <button
                    className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground pl-1"
                    onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                  >
                    +{hiddenCount} more
                  </button>
                )}
                {isExpanded && dayEvents.length > 2 && (
                  <button
                    className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground pl-1"
                    onClick={() => setExpandedDay(null)}
                  >
                    show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
