/**
 * NaitiveCalendar
 * ---------------
 * Canonical, props-driven calendar component used by both /insights
 * ("My Week") and the AI Email Assistant availability picker. Replaces
 * the prior InteractiveWeekCalendar — one implementation, two consumers.
 *
 * Views: day | week (default) | agenda.
 *
 * Data: when no `events` prop is supplied, fetches the signed-in user's
 * primary Google Calendar via `useCalendarEvents`. Pass `events` to drive
 * the component from caller-owned state instead.
 *
 * Extension points (intentionally NOT implemented here):
 *  - Cross-attendee free/busy overlay  → fix #1, will read `overlayEvents`.
 *  - Pre-send re-verification & soft-holds → fix #4, will use `onHoldSlot`.
 * Both will be additive — the current API is forward-compatible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  addDays,
  addMinutes,
  format,
  isSameDay,
  isToday,
  differenceInMinutes,
  startOfDay,
  endOfDay,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  MapPin,
  Users,
  ExternalLink,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';

export interface CalEvent {
  id?: string;
  title?: string | null;
  start: string;
  end: string;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  hangoutLink?: string | null;
  attendees?: Array<{ email?: string; name?: string; status?: string }> | null;
  color?: string | null;
}

export type CalendarView = 'day' | 'week' | 'agenda';

export interface HighlightSlot {
  start: string | Date;
  end: string | Date;
  label?: string;
}

interface Props {
  view?: CalendarView;
  events?: CalEvent[];
  selectedDate?: Date;
  tz?: string;
  onRangeChange?: (range: { start: Date; end: Date; view: CalendarView }) => void;
  onEventClick?: (event: CalEvent) => void;
  onSlotClick?: (slot: { start: Date; end: Date }) => void;
  readOnly?: boolean;
  highlightSlots?: HighlightSlot[];
  compact?: boolean;
  className?: string;
  /** Default scroll target hour (0-23). Defaults to 7. */
  scrollToHour?: number;
}

const HOUR_HEIGHT_NORMAL = 44;
const HOUR_HEIGHT_COMPACT = 32;
const SLOT_MINUTES = 30;

