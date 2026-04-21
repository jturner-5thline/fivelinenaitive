import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Video, MapPin, GripVertical } from 'lucide-react';
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

const PERSONAL_KEYWORDS = ['lunch', 'gym', 'chiro', 'doctor', 'dr appt', 'dentist', 'haircut', 'personal', 'pickup', 'drop off'];

function isPersonalEvent(summary: string): boolean {
  const lower = summary.toLowerCase();
  return PERSONAL_KEYWORDS.some(kw => lower.includes(kw));
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

  const isPersonal = isPersonalEvent(event.summary);

  const formatEventTime = () => {
    if (event.all_day) return 'All day';
    try {
      const start = parseISO(event.start);
      const end = parseISO(event.end);
      return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
    } catch {
      return '';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg cursor-pointer transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-primary z-50' : ''
      }`}
      onClick={() => onEdit(event)}
    >
      <div
        className={`
          rounded-lg py-[8px] px-[10px]
          ${isPersonal
            ? 'bg-primary/20 border-l-4 border-l-primary border-dashed hover:bg-primary/30'
            : 'bg-primary/25 border-l-4 border-l-primary border-solid hover:bg-primary/35'
          }
          transition-all
        `}
      >
        <div className="flex items-start gap-1">
          <div
            {...listeners}
            {...attributes}
            className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[13px] text-foreground truncate leading-tight">
              {event.summary}
            </p>
            <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground/60">
              <span className="truncate">{formatEventTime()}</span>
              {event.hangout_link && (
                <a
                  href={event.hangout_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex-shrink-0 hover:text-foreground transition-colors"
                >
                  <Video className="h-3 w-3 text-muted-foreground/50" />
                </a>
              )}
              {event.location && !event.hangout_link && (
                <MapPin className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
