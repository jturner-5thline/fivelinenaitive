import { useMemo, useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { format, parseISO, isSameDay, setHours, setMinutes, differenceInMinutes, addMinutes, isToday } from 'date-fns';
import { DroppableTimeSlot } from './DroppableTimeSlot';
import { DraggableCalendarEvent } from './DraggableCalendarEvent';
import { Badge } from '@/components/ui/badge';

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
  onEventUpdate?: (eventId: string, newStart: Date, newEnd: Date) => Promise<void>;
  onEventEdit: (event: CalendarEvent) => void;
  isUpdating?: boolean;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

export function CalendarTimeGrid({ days, onEventUpdate, onEventEdit, isUpdating }: CalendarTimeGridProps) {
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Now indicator position. Visibility-aware so a backgrounded tab
  // doesn't burn CPU re-rendering a clock no one can see.
  const [now, setNow] = useState(new Date());
  useVisibilityAwareInterval(() => setNow(new Date()), 60000);

  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const showNowLine = nowHour >= 7 && nowHour <= 20;
  const nowOffset = showNowLine ? ((nowHour - 7) * 60 + nowMinute) : 0;

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
      await onEventUpdate?.(draggedEvent.id, newStart, newEnd);
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
                      className="text-xs py-1 px-2 bg-primary/25 border-l-4 border-l-primary rounded-[2px] cursor-pointer hover:bg-primary/35 truncate transition-all"
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
        <div className="relative flex overflow-auto max-h-[500px]">
          {/* Time labels */}
          <div className="w-16 flex-shrink-0">
            {HOURS.map(hour => (
              <div key={hour} className="h-[60px] text-xs text-muted-foreground pr-2 text-right flex items-start pt-0.5">
                <span className="ml-auto">{format(setHours(new Date(), hour), 'h a')}</span>
              </div>
            ))}
          </div>

          {/* Day columns with now indicator overlay */}
          <div className="flex-1 relative">
            {/* Now indicator line — spans full width */}
            {showNowLine && days.some(({ date }) => isToday(date)) && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: `${nowOffset}px` }}
              >
                <div className="w-2 h-2 rounded-full bg-destructive flex-shrink-0 -ml-1" />
                <div className="flex-1 h-[2px] bg-destructive" />
              </div>
            )}

            <div className="grid grid-cols-7 gap-px">
              {days.map(({ date, events }) => {
                const eventsByHour = getEventsByHour(date, events);
                const dateKey = format(date, 'yyyy-MM-dd');
                const todayCol = isToday(date);

                return (
                  <div
                    key={dateKey}
                    className={`bg-background ${todayCol ? 'bg-[rgba(59,130,246,0.05)]' : ''}`}
                  >
                    {/* Day header */}
                    <div className={`sticky top-0 z-10 bg-background border-b p-1 text-center ${todayCol ? 'bg-[rgba(59,130,246,0.05)]' : ''}`}>
                      <div className="text-xs text-muted-foreground">{format(date, 'EEE')}</div>
                      <div className="flex items-center justify-center">
                        {todayCol ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                            {format(date, 'd')}
                          </span>
                        ) : (
                          <span className="text-sm font-medium">{format(date, 'd')}</span>
                        )}
                      </div>
                    </div>

                    {/* Hour slots */}
                    {HOURS.map(hour => {
                      const hourEvents = eventsByHour[hour] || [];
                      const maxVisible = 2;
                      const overflow = hourEvents.length > maxVisible ? hourEvents.length - maxVisible : 0;

                      return (
                        <DroppableTimeSlot
                          key={`${dateKey}-${hour}`}
                          date={date}
                          hour={hour}
                          isNoon={hour === 12}
                          isPM={hour >= 12}
                        >
                          <div className="space-y-1">
                            {hourEvents.slice(0, overflow > 0 ? maxVisible : hourEvents.length).map(event => (
                              <DraggableCalendarEvent
                                key={event.id}
                                event={event}
                                onEdit={onEventEdit}
                              />
                            ))}
                            {overflow > 0 && (
                              <OverflowChip count={overflow} events={hourEvents.slice(maxVisible)} onEdit={onEventEdit} />
                            )}
                          </div>
                        </DroppableTimeSlot>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay />
    </DndContext>
  );
}

function OverflowChip({ count, events, onEdit }: { count: number; events: CalendarEvent[]; onEdit: (e: CalendarEvent) => void }) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="space-y-1">
        {events.map(event => (
          <DraggableCalendarEvent key={event.id} event={event} onEdit={onEdit} />
        ))}
        <button
          className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          onClick={() => setExpanded(false)}
        >
          show less
        </button>
      </div>
    );
  }

  return (
    <button
      className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground px-2 py-0.5 rounded-full bg-muted/30 transition-colors"
      onClick={() => setExpanded(true)}
    >
      +{count} more
    </button>
  );
}
