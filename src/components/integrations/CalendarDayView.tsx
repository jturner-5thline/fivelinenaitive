import { useMemo } from 'react';
import { format, parseISO, setHours, isSameDay } from 'date-fns';
import { DraggableCalendarEvent } from './DraggableCalendarEvent';
import { DroppableTimeSlot } from './DroppableTimeSlot';
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

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

interface CalendarDayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventEdit: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

export function CalendarDayView({ date, events, onEventEdit }: CalendarDayViewProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const allDayEvents = useMemo(() => events.filter(e => e.all_day), [events]);

  const eventsByHour = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    HOURS.forEach(h => { map[h] = []; });
    events.forEach(event => {
      if (event.all_day) return;
      try {
        const start = parseISO(event.start);
        if (isSameDay(start, date)) {
          const h = Math.max(7, Math.min(20, start.getHours()));
          map[h]?.push(event);
        }
      } catch { /* skip */ }
    });
    return map;
  }, [events, date]);

  return (
    <DndContext sensors={sensors}>
      <div>
        {/* All-day */}
        {allDayEvents.length > 0 && (
          <div className="cal-grid-b mb-2 pb-2">
            <div className="text-xs text-muted-foreground mb-1">All Day</div>
            <div className="space-y-1">
              {allDayEvents.map(event => (
                <div
                  key={event.id}
                  onClick={() => onEventEdit(event)}
                  className="text-xs py-1 px-2 bg-primary/[0.15] border-l-4 border-l-primary rounded-[5px] cursor-pointer hover:bg-primary/30 truncate shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-all"
                >
                  {event.summary}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Time grid - single column */}
        <div className="flex overflow-auto max-h-[500px]">
          <div className="w-16 flex-shrink-0">
            {HOURS.map(hour => (
              <div key={hour} className="h-[60px] text-xs text-muted-foreground pr-2 text-right flex items-start pt-0.5">
                <span className="ml-auto">{format(setHours(new Date(), hour), 'h a')}</span>
              </div>
            ))}
          </div>
          <div className="flex-1">
            {HOURS.map(hour => (
              <DroppableTimeSlot key={hour} date={date} hour={hour} isNoon={hour === 12} isPM={hour >= 12}>
                <div className="space-y-1">
                  {eventsByHour[hour]?.map(event => (
                    <DraggableCalendarEvent key={event.id} event={event} onEdit={onEventEdit} />
                  ))}
                </div>
              </DroppableTimeSlot>
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
