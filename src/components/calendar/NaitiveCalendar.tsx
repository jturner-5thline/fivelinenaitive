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
import { formatInTimeZone } from 'date-fns-tz';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  MapPin,
  Users,
  ExternalLink,
  Video,
  Globe,
  Check,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useCalendarEvents, usePrefetchAdjacentCalendarRanges } from '@/hooks/useCalendarEvents';
import { List, type RowComponentProps } from 'react-window';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useUserCalendarPrefs, type WorkingHours, type DayOfWeek } from '@/hooks/useUserCalendarPrefs';
import { useAttendeeFreeBusy, type AttendeeFreeBusy } from '@/hooks/useAttendeeFreeBusy';

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

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  accessHint?: 'shared' | 'limited' | 'unknown';
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
  /** Attendees to overlay free/busy for (signed-in user is always first). */
  attendees?: CalendarAttendee[];
  /** Persist TZ changes to user_email_ai_preferences. Default false. */
  persistTz?: boolean;
  /** Show working-hours dim band on the grid. Default true. */
  showWorkingHours?: boolean;
  /** Called when the user changes the TZ chip. */
  onTzChange?: (tz: string) => void;
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

/** Current UTC offset string for an IANA zone, e.g. "UTC−4". */
function tzOffsetLabel(tz: string, ref = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(ref);
    const off = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    return off.replace('GMT', 'UTC').replace('-', '−');
  } catch {
    return 'UTC';
  }
}

