import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  differenceInMinutes,
  startOfDay,
  endOfDay,
  getHours,
  getMinutes,
  eachDayOfInterval,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Video,
  Users,
  MapPin,
  ExternalLink,
  X,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────
type CalendarViewMode = 'day' | 'week' | 'month';

interface FullCalendarViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ───────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // px per hour
const EVENT_COLORS = [
  'bg-primary/80 text-primary-foreground',
  'bg-emerald-600/80 text-primary-foreground',
  'bg-amber-600/80 text-primary-foreground',
  'bg-rose-600/80 text-primary-foreground',
  'bg-violet-600/80 text-primary-foreground',
  'bg-cyan-600/80 text-primary-foreground',
  'bg-indigo-600/80 text-primary-foreground',
];

function getEventColor(event: CalendarEvent, index: number): string {
  if (event.color_id) {
    const colorIndex = parseInt(event.color_id, 10) % EVENT_COLORS.length;
    return EVENT_COLORS[colorIndex];
  }
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

// ─── Mock events for demo when not connected ─────────────────
const now = new Date();
const todayStr = format(now, 'yyyy-MM-dd');
const mockEvents: CalendarEvent[] = [
  {
    id: 'mock-1', calendar_id: 'primary', summary: 'Team Standup', description: 'Daily sync',
    location: null, start: `${todayStr}T09:00:00`, end: `${todayStr}T09:30:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: 'https://meet.google.com/abc', conference_data: true,
    attendees: [
      { email: 'alice@team.com', display_name: 'Alice Kim', response_status: 'accepted', organizer: false, self: false },
      { email: 'you@team.com', display_name: 'You', response_status: 'accepted', organizer: true, self: true },
    ],
    organizer: { email: 'you@team.com' }, color_id: null,
  },
  {
    id: 'mock-2', calendar_id: 'primary', summary: 'CloudSync Inc - Term Sheet Review',
    description: 'Review updated term sheet with Sarah', location: '5th Line Capital Office',
    start: `${todayStr}T10:00:00`, end: `${todayStr}T11:00:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: null, attendees: [
      { email: 'sarah@capitalpartners.com', display_name: 'Sarah Chen', response_status: 'accepted', organizer: false, self: false },
    ],
    organizer: { email: 'you@team.com' }, color_id: '1',
  },
  {
    id: 'mock-3', calendar_id: 'primary', summary: 'Lunch with Josh (Lango)',
    description: 'Catch up on Lango deal progress', location: 'Nobu Downtown',
    start: `${todayStr}T12:00:00`, end: `${todayStr}T13:00:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: null, attendees: [
      { email: 'josh@lango.io', display_name: 'Josh Rivera', response_status: 'accepted', organizer: false, self: false },
    ],
    organizer: { email: 'you@team.com' }, color_id: '2',
  },
  {
    id: 'mock-4', calendar_id: 'primary', summary: 'Pipeline Review',
    description: 'Weekly deal pipeline review', location: null,
    start: `${todayStr}T14:00:00`, end: `${todayStr}T15:00:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: 'https://meet.google.com/xyz', conference_data: true,
    attendees: [
      { email: 'mike@5thline.co', display_name: 'Mike Torres', response_status: 'accepted', organizer: false, self: false },
      { email: 'nina@5thline.co', display_name: 'Nina Patel', response_status: 'accepted', organizer: false, self: false },
    ],
    organizer: { email: 'you@team.com' }, color_id: '3',
  },
  {
    id: 'mock-5', calendar_id: 'primary', summary: 'TechFlow Solutions - IC Prep',
    description: 'Prepare IC materials for TechFlow', location: null,
    start: `${todayStr}T16:00:00`, end: `${todayStr}T16:45:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: null, attendees: [],
    organizer: { email: 'you@team.com' }, color_id: '4',
  },
  {
    id: 'mock-6', calendar_id: 'primary', summary: 'Board Deck Due',
    description: 'Submit Q4 board deck', location: null,
    start: `${todayStr}T00:00:00`, end: `${addDays(now, 1).toISOString().split('T')[0]}T00:00:00`,
    all_day: true, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: null, attendees: [],
    organizer: { email: 'you@team.com' }, color_id: '5',
  },
  // Tomorrow events
  {
    id: 'mock-7', calendar_id: 'primary', summary: 'NextWave Wireless - Due Diligence Call',
    description: null, location: null,
    start: `${format(addDays(now, 1), 'yyyy-MM-dd')}T10:00:00`,
    end: `${format(addDays(now, 1), 'yyyy-MM-dd')}T11:30:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: 'https://meet.google.com/dd', conference_data: true,
    attendees: [
      { email: 'legal@nextwave.io', display_name: 'Legal Team', response_status: 'tentative', organizer: false, self: false },
    ],
    organizer: { email: 'you@team.com' }, color_id: '6',
  },
  {
    id: 'mock-8', calendar_id: 'primary', summary: 'Investor Update Draft',
    description: null, location: null,
    start: `${format(addDays(now, 2), 'yyyy-MM-dd')}T14:00:00`,
    end: `${format(addDays(now, 2), 'yyyy-MM-dd')}T15:00:00`,
    all_day: false, status: 'confirmed', updated: null, created: null,
    html_link: null, hangout_link: null, attendees: [],
    organizer: { email: 'you@team.com' }, color_id: '0',
  },
];

// ─── Event Detail Popover ────────────────────────────────────
function EventDetailPopover({
  event,
  colorClass,
  onClose,
}: {
  event: CalendarEvent;
  colorClass: string;
  onClose: () => void;
}) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const hasVideo = !!(event.hangout_link || event.conference_data);
  const attendees = event.attendees?.filter(a => !a.self) || [];

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        className="absolute z-[61] bg-card border border-border rounded-xl shadow-2xl w-[340px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Color header */}
        <div className={cn('h-2 w-full', colorClass)} />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <h3 className="text-base font-semibold text-foreground pr-6">{event.summary}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-1 -mr-1" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {event.all_day ? (
              <span>All day · {format(start, 'EEEE, MMMM d')}</span>
            ) : (
              <span>
                {format(start, 'EEEE, MMMM d')} · {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
              </span>
            )}
          </div>

          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {hasVideo && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={() => window.open(event.hangout_link || '', '_blank')}
            >
              <Video className="h-3.5 w-3.5" />
              Join video call
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Button>
          )}

          {attendees.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                {attendees.length} guest{attendees.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {attendees.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                      {(a.display_name || a.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{a.display_name || a.email}</span>
                    {a.response_status === 'tentative' && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1">Maybe</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {event.description && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{event.description}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Time-grid event block ───────────────────────────────────
function TimeGridEvent({
  event,
  colorClass,
  onClick,
  style,
}: {
  event: CalendarEvent;
  colorClass: string;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const durationMin = differenceInMinutes(end, start);
  const hasVideo = !!(event.hangout_link || event.conference_data);

  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute left-1 right-1 rounded-md px-2 py-1 text-left overflow-hidden cursor-pointer transition-all hover:brightness-110 hover:shadow-lg z-[2]',
        colorClass,
      )}
      style={style}
    >
      <p className="text-[11px] font-semibold leading-tight truncate">{event.summary}</p>
      {durationMin >= 45 && (
        <p className="text-[10px] opacity-80 leading-tight mt-0.5">
          {format(start, 'h:mm')} – {format(end, 'h:mm a')}
        </p>
      )}
      {durationMin >= 60 && hasVideo && (
        <div className="flex items-center gap-1 mt-0.5">
          <Video className="h-2.5 w-2.5 opacity-70" />
          <span className="text-[9px] opacity-70">Video call</span>
        </div>
      )}
    </button>
  );
}

// ─── Current time indicator ──────────────────────────────────
function CurrentTimeIndicator() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const now = new Date();
  const minutes = getHours(now) * 60 + getMinutes(now);
  const top = (minutes / 60) * HOUR_HEIGHT;

  return (
    <div className="absolute left-0 right-0 z-[5] pointer-events-none" style={{ top }}>
      <div className="flex items-center">
        <div className="w-2 h-2 rounded-full bg-destructive -ml-1" />
        <div className="flex-1 h-[2px] bg-destructive" />
      </div>
    </div>
  );
}

// ─── Day Column (used in both day & week views) ──────────────
function DayColumn({
  date,
  events: dayEvents,
  onEventClick,
  showDayLabel,
}: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  showDayLabel: boolean;
}) {
  const timedEvents = dayEvents.filter(e => !e.all_day);

  return (
    <div className="relative flex-1 min-w-0">
      {/* Day header */}
      {showDayLabel && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b text-center py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {format(date, 'EEE')}
          </p>
          <p className={cn(
            'text-lg font-semibold leading-tight',
            isToday(date) ? 'text-primary' : 'text-foreground',
          )}>
            {format(date, 'd')}
          </p>
          {isToday(date) && (
            <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-primary" />
          )}
        </div>
      )}

      {/* Time grid */}
      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
        {/* Hour lines */}
        {HOURS.map(h => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-border/30"
            style={{ top: h * HOUR_HEIGHT }}
          />
        ))}

        {/* Current time */}
        {isToday(date) && <CurrentTimeIndicator />}

        {/* Events */}
        {timedEvents.map((event, idx) => {
          const start = parseISO(event.start);
          const end = parseISO(event.end);
          const startMin = getHours(start) * 60 + getMinutes(start);
          const endMin = getHours(end) * 60 + getMinutes(end);
          const duration = Math.max(endMin - startMin, 15);

          const top = (startMin / 60) * HOUR_HEIGHT;
          const height = (duration / 60) * HOUR_HEIGHT;
          const colorClass = getEventColor(event, idx);

          return (
            <TimeGridEvent
              key={event.id}
              event={event}
              colorClass={colorClass}
              onClick={() => onEventClick(event)}
              style={{ top, height: Math.max(height, 20), minHeight: 20 }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Month View ──────────────────────────────────────────────
function MonthView({
  currentDate,
  events: allEvents,
  onEventClick,
  onDayClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getEventsForDay = (day: Date) =>
    allEvents.filter(e => {
      const start = parseISO(e.start);
      return isSameDay(start, day);
    });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1 grid grid-rows-[repeat(auto-fill,1fr)]">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 min-h-[80px]">
            {week.map(day => {
              const dayEvents = getEventsForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-r last:border-r-0 p-1 cursor-pointer transition-colors hover:bg-muted/30',
                    !inMonth && 'opacity-40',
                  )}
                  onClick={() => onDayClick(day)}
                >
                  <p className={cn(
                    'text-xs font-medium mb-0.5 h-6 w-6 flex items-center justify-center rounded-full mx-auto',
                    isToday(day) && 'bg-primary text-primary-foreground',
                    !isToday(day) && 'text-foreground',
                  )}>
                    {format(day, 'd')}
                  </p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event, idx) => (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        className={cn(
                          'w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate',
                          getEventColor(event, idx),
                        )}
                      >
                        {!event.all_day && (
                          <span className="opacity-80">{format(parseISO(event.start), 'h:mm')} </span>
                        )}
                        {event.summary}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[9px] text-muted-foreground text-center">
                        +{dayEvents.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── All-day events bar ──────────────────────────────────────
function AllDayBar({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  if (events.length === 0) return null;
  return (
    <div className="border-b px-14 py-1.5 flex flex-wrap gap-1">
      {events.map((event, idx) => (
        <button
          key={event.id}
          onClick={() => onEventClick(event)}
          className={cn(
            'text-[10px] font-medium px-2 py-0.5 rounded truncate max-w-[180px]',
            getEventColor(event, idx),
          )}
        >
          {event.summary}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export function FullCalendarView({ open, onOpenChange }: FullCalendarViewProps) {
  const { events: liveEvents, status: calendarStatus, isLoading } = useGoogleCalendar();
  const [view, setView] = useState<CalendarViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Use live events if connected, otherwise mock
  const allEvents = calendarStatus?.connected && liveEvents.length > 0 ? liveEvents : mockEvents;

  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const delta = direction === 'next' ? 1 : -1;
    setCurrentDate(d => {
      if (view === 'day') return delta > 0 ? addDays(d, 1) : subDays(d, 1);
      if (view === 'week') return delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      return delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    });
  }, [view]);

  const headerLabel = useMemo(() => {
    if (view === 'day') return format(currentDate, 'EEEE, MMMM d, yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      if (ws.getMonth() === we.getMonth()) {
        return `${format(ws, 'MMMM d')} – ${format(we, 'd, yyyy')}`;
      }
      return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [currentDate, view]);

  // Get events for current view range
  const viewEvents = useMemo(() => {
    let start: Date, end: Date;
    if (view === 'day') {
      start = startOfDay(currentDate);
      end = endOfDay(currentDate);
    } else if (view === 'week') {
      start = startOfWeek(currentDate);
      end = endOfWeek(currentDate);
    } else {
      start = startOfWeek(startOfMonth(currentDate));
      end = endOfWeek(endOfMonth(currentDate));
    }
    return allEvents.filter(e => {
      const es = parseISO(e.start);
      return es >= start && es <= end;
    });
  }, [allEvents, currentDate, view]);

  const allDayEvents = viewEvents.filter(e => e.all_day);
  const timedEvents = viewEvents.filter(e => !e.all_day);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [currentDate]);

  const getEventsForDay = useCallback((date: Date) =>
    timedEvents.filter(e => isSameDay(parseISO(e.start), date)),
  [timedEvents]);

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView('day');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* ─── Toolbar ─── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <span className="text-base font-semibold text-foreground">Calendar</span>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => navigate('today')}>
            Today
          </Button>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-sm font-medium text-foreground min-w-[200px]">{headerLabel}</h2>

          <div className="flex-1" />

          {!calendarStatus?.connected && (
            <Badge variant="secondary" className="text-[10px] h-5 mr-2">Demo Data</Badge>
          )}

          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['day', 'week', 'month'] as CalendarViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
                  view === v
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {view === 'month' ? (
            <MonthView
              currentDate={currentDate}
              events={allEvents}
              onEventClick={setSelectedEvent}
              onDayClick={handleDayClick}
            />
          ) : (
            <>
              {/* All-day events */}
              <AllDayBar
                events={allDayEvents.filter(e => {
                  if (view === 'day') return isSameDay(parseISO(e.start), currentDate);
                  return true;
                })}
                onEventClick={setSelectedEvent}
              />

              {/* Time grid */}
              <ScrollArea className="flex-1">
                <div className="flex min-h-0">
                  {/* Time gutter */}
                  <div className="shrink-0 w-14 border-r">
                    <div style={{ height: HOURS.length * HOUR_HEIGHT }}>
                      {HOURS.map(h => (
                        <div
                          key={h}
                          className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground font-medium"
                          style={{ height: HOUR_HEIGHT }}
                        >
                          {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Day columns */}
                  {view === 'day' ? (
                    <DayColumn
                      date={currentDate}
                      events={getEventsForDay(currentDate)}
                      onEventClick={setSelectedEvent}
                      showDayLabel={false}
                    />
                  ) : (
                    <div className="flex flex-1">
                      {weekDays.map(day => (
                        <DayColumn
                          key={day.toISOString()}
                          date={day}
                          events={getEventsForDay(day)}
                          onEventClick={setSelectedEvent}
                          showDayLabel={true}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* Event detail popover */}
        {selectedEvent && (
          <EventDetailPopover
            event={selectedEvent}
            colorClass={getEventColor(selectedEvent, 0)}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
