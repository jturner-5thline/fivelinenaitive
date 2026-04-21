import { useMemo } from 'react';
import { format, parseISO, isToday, isTomorrow, differenceInMinutes } from 'date-fns';
import { Video, MapPin, Clock } from 'lucide-react';

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

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  onEventEdit: (event: CalendarEvent) => void;
}

export function CalendarAgendaView({ events, onEventEdit }: CalendarAgendaViewProps) {
  const groupedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
    const groups = new Map<string, CalendarEvent[]>();
    sorted.forEach(event => {
      try {
        const d = parseISO(event.start);
        const key = format(d, 'yyyy-MM-dd');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(event);
      } catch { /* skip */ }
    });
    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No events in this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[500px] overflow-auto">
      {Array.from(groupedEvents.entries()).map(([dateKey, dayEvents]) => {
        const date = parseISO(dateKey);
        const today = isToday(date);
        const tomorrow = isTomorrow(date);
        const label = today ? 'Today' : tomorrow ? 'Tomorrow' : format(date, 'EEEE, MMM d');

        return (
          <div key={dateKey}>
            {/* Date header */}
            <div className={`sticky top-0 z-10 py-2 px-3 text-xs font-semibold ${
              today ? 'text-primary bg-primary/5' : 'text-muted-foreground bg-background'
            } cal-grid-b`}>
              {label}
            </div>

            {/* Events */}
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {dayEvents.map(event => {
                let timeLabel = 'All day';
                let duration = '';
                if (!event.all_day) {
                  try {
                    const start = parseISO(event.start);
                    const end = parseISO(event.end);
                    timeLabel = `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
                    const mins = differenceInMinutes(end, start);
                    duration = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}` : `${mins}m`;
                  } catch { /* skip */ }
                }

                return (
                  <div
                    key={event.id}
                    onClick={() => onEventEdit(event)}
                    className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-colors group"
                  >
                    {/* Time column */}
                    <div className="w-24 flex-shrink-0 text-[11px] text-muted-foreground/60 pt-0.5">
                      {event.all_day ? 'All day' : (
                        <>
                          <div>{timeLabel.split(' – ')[0]}</div>
                          <div>{timeLabel.split(' – ')[1]}</div>
                        </>
                      )}
                    </div>

                    {/* Event content */}
                    <div className="flex-1 min-w-0 border-l-4 border-l-primary pl-3 rounded-r-[3px] bg-primary/[0.08] py-2 px-3 group-hover:bg-primary/[0.15] transition-all">
                      <p className="font-semibold text-[13px] text-foreground truncate">{event.summary}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/50">
                        {duration && <span>{duration}</span>}
                        {event.hangout_link && <Video className="h-3 w-3" />}
                        {event.location && !event.hangout_link && (
                          <span className="flex items-center gap-0.5 truncate">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
