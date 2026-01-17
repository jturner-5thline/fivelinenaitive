import { useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { format, parseISO, isSameDay, setHours, setMinutes, differenceInMinutes, addMinutes } from 'date-fns';
import { DroppableTimeSlot } from './DroppableTimeSlot';
import { DraggableCalendarEvent } from './DraggableCalendarEvent';
import { Badge } from '@/components/ui/badge';
import { isToday } from 'date-fns';

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

interface CalendarTimeGridProps {
  days: { date: Date; events: CalendarEvent[] }[];
  onEventUpdate: (eventId: string, newStart: Date, newEnd: Date) => Promise<void>;
  onEventEdit: (event: CalendarEvent) => void;
  isUpdating?: boolean;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

export function CalendarTimeGrid({ days, onEventUpdate, onEventEdit, isUpdating }: CalendarTimeGridProps) {
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const getEventsByHour = (date: Date, events: CalendarEvent[]) => {
    const eventsByHour: Record<number, CalendarEvent[]> = {};
    HOURS.forEach(hour => { eventsByHour[hour] = []; });

    events.forEach(event => {
      if (event.all_day) return;
      try {
        const startDate = parseISO(event.start);
        if (isSameDay(startDate, date)) {
          const hour = startDate.getHours();
          if (hour >= 7 && hour <= 20) {
            eventsByHour[hour]?.push(event);
          } else if (hour < 7) {
            eventsByHour[7]?.push(event);
          } else {
            eventsByHour[20]?.push(event);
          }
        }
      } catch {
        // Skip invalid dates
      }
    });

    return eventsByHour;
  };

  const allDayEvents = useMemo(() => {
    const result: Record<string, CalendarEvent[]> = {};
    days.forEach(({ date, events }) => {
      const key = format(date, 'yyyy-MM-dd');
      result[key] = events.filter(e => e.all_day);
    });
    return result;
  }, [days]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !active.data.current?.event) return;

    const draggedEvent = active.data.current.event as CalendarEvent;
    const dropData = over.data.current as { date: Date; hour: number } | undefined;
    
    if (!dropData) return;

    try {
      const originalStart = parseISO(draggedEvent.start);
      const originalEnd = parseISO(draggedEvent.end);
      const duration = differenceInMinutes(originalEnd, originalStart);

      const newStart = setMinutes(setHours(dropData.date, dropData.hour), originalStart.getMinutes());
      const newEnd = addMinutes(newStart, duration);

      await onEventUpdate(draggedEvent.id, newStart, newEnd);
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className={`relative ${isUpdating ? 'opacity-70 pointer-events-none' : ''}`}>
        {/* All-day events row */}
        <div className="flex border-b border-border mb-2">
          <div className="w-16 flex-shrink-0 text-xs text-muted-foreground p-2">All Day</div>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {days.map(({ date }) => {
              const key = format(date, 'yyyy-MM-dd');
              const dayAllDay = allDayEvents[key] || [];
              return (
                <div key={key} className="min-h-[40px] p-1 space-y-1">
                  {dayAllDay.map(event => (
                    <div
                      key={event.id}
                      onClick={() => onEventEdit(event)}
                      className="text-xs p-1 bg-primary/10 rounded truncate cursor-pointer hover:bg-primary/20"
                    >
                      {event.summary}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Time grid */}
        <div className="flex overflow-auto max-h-[500px]">
          {/* Time labels */}
          <div className="w-16 flex-shrink-0">
            {HOURS.map(hour => (
              <div key={hour} className="h-[60px] text-xs text-muted-foreground pr-2 text-right">
                {format(setHours(new Date(), hour), 'h a')}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 grid grid-cols-7 gap-px bg-border/30">
            {days.map(({ date, events }) => {
              const eventsByHour = getEventsByHour(date, events);
              const dateKey = format(date, 'yyyy-MM-dd');

              return (
                <div key={dateKey} className="bg-background">
                  {/* Day header */}
                  <div className={`sticky top-0 z-10 bg-background border-b p-1 text-center ${isToday(date) ? 'bg-primary/5' : ''}`}>
                    <div className="text-xs text-muted-foreground">{format(date, 'EEE')}</div>
                    <div className={`text-sm font-medium ${isToday(date) ? 'text-primary' : ''}`}>
                      {format(date, 'd')}
                      {isToday(date) && <Badge variant="secondary" className="ml-1 text-[10px] px-1">Today</Badge>}
                    </div>
                  </div>

                  {/* Hour slots */}
                  {HOURS.map(hour => (
                    <DroppableTimeSlot key={`${dateKey}-${hour}`} date={date} hour={hour}>
                      <div className="space-y-1">
                        {eventsByHour[hour]?.map(event => (
                          <DraggableCalendarEvent
                            key={event.id}
                            event={event}
                            onEdit={onEventEdit}
                          />
                        ))}
                      </div>
                    </DroppableTimeSlot>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay>
        {/* The drag overlay is handled by the opacity change on the original element */}
      </DragOverlay>
    </DndContext>
  );
}
