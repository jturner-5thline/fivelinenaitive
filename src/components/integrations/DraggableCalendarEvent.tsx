import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Video, GripVertical } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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

interface DraggableCalendarEventProps {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
}

export function DraggableCalendarEvent({ event, onEdit }: DraggableCalendarEventProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const formatEventTime = () => {
    if (event.all_day) return 'All day';
    try {
      const start = parseISO(event.start);
      const end = parseISO(event.end);
      return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
    } catch {
      return '';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group p-2 rounded-md border bg-primary/10 border-primary/20 text-sm cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary z-50' : 'hover:bg-primary/20'
      }`}
    >
      <div className="flex items-start gap-1">
        <div
          {...listeners}
          {...attributes}
          className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0" onClick={() => onEdit(event)}>
          <p className="font-medium truncate text-xs">{event.summary}</p>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span className="truncate">{formatEventTime()}</span>
          </div>
        </div>
        {event.hangout_link && (
          <a
            href={event.hangout_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-0.5 hover:bg-primary/10 rounded"
          >
            <Video className="h-3 w-3 text-primary" />
          </a>
        )}
      </div>
    </div>
  );
}
