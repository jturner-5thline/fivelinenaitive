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
  isAfter,
  isBefore,
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
  List,
  Sparkles,
  Brain,
  FileText,
  AlertTriangle,
  Lightbulb,
  Loader2,
  Search,
  Timer,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

// ─── Types ───────────────────────────────────────────────────
type CalendarViewMode = 'day' | 'week' | 'month' | 'agenda';

interface FullCalendarViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ───────────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;

const EVENT_PALETTE = [
  { bg: 'bg-primary/80', text: 'text-primary-foreground', dot: 'bg-primary', label: 'Default' },
  { bg: 'bg-emerald-600/80', text: 'text-primary-foreground', dot: 'bg-emerald-600', label: 'Green' },
  { bg: 'bg-amber-600/80', text: 'text-primary-foreground', dot: 'bg-amber-600', label: 'Amber' },
  { bg: 'bg-rose-600/80', text: 'text-primary-foreground', dot: 'bg-rose-600', label: 'Rose' },
  { bg: 'bg-violet-600/80', text: 'text-primary-foreground', dot: 'bg-violet-600', label: 'Violet' },
  { bg: 'bg-cyan-600/80', text: 'text-primary-foreground', dot: 'bg-cyan-600', label: 'Cyan' },
  { bg: 'bg-indigo-600/80', text: 'text-primary-foreground', dot: 'bg-indigo-600', label: 'Indigo' },
];

function getColorIndex(event: CalendarEvent, idx: number): number {
  if (event.color_id) return parseInt(event.color_id, 10) % EVENT_PALETTE.length;
  return idx % EVENT_PALETTE.length;
}

function getEventColorClass(event: CalendarEvent, idx: number): string {
  const c = EVENT_PALETTE[getColorIndex(event, idx)];
  return `${c.bg} ${c.text}`;
}