/** Minutes from midnight in `tz` for a given Date. */
function tzMinutesFromMidnight(d: Date, tz: string): number {
  try {
    const hm = formatInTimeZone(d, tz, 'H:m').split(':');
    return parseInt(hm[0], 10) * 60 + parseInt(hm[1] || '0', 10);
  } catch {
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** YYYY-MM-DD in `tz`. */
function tzDayKey(d: Date, tz: string): string {
  try {
    return formatInTimeZone(d, tz, 'yyyy-MM-dd');
  } catch {
    return format(d, 'yyyy-MM-dd');
  }
}

function tzFmt(d: Date, tz: string, pattern: string): string {
  try {
    return formatInTimeZone(d, tz, pattern);
  } catch {
    return format(d, pattern);
  }
}

const DAY_KEYS: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Most-used IANA zones grouped by region for the picker. */
const TZ_GROUPS: Array<{ label: string; zones: string[] }> = [
  {
    label: 'Americas',
    zones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo'],
  },
  {
    label: 'Europe',
    zones: ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Zurich'],
  },
  {
    label: 'Asia / Pacific',
    zones: ['Asia/Dubai', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'],
  },
  { label: 'UTC', zones: ['UTC'] },
];

export function NaitiveCalendar({
  view: viewProp = 'week',
  events: externalEvents,
  selectedDate,
  tz: tzProp,
  onRangeChange,
  onEventClick,
  onSlotClick,
  readOnly = false,
  highlightSlots,
  compact = false,
  className,
  scrollToHour = 7,
  attendees,
  persistTz = false,
  showWorkingHours = true,
  onTzChange,
}: Props) {
  const [view, setView] = useState<CalendarView>(viewProp);
  useEffect(() => setView(viewProp), [viewProp]);

  const prefs = useUserCalendarPrefs();

  // Effective TZ: explicit prop > saved pref > browser. Local state lets the
  // user switch via the chip without round-tripping to the DB first.
  const initialTz = tzProp || (persistTz && prefs.tz) || BROWSER_TZ;
  const [tz, setTzState] = useState<string>(initialTz);
  useEffect(() => {
    if (tzProp) {
      setTzState(tzProp);
    } else if (persistTz && prefs.isLoaded && prefs.tz && prefs.tz !== tz) {
      setTzState(prefs.tz);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tzProp, persistTz, prefs.isLoaded, prefs.tz]);

  const handleTzPick = useCallback(
    (next: string) => {
      setTzState(next);
      onTzChange?.(next);
      if (persistTz) void prefs.setTz(next);
    },
    [onTzChange, persistTz, prefs],
  );

  const [anchor, setAnchor] = useState<Date>(() => selectedDate ?? new Date());
  useEffect(() => {
    if (selectedDate) setAnchor(selectedDate);
  }, [selectedDate?.getTime()]);

  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const [hoverDayIdx, setHoverDayIdx] = useState<number | null>(null);

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
  // Prefetch the previous + next range so prev/next nav is instant.
  usePrefetchAdjacentCalendarRanges({ range, tz, enabled: !externalEvents });
  const events = externalEvents ?? fetched ?? [];

  // Attendee free/busy overlay — only fires when attendees are passed.
  const attendeeEmails = useMemo(() => (attendees ?? []).map((a) => a.email.toLowerCase()), [attendees]);
  const { data: freeBusy } = useAttendeeFreeBusy({
    range,
    emails: attendeeEmails,
    enabled: !!attendees && attendees.length > 0,
  });

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
          <TzChip
            tz={tz}
            recent={prefs.recentTz}
            onPick={handleTzPick}
          />
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
          tz={tz}
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
          tz={tz}
          workingHours={showWorkingHours ? prefs.workingHours : null}
          onHoverChange={(d, m) => {
            setHoverDayIdx(d);
            setHoverMin(m);
          }}
        />
      )}

      {/* Attendee free/busy strip — only when attendees are passed. */}
      {view !== 'agenda' && attendees && attendees.length > 0 && (
        <AttendeeStrip
          anchor={anchor}
          view={view as 'day' | 'week'}
          attendees={attendees}
          freeBusy={freeBusy ?? []}
          tz={tz}
          hoverDayIdx={hoverDayIdx}
          hoverMin={hoverMin}
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
  tz: string;
  workingHours: WorkingHours | null;
  onHoverChange?: (dayIdx: number | null, minutes: number | null) => void;
}

function TimeGridView({
  view, anchor, events, highlightSlots, now, hourHeight, scrollRef, onEventClick, onSlotClick, compact,
  tz, workingHours, onHoverChange,
}: TimeGridProps) {
  const days = view === 'day' ? [startOfDay(anchor)] : getWeekDays(anchor);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const slotsPerHour = 60 / SLOT_MINUTES;

  // Bucket events into the day column they fall on *in the active TZ*.
  const dayKeys = days.map((d) => tzDayKey(d, tz));
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    for (let i = 0; i < dayKeys.length; i++) map[i] = [];
    for (const ev of events) {
      if (ev.all_day) continue;
      const k = tzDayKey(new Date(ev.start), tz);
      const idx = dayKeys.indexOf(k);
      if (idx >= 0) map[idx].push(ev);
    }
    return map;
  }, [events, dayKeys.join('|'), tz]);

  const allDayByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    for (let i = 0; i < dayKeys.length; i++) map[i] = [];
    for (const ev of events) {
      if (!ev.all_day) continue;
      const k = tzDayKey(new Date(ev.start), tz);
      const idx = dayKeys.indexOf(k);
      if (idx >= 0) map[idx].push(ev);
    }
    return map;
  }, [events, dayKeys.join('|'), tz]);

  const highlightByDay = useMemo(() => {
    const map: Record<number, HighlightSlot[]> = {};
    for (let i = 0; i < dayKeys.length; i++) map[i] = [];
    for (const slot of highlightSlots ?? []) {
      const k = tzDayKey(new Date(slot.start), tz);
      const idx = dayKeys.indexOf(k);
      if (idx >= 0) map[idx].push(slot);
    }
    return map;
  }, [highlightSlots, dayKeys.join('|'), tz]);

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
                        onMouseEnter={() => onHoverChange?.(dayIdx, h * 60 + s * SLOT_MINUTES)}
                        onMouseLeave={() => onHoverChange?.(null, null)}
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

                  {/* Working-hours dim band (outside-of-hours subtly darker). */}
                  {workingHours && (() => {
                    // Day-of-week in the user's TZ
                    const dowKey = (tzFmt(d, tz, 'EEE').toLowerCase().slice(0, 3) as DayOfWeek);
                    const wh = workingHours[dowKey];
                    if (!wh) {
                      return (
                        <div
                          className="pointer-events-none absolute left-0 right-0 bg-foreground/[0.05]"
                          style={{ top: 0, height: hours.length * hourHeight }}
                          aria-hidden
                        />
                      );
                    }
                    const [sh, sm] = wh.start.split(':').map((x) => parseInt(x, 10));
                    const [eh, em] = wh.end.split(':').map((x) => parseInt(x, 10));
                    const startMin = sh * 60 + sm;
                    const endMin = eh * 60 + em;
                    return (
                      <>
                        {startMin > 0 && (
                          <div
                            className="pointer-events-none absolute left-0 right-0 bg-foreground/[0.05]"
                            style={{ top: 0, height: (startMin / 60) * hourHeight }}
                            aria-hidden
                          />
                        )}
                        {endMin < 24 * 60 && (
                          <div
                            className="pointer-events-none absolute left-0 right-0 bg-foreground/[0.05]"
                            style={{
                              top: (endMin / 60) * hourHeight,
                              height: ((24 * 60 - endMin) / 60) * hourHeight,
                            }}
                            aria-hidden
                          />
                        )}
                      </>
                    );
                  })()}

                  {/* Highlight slots (e.g. proposed meeting times) */}
                  {dayHighlights.map((slot, i) => {
                    const s = new Date(slot.start);
                    const e = new Date(slot.end);
                    const top = (tzMinutesFromMidnight(s, tz) / 60) * hourHeight;
                    const height = Math.max(12, ((tzMinutesFromMidnight(e, tz) - tzMinutesFromMidnight(s, tz)) / 60) * hourHeight - 2);
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
                    const mins = tzMinutesFromMidnight(now, tz);
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
                    const top = (tzMinutesFromMidnight(s, tz) / 60) * hourHeight;
                    const height = Math.max(14, ((tzMinutesFromMidnight(e, tz) - tzMinutesFromMidnight(s, tz)) / 60) * hourHeight - 2);
                    const accent = ev.color
                      ? { borderColor: ev.color, backgroundColor: `${ev.color}26` }
                      : undefined;
                    return (
                      <button
                        key={ev.id ?? `${ev.start}-${i}`}
                        type="button"
                        onClick={() => onEventClick(ev)}
                        aria-label={`${ev.title || 'Busy'} at ${tzFmt(s, tz, 'h:mm a')}`}
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
                            {tzFmt(s, tz, 'h:mm')}–{tzFmt(e, tz, 'h:mm a')}
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
  tz,
}: {
  events: CalEvent[];
  highlightSlots?: HighlightSlot[];
  onEventClick: (ev: CalEvent) => void;
  tz: string;
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

  // Flatten into a row array so we can virtualize uniformly when the
  // agenda gets long. Each row is either a day header, an event, or one
  // of the trailing highlight (proposed-slot) rows. Below the threshold
  // we fall through to the original block layout (cheap, no virtualizer
  // overhead for small ranges).
  type Row =
    | { kind: 'day'; key: string; day: string }
    | { kind: 'event'; key: string; event: CalEvent }
    | { kind: 'hl-header'; key: string }
    | { kind: 'hl'; key: string; slot: HighlightSlot };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const [day, items] of grouped) {
      out.push({ kind: 'day', key: `d-${day}`, day });
      for (let i = 0; i < items.length; i++) {
        const ev = items[i];
        out.push({ kind: 'event', key: ev.id ?? `e-${day}-${i}`, event: ev });
      }
    }
    if ((highlightSlots ?? []).length > 0) {
      out.push({ kind: 'hl-header', key: 'hl-header' });
      (highlightSlots ?? []).forEach((slot, i) =>
        out.push({ kind: 'hl', key: `hl-${i}`, slot }),
      );
    }
    return out;
  }, [grouped, highlightSlots]);

  const VIRTUALIZE_THRESHOLD = 50;

  if (rows.length > VIRTUALIZE_THRESHOLD) {
    return (
      <List
        rowCount={rows.length}
        rowHeight={(idx) => {
          const r = rows[idx];
          if (r.kind === 'day' || r.kind === 'hl-header') return 28;
          return 36;
        }}
        rowProps={{ rows, onEventClick }}
        rowComponent={AgendaVirtualRow}
        style={{ height: 520 }}
        className="divide-y divide-white/[0.05]"
      />
    );
  }

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

/* ---------- TZ chip + picker ---------- */

function TzChip({
  tz,
  recent,
  onPick,
}: {
  tz: string;
  recent: string[];
  onPick: (tz: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const offset = tzOffsetLabel(tz);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return TZ_GROUPS.map((g) => ({
      label: g.label,
      zones: g.zones.filter((z) => !term || z.toLowerCase().includes(term)),
    })).filter((g) => g.zones.length > 0);
  }, [q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground hover:bg-white/[0.04] mr-1"
          aria-label={`Time zone: ${tz} ${offset}`}
          title={`${tz} · ${offset}`}
        >
          <Globe className="h-3 w-3" />
          <span className="hidden md:inline">{tz}</span>
          <span className="md:hidden">{tz.split('/').pop()}</span>
          <span className="opacity-70">· {offset}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-2 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search IANA zone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-7 pl-7 text-[11.5px]"
            />
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {recent.length > 0 && !q && (
            <div className="py-1">
              <div className="px-2 text-[9.5px] uppercase tracking-wide text-muted-foreground">Recent</div>
              {recent.map((z) => (
                <TzRow key={`r-${z}`} zone={z} active={z === tz} onPick={(zz) => { onPick(zz); setOpen(false); }} />
              ))}
            </div>
          )}
          {filtered.map((g) => (
            <div key={g.label} className="py-1">
              <div className="px-2 text-[9.5px] uppercase tracking-wide text-muted-foreground">{g.label}</div>
              {g.zones.map((z) => (
                <TzRow key={z} zone={z} active={z === tz} onPick={(zz) => { onPick(zz); setOpen(false); }} />
              ))}
            </div>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function TzRow({ zone, active, onPick }: { zone: string; active: boolean; onPick: (z: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(zone)}
      className={cn(
        'w-full flex items-center justify-between px-2 py-1 text-left text-[11.5px] hover:bg-white/[0.05]',
        active && 'text-primary',
      )}
    >
      <span>{zone}</span>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {tzOffsetLabel(zone)}
        {active && <Check className="h-3 w-3 text-primary" />}
      </span>
    </button>
  );
}

/* ---------- Attendee free/busy strip ---------- */

function AttendeeStrip({
  anchor,
  view,
  attendees,
  freeBusy,
  tz,
  hoverDayIdx,
  hoverMin,
}: {
  anchor: Date;
  view: 'day' | 'week';
  attendees: CalendarAttendee[];
  freeBusy: AttendeeFreeBusy[];
  tz: string;
  hoverDayIdx: number | null;
  hoverMin: number | null;
}) {
  const days = view === 'day' ? [startOfDay(anchor)] : getWeekDays(anchor);
  const dayKeys = days.map((d) => tzDayKey(d, tz));
  const COL_HEIGHT = 18;
  const gridCols = view === 'day' ? '120px 1fr' : '120px repeat(7,1fr)';

  const byEmail = useMemo(() => {
    const map = new Map<string, AttendeeFreeBusy>();
    for (const r of freeBusy) map.set(r.email.toLowerCase(), r);
    return map;
  }, [freeBusy]);

  return (
    <div className="border-t border-white/[0.06] bg-white/[0.015]">
      <div className="px-2 py-1 text-[9.5px] uppercase tracking-wide text-muted-foreground/80 flex items-center gap-2">
        <Users className="h-3 w-3" /> Attendees free/busy <span className="text-[9px] opacity-60">({tz})</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {days.map((d, i) => (
          <div key={i} className="text-center text-[9.5px] text-muted-foreground/70 py-0.5">
            {tzFmt(d, tz, 'EEE d')}
          </div>
        ))}
      </div>
      <div className="divide-y divide-white/[0.04]">
        {attendees.map((a, rowIdx) => {
          const row = byEmail.get(a.email.toLowerCase());
          const limited = !row || row.visibility === 'limited';
          return (
            <div key={a.email} className="grid items-center" style={{ gridTemplateColumns: gridCols }}>
              <div className="px-2 py-1 text-[10.5px] truncate flex items-center gap-1.5" title={a.email}>
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', limited ? 'bg-amber-400' : 'bg-emerald-400')} />
                <span className="truncate">{a.displayName || a.email}</span>
                {rowIdx === 0 && <span className="text-[9px] text-muted-foreground">(you)</span>}
              </div>
              {days.map((d, dayIdx) => (
                <div
                  key={dayIdx}
                  className={cn(
                    'relative border-l border-white/[0.04]',
                    limited &&
                      'bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(251,191,36,0.18)_4px_8px)]',
                  )}
                  style={{ height: COL_HEIGHT }}
                  title={limited ? 'Visibility limited' : undefined}
                >
                  {limited && rowIdx > 0 && dayIdx === 0 && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8.5px] text-amber-300 whitespace-nowrap pointer-events-none">
                      Visibility limited
                    </span>
                  )}
                  {!limited &&
                    (row?.busy ?? [])
                      .filter((b) => tzDayKey(new Date(b.start), tz) === dayKeys[dayIdx])
                      .map((b, bi) => {
                        const startMin = tzMinutesFromMidnight(new Date(b.start), tz);
                        const endMin = tzMinutesFromMidnight(new Date(b.end), tz);
                        const dayMin = 24 * 60;
                        const left = (startMin / dayMin) * 100;
                        const width = Math.max(1, ((endMin - startMin) / dayMin) * 100);
                        const conflict =
                          hoverDayIdx === dayIdx &&
                          hoverMin !== null &&
                          hoverMin >= startMin &&
                          hoverMin < endMin;
                        return (
                          <div
                            key={bi}
                            className={cn(
                              'absolute top-1 bottom-1 rounded-[2px]',
                              conflict ? 'bg-rose-500/70' : 'bg-primary/40',
                            )}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${tzFmt(new Date(b.start), tz, 'h:mm a')} – ${tzFmt(new Date(b.end), tz, 'h:mm a')}`}
                          />
                        );
                      })}
                  {/* Hover vertical guide */}
                  {hoverDayIdx === dayIdx && hoverMin !== null && (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/70"
                      style={{ left: `${(hoverMin / (24 * 60)) * 100}%` }}
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