const BROWSER_TZ =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function fmtHourLabel(h: number): string {
  if (h === 0) return '';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

export function NaitiveCalendar({
  view: viewProp = 'week',
  events: externalEvents,
  selectedDate,
  tz = BROWSER_TZ,
  onRangeChange,
  onEventClick,
  onSlotClick,
  readOnly = false,
  highlightSlots,
  compact = false,
  className,
  scrollToHour = 7,
}: Props) {
  const [view, setView] = useState<CalendarView>(viewProp);
  useEffect(() => setView(viewProp), [viewProp]);

  const [anchor, setAnchor] = useState<Date>(() => selectedDate ?? new Date());
  useEffect(() => {
    if (selectedDate) setAnchor(selectedDate);
  }, [selectedDate?.getTime()]);

  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Tick "now" every minute for the live indicator.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const HOUR_HEIGHT = compact ? HOUR_HEIGHT_COMPACT : HOUR_HEIGHT_NORMAL;

  // Derive the visible range from anchor + view.
  const range = useMemo(() => {
    if (view === 'day') return { start: startOfDay(anchor), end: endOfDay(anchor) };
    if (view === 'agenda') {
      return { start: startOfDay(anchor), end: endOfDay(addDays(anchor, 13)) };
    }
    return {
      start: startOfWeek(anchor, { weekStartsOn: 1 }),
      end: endOfWeek(anchor, { weekStartsOn: 1 }),
    };
  }, [anchor, view]);

  // Notify parent.
  useEffect(() => {
    onRangeChange?.({ start: range.start, end: range.end, view });
  }, [range.start.getTime(), range.end.getTime(), view, onRangeChange]);

  // Fetch events when no external array is supplied.
  const { data: fetched, isFetching } = useCalendarEvents({
    range,
    tz,
    enabled: !externalEvents,
  });
  const events = externalEvents ?? fetched ?? [];

  // Auto-scroll to scrollToHour on mount or week change.
  useEffect(() => {
    if (scrollRef.current && view !== 'agenda') {
      scrollRef.current.scrollTop = Math.max(0, scrollToHour * HOUR_HEIGHT - 20);
    }
  }, [view, HOUR_HEIGHT, anchor.getTime(), scrollToHour]);

  // Navigation.
  const goPrev = useCallback(() => {
    setAnchor((d) =>
      view === 'week' ? addWeeks(d, -1) : view === 'day' ? addDays(d, -1) : addDays(d, -14),
    );
  }, [view]);
  const goNext = useCallback(() => {
    setAnchor((d) =>
      view === 'week' ? addWeeks(d, 1) : view === 'day' ? addDays(d, 1) : addDays(d, 14),
    );
  }, [view]);
  const goToday = useCallback(() => setAnchor(new Date()), []);

  // Keyboard navigation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key.toLowerCase() === 't') goToday();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, goToday]);

  const handleEventClick = (ev: CalEvent) => {
    if (onEventClick) onEventClick(ev);
    else setSelected(ev);
  };

  const handleSlotClick = (start: Date) => {
    if (readOnly || !onSlotClick) return;
    onSlotClick({ start, end: addMinutes(start, SLOT_MINUTES) });
  };

  // Header label.
  const headerLabel = useMemo(() => {
    if (view === 'day') return format(anchor, 'EEEE, MMM d, yyyy');
    if (view === 'agenda') return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`;
    const ws = range.start;
    const we = range.end;
    return `${format(ws, 'MMM d')} – ${format(we, ws.getMonth() === we.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')}`;
  }, [anchor, view, range.start, range.end]);

  return (
    <div className={cn('rounded-lg border border-white/10 bg-card/40 flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.06]">
        <CalendarDays className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11.5px] font-medium text-foreground">{headerLabel}</span>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex items-center gap-1">
          {/* Segmented view switch */}
          <div className="hidden sm:flex items-center rounded-md border border-white/10 overflow-hidden mr-1">
            {(['day', 'week', 'agenda'] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'px-2 py-0.5 text-[10.5px] capitalize',
                  view === v ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={goToday} className="h-6 px-2 text-[10.5px]" aria-label="Today">
            Today
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={goPrev} className="h-6 w-6" aria-label="Previous">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={goNext} className="h-6 w-6" aria-label="Next">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {view === 'agenda' ? (
        <AgendaView
          events={events}
          highlightSlots={highlightSlots}
          onEventClick={handleEventClick}
        />
      ) : (
        <TimeGridView
          view={view}
          anchor={anchor}
          events={events}
          highlightSlots={highlightSlots}
          now={now}
          hourHeight={HOUR_HEIGHT}
          scrollRef={scrollRef}
          onEventClick={handleEventClick}
          onSlotClick={handleSlotClick}
          compact={compact}
        />
      )}

      {/* Default event detail panel (only used when onEventClick prop is unset). */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selected && <EventDetail event={selected} tz={tz} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------- Sub-components ---------- */

interface TimeGridProps {
  view: 'day' | 'week';
  anchor: Date;
  events: CalEvent[];
  highlightSlots?: HighlightSlot[];
  now: Date;
  hourHeight: number;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  onEventClick: (ev: CalEvent) => void;
  onSlotClick: (start: Date) => void;
  compact: boolean;
}

function TimeGridView({
  view, anchor, events, highlightSlots, now, hourHeight, scrollRef, onEventClick, onSlotClick, compact,
}: TimeGridProps) {
  const days = view === 'day' ? [startOfDay(anchor)] : getWeekDays(anchor);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const slotsPerHour = 60 / SLOT_MINUTES;

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    for (let i = 0; i < days.length; i++) map[i] = [];
    for (const ev of events) {
      if (ev.all_day) continue;
      const s = new Date(ev.start);
      const idx = days.findIndex((d) => isSameDay(d, s));
      if (idx >= 0) map[idx].push(ev);
    }
    return map;
  }, [events, days]);

  const allDayByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    for (let i = 0; i < days.length; i++) map[i] = [];
    for (const ev of events) {
      if (!ev.all_day) continue;
      const s = new Date(ev.start);
      const idx = days.findIndex((d) => isSameDay(d, s));
      if (idx >= 0) map[idx].push(ev);
    }
    return map;
  }, [events, days]);

  const highlightByDay = useMemo(() => {
    const map: Record<number, HighlightSlot[]> = {};
    for (let i = 0; i < days.length; i++) map[i] = [];
    for (const slot of highlightSlots ?? []) {
      const s = new Date(slot.start);
      const idx = days.findIndex((d) => isSameDay(d, s));
      if (idx >= 0) map[idx].push(slot);
    }
    return map;
  }, [highlightSlots, days]);

  const gridCols = view === 'day' ? '44px 1fr' : '44px repeat(7,1fr)';

  return (
    <>
      {/* Day headers */}
      <div className="grid border-b border-white/[0.06] bg-white/[0.02]" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {days.map((d, i) => {
          const today = isToday(d);
          return (
            <div
              key={i}
              className={cn('flex flex-col items-center py-1 text-[10px]', today ? 'text-primary' : 'text-muted-foreground')}
            >
              <span className="uppercase tracking-wide">{format(d, 'EEE')}</span>
              <span
                className={cn(
                  'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  today ? 'bg-primary text-primary-foreground' : 'text-foreground/85',
                )}
              >
                {format(d, 'd')}
              </span>
              {(allDayByDay[i] ?? []).length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5 w-full px-1">
                  {(allDayByDay[i] ?? []).slice(0, 2).map((ev, k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onEventClick(ev)}
                      className="truncate rounded-sm bg-primary/15 px-1 text-[9px] text-foreground/85 hover:bg-primary/25"
                      title={ev.title || 'All day'}
                    >
                      {ev.title || 'All day'}
                    </button>
                  ))}
                  {(allDayByDay[i] ?? []).length > 2 && (
                    <div className="text-[9px] text-muted-foreground">+{(allDayByDay[i] ?? []).length - 2}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <ScrollArea style={{ height: compact ? 320 : 520 }}>
        <div ref={scrollRef as any} className="relative" style={{ height: hours.length * hourHeight }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: gridCols }}>
            {/* Time gutter */}
            <div className="relative border-r border-white/[0.05]">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 pr-1 text-right text-[9.5px] text-muted-foreground/70"
                  style={{ top: h * hourHeight - 5 }}
                >
                  {fmtHourLabel(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((d, dayIdx) => {
              const today = isToday(d);
              const dayEvents = eventsByDay[dayIdx] ?? [];
              const dayHighlights = highlightByDay[dayIdx] ?? [];
              return (
                <div
                  key={dayIdx}
                  className={cn('relative border-r border-white/[0.05]', today && 'bg-primary/[0.04]')}
                >
                  {/* Slot click targets — 30-min granularity */}
                  {hours.map((h) =>
                    Array.from({ length: slotsPerHour }).map((_, s) => (
                      <button
                        key={`${h}-${s}`}
                        type="button"
                        onClick={() => onSlotClick(addMinutes(startOfDay(d), h * 60 + s * SLOT_MINUTES))}
                        aria-label={`${format(d, 'EEE')} ${h}:${String(s * SLOT_MINUTES).padStart(2, '0')}`}
                        className="absolute left-0 right-0 hover:bg-white/[0.04]"
                        style={{ top: h * hourHeight + (s * hourHeight) / slotsPerHour, height: hourHeight / slotsPerHour }}
                      />
                    )),
                  )}

                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div
                      key={`l-${h}`}
                      className="pointer-events-none absolute left-0 right-0 border-t border-white/[0.04]"
                      style={{ top: h * hourHeight }}
                    />
                  ))}

                  {/* Highlight slots (e.g. proposed meeting times) */}
                  {dayHighlights.map((slot, i) => {
                    const s = new Date(slot.start);
                    const e = new Date(slot.end);
                    const top = (differenceInMinutes(s, startOfDay(d)) / 60) * hourHeight;
                    const height = Math.max(12, (differenceInMinutes(e, s) / 60) * hourHeight - 2);
                    return (
                      <div
                        key={`h-${i}`}
                        className="pointer-events-none absolute left-1 right-1 z-[5] rounded-sm border border-emerald-400/60 bg-emerald-400/15"
                        style={{ top, height }}
                        title={slot.label || 'Proposed time'}
                      >
                        {slot.label && (
                          <div className="px-1 text-[9px] text-emerald-200 truncate">{slot.label}</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Now indicator */}
                  {today && (() => {
                    const mins = differenceInMinutes(now, startOfDay(d));
                    const top = (mins / 60) * hourHeight;
                    if (top < 0 || top > hours.length * hourHeight) return null;
                    return (
                      <>
                        <div className="pointer-events-none absolute left-0 right-0 z-20 h-px bg-rose-500" style={{ top }} />
                        <div className="pointer-events-none absolute z-20 h-2 w-2 -translate-y-1/2 rounded-full bg-rose-500" style={{ top, left: -3 }} />
                      </>
                    );
                  })()}

                  {/* Events */}
                  {dayEvents.map((ev, i) => {
                    const s = new Date(ev.start);
                    const e = new Date(ev.end);
                    const top = (differenceInMinutes(s, startOfDay(d)) / 60) * hourHeight;
                    const height = Math.max(14, (differenceInMinutes(e, s) / 60) * hourHeight - 2);
                    const accent = ev.color
                      ? { borderColor: ev.color, backgroundColor: `${ev.color}26` }
                      : undefined;
                    return (
                      <button
                        key={ev.id ?? `${ev.start}-${i}`}
                        type="button"
                        onClick={() => onEventClick(ev)}
                        aria-label={`${ev.title || 'Busy'} at ${format(s, 'h:mm a')}`}
                        className={cn(
                          'absolute left-1 right-1 z-10 overflow-hidden rounded-sm border px-1.5 py-0.5 text-left',
                          !accent && 'border-primary/40 bg-primary/15',
                          'text-foreground hover:brightness-125 transition',
                        )}
                        style={{ top, height, ...accent }}
                      >
                        <div className="truncate text-[10px] font-medium leading-tight">{ev.title || 'Busy'}</div>
                        {height > 28 && (
                          <div className="truncate text-[9px] text-muted-foreground leading-tight">
                            {format(s, 'h:mm')}–{format(e, 'h:mm a')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </>
  );
}

function AgendaView({
  events,
  highlightSlots,
  onEventClick,
}: {
  events: CalEvent[];
  highlightSlots?: HighlightSlot[];
  onEventClick: (ev: CalEvent) => void;
}) {
  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const ev of sorted) {
      const k = format(new Date(ev.start), 'yyyy-MM-dd');
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
    }
    return Array.from(map.entries());
  }, [sorted]);

  return (
    <ScrollArea style={{ height: 520 }}>
      <div className="divide-y divide-white/[0.05]">
        {grouped.length === 0 && (
          <div className="px-3 py-6 text-center text-[11.5px] text-muted-foreground">No events in this range.</div>
        )}
        {grouped.map(([day, items]) => (
          <div key={day} className="py-2 px-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              {format(new Date(day), 'EEEE, MMM d')}
            </div>
            <div className="space-y-1">
              {items.map((ev, i) => (
                <button
                  key={ev.id ?? `${day}-${i}`}
                  type="button"
                  onClick={() => onEventClick(ev)}
                  className="w-full flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left hover:bg-white/[0.05]"
                >
                  <span className="text-[10.5px] text-muted-foreground w-20 shrink-0">
                    {ev.all_day ? 'All day' : `${format(new Date(ev.start), 'h:mm a')}`}
                  </span>
                  <span className="text-[11.5px] text-foreground truncate flex-1">{ev.title || 'Busy'}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {(highlightSlots ?? []).length > 0 && (
          <div className="py-2 px-3">
            <div className="text-[10px] uppercase tracking-wide text-emerald-300 mb-1">Proposed slots</div>
            <div className="space-y-1">
              {(highlightSlots ?? []).map((slot, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5"
                >
                  <span className="text-[10.5px] text-emerald-200 w-32 shrink-0">
                    {format(new Date(slot.start), 'EEE MMM d, h:mm a')}
                  </span>
                  <span className="text-[11.5px] text-foreground">{slot.label || 'Proposed time'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function EventDetail({ event, tz }: { event: CalEvent; tz: string }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className="pr-6 text-left text-base">{event.title || 'Busy'}</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-start gap-2 text-muted-foreground">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-foreground">{format(new Date(event.start), 'EEEE, MMM d, yyyy')}</div>
            <div>
              {format(new Date(event.start), 'h:mm a')}–{format(new Date(event.end), 'h:mm a')}{' '}
              <span className="text-[10px]">({tz})</span>
            </div>
          </div>
        </div>
        {event.location && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-foreground">{event.location}</span>
          </div>
        )}
        {event.hangoutLink && (
          <a href={event.hangoutLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Video className="h-4 w-4" /> Join video call
          </a>
        )}
        {event.attendees && event.attendees.length > 0 && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <Users className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              {event.attendees.slice(0, 12).map((a, i) => (
                <div key={i} className="text-foreground/85 text-xs">
                  {a.name || a.email}
                  {a.status && <span className="ml-1 text-[10px] text-muted-foreground">· {a.status}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {event.description && (
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-xs text-foreground/85 whitespace-pre-wrap">
            {event.description}
          </div>
        )}
        {event.htmlLink && (
          <a href={event.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" /> Open in Google Calendar
          </a>
        )}
      </div>
    </>
  );
}

export default NaitiveCalendar;