// ─── Mock events ─────────────────────────────────────────────
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
              <span>{format(start, 'EEEE, MMMM d')} · {format(start, 'h:mm a')} – {format(end, 'h:mm a')}</span>
            )}
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          {hasVideo && (
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => window.open(event.hangout_link || '', '_blank')}>
              <Video className="h-3.5 w-3.5" />
              Join video call
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Button>
          )}
          {attendees.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3 w-3" />{attendees.length} guest{attendees.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {attendees.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground/80">
                    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                      {(a.display_name || a.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{a.display_name || a.email}</span>
                    {a.response_status === 'tentative' && <Badge variant="outline" className="text-[9px] h-4 px-1">Maybe</Badge>}
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

  const tooltipContent = (
    <div className="space-y-1 max-w-[220px]">
      <p className="font-semibold text-xs">{event.summary}</p>
      <p className="text-[10px] text-muted-foreground">
        {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
      </p>
      {event.location && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="h-2.5 w-2.5" />{event.location}</p>
      )}
      {event.attendees && event.attendees.filter(a => !a.self).length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Users className="h-2.5 w-2.5" />{event.attendees.filter(a => !a.self).map(a => a.display_name || a.email).slice(0, 3).join(', ')}
          {event.attendees.filter(a => !a.self).length > 3 && ` +${event.attendees.filter(a => !a.self).length - 3}`}
        </p>
      )}
      {hasVideo && (
        <p className="text-[10px] text-primary flex items-center gap-1"><Video className="h-2.5 w-2.5" />Video call</p>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent side="right" className="p-2.5">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

// ─── Mini Calendar Sidebar ───────────────────────────────────
function MiniCalendar({
  currentDate,
  onDateSelect,
  events,
}: {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  events: CalendarEvent[];
}) {
  const [miniMonth, setMiniMonth] = useState(startOfMonth(currentDate));

  useEffect(() => {
    setMiniMonth(startOfMonth(currentDate));
  }, [currentDate]);

  const calStart = startOfWeek(startOfMonth(miniMonth));
  const calEnd = endOfWeek(endOfMonth(miniMonth));
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const hasEventOnDay = (day: Date) => events.some(e => isSameDay(parseISO(e.start), day));

  return (
    <div className="space-y-3">
      {/* Mini month header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{format(miniMonth, 'MMMM yyyy')}</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMiniMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Days */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0">
          {week.map(day => {
            const inMonth = isSameMonth(day, miniMonth);
            const selected = isSameDay(day, currentDate);
            const today = isToday(day);
            const hasEvents = hasEventOnDay(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  'h-7 w-7 mx-auto flex flex-col items-center justify-center rounded-full text-[11px] transition-colors relative',
                  !inMonth && 'opacity-30',
                  selected && 'bg-primary text-primary-foreground',
                  !selected && today && 'text-primary font-bold',
                  !selected && !today && 'text-foreground hover:bg-muted',
                )}
              >
                {format(day, 'd')}
                {hasEvents && !selected && (
                  <div className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      ))}

      <Separator />

      {/* Color Legend */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Colors</p>
        <div className="space-y-1">
          {EVENT_PALETTE.slice(0, 5).map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn('h-2.5 w-2.5 rounded-full', c.dot)} />
              <span className="text-[11px] text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Day Column ──────────────────────────────────────────────
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
      {showDayLabel && (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b text-center py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{format(date, 'EEE')}</p>
          <p className={cn('text-lg font-semibold leading-tight', isToday(date) ? 'text-primary' : 'text-foreground')}>
            {format(date, 'd')}
          </p>
          {isToday(date) && <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-primary" />}
        </div>
      )}
      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
        {HOURS.map(h => (
          <div key={h} className="absolute left-0 right-0 border-t border-border/30" style={{ top: h * HOUR_HEIGHT }} />
        ))}
        {isToday(date) && <CurrentTimeIndicator />}
        {timedEvents.map((event, idx) => {
          const start = parseISO(event.start);
          const end = parseISO(event.end);
          const startMin = getHours(start) * 60 + getMinutes(start);
          const endMin = getHours(end) * 60 + getMinutes(end);
          const duration = Math.max(endMin - startMin, 15);
          const top = (startMin / 60) * HOUR_HEIGHT;
          const height = (duration / 60) * HOUR_HEIGHT;

          return (
            <TimeGridEvent
              key={event.id}
              event={event}
              colorClass={getEventColorClass(event, idx)}
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
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const getEventsForDay = (day: Date) => allEvents.filter(e => isSameDay(parseISO(e.start), day));

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 border-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-rows-[repeat(auto-fill,1fr)]">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0 min-h-[80px]">
            {week.map(day => {
              const dayEvents = getEventsForDay(day);
              const inMonth = isSameMonth(day, currentDate);
              return (
                <div
                  key={day.toISOString()}
                  className={cn('border-r last:border-r-0 p-1 cursor-pointer transition-colors hover:bg-muted/30', !inMonth && 'opacity-40')}
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
                        className={cn('w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate', getEventColorClass(event, idx))}
                      >
                        {!event.all_day && <span className="opacity-80">{format(parseISO(event.start), 'h:mm')} </span>}
                        {event.summary}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[9px] text-muted-foreground text-center">+{dayEvents.length - 3} more</p>
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

// ─── Agenda View ─────────────────────────────────────────────
function AgendaView({
  currentDate,
  events: allEvents,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  // Show 14 days from current date
  const agendaDays = eachDayOfInterval({
    start: currentDate,
    end: addDays(currentDate, 13),
  });

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border">
        {agendaDays.map(day => {
          const dayEvents = allEvents
            .filter(e => isSameDay(parseISO(e.start), day))
            .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());

          return (
            <div key={day.toISOString()} className="flex min-h-[56px]">
              {/* Date column */}
              <div className={cn(
                'w-24 shrink-0 p-3 text-right border-r',
                isToday(day) && 'bg-primary/5',
              )}>
                <p className={cn(
                  'text-xs uppercase tracking-wider font-medium',
                  isToday(day) ? 'text-primary' : 'text-muted-foreground',
                )}>
                  {format(day, 'EEE')}
                </p>
                <p className={cn(
                  'text-2xl font-semibold leading-tight',
                  isToday(day) ? 'text-primary' : 'text-foreground',
                )}>
                  {format(day, 'd')}
                </p>
                <p className="text-[10px] text-muted-foreground">{format(day, 'MMM')}</p>
              </div>

              {/* Events column */}
              <div className="flex-1 py-2 px-3 space-y-1.5">
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 py-2">No events</p>
                ) : (
                  dayEvents.map((event, idx) => {
                    const start = parseISO(event.start);
                    const end = parseISO(event.end);
                    const ci = getColorIndex(event, idx);
                    const palette = EVENT_PALETTE[ci];
                    const hasVideo = !!(event.hangout_link || event.conference_data);
                    const attendeeCount = event.attendees?.filter(a => !a.self).length || 0;

                    return (
                      <button
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div className={cn('h-full w-1 rounded-full self-stretch min-h-[36px]', palette.dot)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {event.summary}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {event.all_day ? (
                              <span>All day</span>
                            ) : (
                              <span>{format(start, 'h:mm a')} – {format(end, 'h:mm a')}</span>
                            )}
                            {event.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />{event.location}
                              </span>
                            )}
                            {hasVideo && (
                              <span className="flex items-center gap-1">
                                <Video className="h-3 w-3" />Video
                              </span>
                            )}
                            {attendeeCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />{attendeeCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
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
          className={cn('text-[10px] font-medium px-2 py-0.5 rounded truncate max-w-[180px]', getEventColorClass(event, idx))}
        >
          {event.summary}
        </button>
      ))}
    </div>
  );
}

// ─── AI Insights Panel ──────────────────────────────────────
type AIAction = 'daily_summary' | 'meeting_prep' | 'smart_schedule' | 'conflict_check';

const AI_ACTIONS: { id: AIAction; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'daily_summary', label: 'Day Summary', icon: <FileText className="h-3.5 w-3.5" />, description: 'AI overview of your day' },
  { id: 'meeting_prep', label: 'Meeting Prep', icon: <Brain className="h-3.5 w-3.5" />, description: 'Briefings for meetings' },
  { id: 'smart_schedule', label: 'Schedule Tips', icon: <Lightbulb className="h-3.5 w-3.5" />, description: 'Optimization suggestions' },
  { id: 'conflict_check', label: 'Conflicts', icon: <AlertTriangle className="h-3.5 w-3.5" />, description: 'Detect scheduling issues' },
];

function CalendarAIPanel({
  events,
  currentDate,
}: {
  events: CalendarEvent[];
  currentDate: Date;
}) {
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAI = async (action: AIAction) => {
    setActiveAction(action);
    setIsLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-ai', {
        body: {
          action,
          events: events.map(e => ({
            summary: e.summary,
            start: e.start,
            end: e.end,
            location: e.location,
            all_day: e.all_day,
            attendees: e.attendees?.map(a => ({ name: a.display_name, email: a.email, status: a.response_status })),
            has_video: !!(e.hangout_link || e.conference_data),
            description: e.description,
          })),
          current_date: format(currentDate, 'yyyy-MM-dd'),
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        setResult(null);
      } else {
        setResult(data.result);
      }
    } catch (err: any) {
      console.error('Calendar AI error:', err);
      toast.error('Failed to generate insights');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Insights</p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {AI_ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => runAI(a.id)}
            disabled={isLoading}
            className={cn(
              'flex flex-col items-center gap-1 p-2 rounded-lg text-center transition-colors',
              activeAction === a.id && result ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground',
              isLoading && activeAction === a.id && 'opacity-70',
            )}
          >
            {isLoading && activeAction === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : a.icon}
            <span className="text-[10px] font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {result && (
        <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
          <ScrollArea className="max-h-[280px]">
            <div className="prose prose-xs prose-invert max-w-none text-[11px] leading-relaxed text-foreground/90 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-[11px] [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5 [&_ul]:my-0.5 [&_ul]:pl-3 [&_li]:my-0 [&_p]:my-0.5 [&_strong]:text-foreground">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export function FullCalendarView({ open, onOpenChange }: FullCalendarViewProps) {
  const { events: liveEvents, status: calendarStatus } = useGoogleCalendar();
  const [view, setView] = useState<CalendarViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const allEvents = calendarStatus?.connected && liveEvents.length > 0 ? liveEvents : mockEvents;

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allEvents.filter(e =>
      e.summary.toLowerCase().includes(q) ||
      e.location?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q) ||
      e.attendees?.some(a => a.display_name?.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
    ).sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime()).slice(0, 10);
  }, [allEvents, searchQuery]);

  // Upcoming events (next 3 from now)
  const upcomingEvents = useMemo(() => {
    const nowDate = new Date();
    return allEvents
      .filter(e => !e.all_day && isAfter(parseISO(e.start), nowDate))
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
      .slice(0, 3);
  }, [allEvents]);

  const navigate = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') { setCurrentDate(new Date()); return; }
    const delta = direction === 'next' ? 1 : -1;
    setCurrentDate(d => {
      if (view === 'day') return delta > 0 ? addDays(d, 1) : subDays(d, 1);
      if (view === 'week') return delta > 0 ? addWeeks(d, 1) : subWeeks(d, 1);
      if (view === 'agenda') return delta > 0 ? addDays(d, 14) : subDays(d, 14);
      return delta > 0 ? addMonths(d, 1) : subMonths(d, 1);
    });
  }, [view]);

  const headerLabel = useMemo(() => {
    if (view === 'day') return format(currentDate, 'EEEE, MMMM d, yyyy');
    if (view === 'week') {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return ws.getMonth() === we.getMonth()
        ? `${format(ws, 'MMMM d')} – ${format(we, 'd, yyyy')}`
        : `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
    }
    if (view === 'agenda') {
      const end = addDays(currentDate, 13);
      return `${format(currentDate, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [currentDate, view]);

  const viewEvents = useMemo(() => {
    let start: Date, end: Date;
    if (view === 'day') { start = startOfDay(currentDate); end = endOfDay(currentDate); }
    else if (view === 'week') { start = startOfWeek(currentDate); end = endOfWeek(currentDate); }
    else if (view === 'agenda') { start = startOfDay(currentDate); end = endOfDay(addDays(currentDate, 13)); }
    else { start = startOfWeek(startOfMonth(currentDate)); end = endOfWeek(endOfMonth(currentDate)); }
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

  const handleDayClick = (date: Date) => { setCurrentDate(date); setView('day'); };

  const handleMiniDateSelect = (date: Date) => {
    setCurrentDate(date);
    if (view === 'month' || view === 'agenda') setView('day');
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

          <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => navigate('today')}>Today</Button>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('prev')}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('next')}><ChevronRight className="h-4 w-4" /></Button>
          </div>

          <h2 className="text-sm font-medium text-foreground min-w-[200px]">{headerLabel}</h2>

          <div className="flex-1" />

          {/* Search */}
          {showSearch ? (
            <div className="relative">
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 w-48 text-xs pr-7"
                autoFocus
                onBlur={() => { if (!searchQuery) setShowSearch(false); }}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6 absolute right-1 top-1" onClick={() => { setSearchQuery(''); setShowSearch(false); }}>
                <X className="h-3 w-3" />
              </Button>
              {searchQuery && searchResults.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-xl z-50 max-h-[300px] overflow-y-auto">
                  {searchResults.map((event, idx) => {
                    const start = parseISO(event.start);
                    const ci = getColorIndex(event, idx);
                    return (
                      <button
                        key={event.id}
                        className="w-full flex items-start gap-2 p-2.5 hover:bg-muted/50 text-left border-b border-border/50 last:border-b-0"
                        onClick={() => { setCurrentDate(start); setView('day'); setSelectedEvent(event); setSearchQuery(''); setShowSearch(false); }}
                      >
                        <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', EVENT_PALETTE[ci].dot)} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{event.summary}</p>
                          <p className="text-[10px] text-muted-foreground">{format(start, 'EEE, MMM d · h:mm a')}</p>
                          {event.location && <p className="text-[10px] text-muted-foreground truncate">{event.location}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {searchQuery && searchResults.length === 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-popover border border-border rounded-lg shadow-xl z-50 p-4 text-center">
                  <p className="text-xs text-muted-foreground">No events found</p>
                </div>
              )}
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSearch(true)}>
              <Search className="h-4 w-4" />
            </Button>
          )}

          {!calendarStatus?.connected && <Badge variant="secondary" className="text-[10px] h-5 mr-2">Demo Data</Badge>}

          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['day', 'week', 'month', 'agenda'] as CalendarViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize',
                  view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'agenda' ? <span className="flex items-center gap-1"><List className="h-3 w-3" />Agenda</span> : v}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Body with sidebar ─── */}
        <div className="flex-1 min-h-0 overflow-hidden flex">
          {/* Mini calendar sidebar */}
          <div className="w-56 shrink-0 border-r bg-background/50 p-3 overflow-y-auto hidden md:block">
            <MiniCalendar currentDate={currentDate} onDateSelect={handleMiniDateSelect} events={allEvents} />

            {/* Upcoming Events Widget */}
            {upcomingEvents.length > 0 && (
              <>
                <Separator className="my-3" />
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-primary" />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Coming Up</p>
                  </div>
                  <div className="space-y-1.5">
                    {upcomingEvents.map((event, idx) => {
                      const start = parseISO(event.start);
                      const end = parseISO(event.end);
                      const ci = getColorIndex(event, idx);
                      const minutesUntil = differenceInMinutes(start, new Date());
                      const timeLabel = minutesUntil <= 0 ? 'Now' : minutesUntil < 60 ? `in ${minutesUntil}m` : `in ${Math.floor(minutesUntil / 60)}h`;

                      return (
                        <button
                          key={event.id}
                          onClick={() => { setCurrentDate(start); setView('day'); setSelectedEvent(event); }}
                          className="w-full flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', EVENT_PALETTE[ci].dot)} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-foreground truncate">{event.summary}</p>
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[10px] text-muted-foreground">{format(start, 'h:mm a')}</p>
                              <Badge variant={minutesUntil <= 15 ? 'destructive' : 'secondary'} className="text-[9px] h-4 px-1">
                                {timeLabel}
                              </Badge>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Separator className="my-3" />
            <CalendarAIPanel events={viewEvents} currentDate={currentDate} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 flex flex-col">
            {view === 'month' ? (
              <MonthView currentDate={currentDate} events={allEvents} onEventClick={setSelectedEvent} onDayClick={handleDayClick} />
            ) : view === 'agenda' ? (
              <AgendaView currentDate={currentDate} events={allEvents} onEventClick={setSelectedEvent} />
            ) : (
              <>
                <AllDayBar
                  events={allDayEvents.filter(e => view === 'day' ? isSameDay(parseISO(e.start), currentDate) : true)}
                  onEventClick={setSelectedEvent}
                />
                <ScrollArea className="flex-1">
                  <div className="flex min-h-0">
                    <div className="shrink-0 w-14 border-r">
                      <div style={{ height: HOURS.length * HOUR_HEIGHT }}>
                        {HOURS.map(h => (
                          <div key={h} className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground font-medium" style={{ height: HOUR_HEIGHT }}>
                            {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}
                          </div>
                        ))}
                      </div>
                    </div>
                    {view === 'day' ? (
                      <DayColumn date={currentDate} events={getEventsForDay(currentDate)} onEventClick={setSelectedEvent} showDayLabel={false} />
                    ) : (
                      <div className="flex flex-1">
                        {weekDays.map(day => (
                          <DayColumn key={day.toISOString()} date={day} events={getEventsForDay(day)} onEventClick={setSelectedEvent} showDayLabel={true} />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        </div>

        {selectedEvent && (
          <EventDetailPopover event={selectedEvent} colorClass={getEventColorClass(selectedEvent, 0)} onClose={() => setSelectedEvent(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
