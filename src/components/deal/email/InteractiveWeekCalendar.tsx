import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  addDays,
  format,
  isSameDay,
  isToday,
  differenceInMinutes,
  startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, MapPin, Users, ExternalLink, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * InteractiveWeekCalendar
 * -----------------------
 * Live, scrollable, navigable week view of the user's connected Google
 * Calendar (via the `calendar-events` edge function). Used inside the
 * MeetingSchedulerCard email pop-up so users can actually see their
 * week — not just a static preview — while proposing times.
 *
 * Features:
 *  - Vertical scroll through hours (0–24, auto-scrolled to 7am).
 *  - Prev/next week arrows + ← / → keyboard shortcuts.
 *  - "Today" button jumps back to the current week.
 *  - Highlights today's column and renders a "now" indicator line.
 *  - Click an event to open a detail Sheet with title, time, location,
 *    description, attendees and link out to Google Calendar.
 *  - Dark theme tokens to match the Naitive design system.
 */

export interface CalEvent {
  id?: string;
  title?: string | null;
  start: string; // ISO
  end: string;   // ISO
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  hangoutLink?: string | null;
  attendees?: Array<{ email?: string; name?: string; status?: string }> | null;
}

interface Props {
  /** Optional class for the outer wrapper. */
  className?: string;
  /** Optional initial date (defaults to today). */
  initialDate?: Date;
  /** Height in px for the scrollable grid area. Defaults to 360. */
  gridHeight?: number;
  /** Optional pre-loaded events to avoid a duplicate fetch. */
  events?: CalEvent[];
}

const HOUR_HEIGHT = 44; // px per hour
const START_HOUR = 0;
const END_HOUR = 24;

function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 }); // Monday
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function InteractiveWeekCalendar({
  className,
  initialDate,
  gridHeight = 360,
  events: externalEvents,
}: Props) {
  const [anchor, setAnchor] = useState<Date>(() => initialDate ?? new Date());
  const [events, setEvents] = useState<CalEvent[]>(externalEvents ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const weekDays = useMemo(() => getWeekDays(anchor), [anchor]);
  const weekStart = weekDays[0];
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });

  // Tick "now" every minute for the live time indicator.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to 7am on mount / week change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }
  }, []);

  // Fetch events for the visible week (skip if external events provided).
  useEffect(() => {
    if (externalEvents) {
      setEvents(externalEvents);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.functions.invoke('calendar-events', {
          body: {
            action: 'list',
            time_min: weekStart.toISOString(),
            time_max: weekEnd.toISOString(),
            max_results: 500,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const rows: CalEvent[] = (data?.events || []).map((e: any) => ({
          id: e.id,
          title: e.title || e.summary || e.subject || null,
          start: e.start,
          end: e.end,
          all_day: !!e.all_day,
          location: e.location ?? null,
          description: e.description ?? null,
          htmlLink: e.htmlLink ?? e.html_link ?? null,
          hangoutLink: e.hangoutLink ?? e.hangout_link ?? e.conferenceUrl ?? null,
          attendees: e.attendees ?? null,
        }));
        setEvents(rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load calendar events.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekStart.getTime(), weekEnd.getTime(), externalEvents]);

  const goPrev = useCallback(() => setAnchor((d) => addWeeks(d, -1)), []);
  const goNext = useCallback(() => setAnchor((d) => addWeeks(d, 1)), []);
  const goToday = useCallback(() => setAnchor(new Date()), []);

  // Keyboard navigation (← / →) when not typing in an input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      else if (e.key.toLowerCase() === 't') { goToday(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext, goToday]);

  // Group events by day index (0..6) for layout.
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalEvent[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];
    for (const ev of events) {
      if (ev.all_day) continue;
      const start = new Date(ev.start);
      const dayIdx = weekDays.findIndex((d) => isSameDay(d, start));
      if (dayIdx >= 0) map[dayIdx].push(ev);
    }
    return map;
  }, [events, weekDays]);

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR),
    [],
  );

  const labelStart = format(weekStart, 'MMM d');
  const labelEnd = format(weekDays[6], weekDays[6].getMonth() === weekStart.getMonth() ? 'd, yyyy' : 'MMM d, yyyy');

  return (
    <div className={cn('rounded-lg border border-white/10 bg-card/40', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.06]">
        <CalendarDays className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11.5px] font-medium text-foreground">
          {labelStart} – {labelEnd}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goToday}
            className="h-6 px-2 text-[10.5px]"
            aria-label="Jump to current week"
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={goPrev}
            className="h-6 w-6"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={goNext}
            className="h-6 w-6"
            aria-label="Next week"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-white/[0.06] bg-white/[0.02]">
        <div />
        {weekDays.map((d, i) => {
          const today = isToday(d);
          return (
            <div
              key={i}
              className={cn(
                'flex flex-col items-center py-1 text-[10px]',
                today ? 'text-primary' : 'text-muted-foreground',
              )}
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
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-2.5 py-1.5 text-[11px] text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
          {error}
        </div>
      )}

      {/* Scrollable grid */}
      <ScrollArea style={{ height: gridHeight }}>
        <div
          ref={scrollRef as any}
          className="relative"
          style={{ height: hours.length * HOUR_HEIGHT }}
        >
          <div className="absolute inset-0 grid grid-cols-[44px_repeat(7,1fr)]">
            {/* Time gutter */}
            <div className="relative border-r border-white/[0.05]">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 pr-1 text-right text-[9.5px] text-muted-foreground/70"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 5 }}
                >
                  {h === 0 ? '' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d, dayIdx) => {
              const today = isToday(d);
              const dayEvents = eventsByDay[dayIdx] || [];
              return (
                <div
                  key={dayIdx}
                  className={cn(
                    'relative border-r border-white/[0.05]',
                    today && 'bg-primary/[0.04]',
                  )}
                >
                  {/* Hour grid lines */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-white/[0.04]"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Now indicator */}
                  {today && (() => {
                    const mins = differenceInMinutes(now, startOfDay(d));
                    const top = (mins / 60) * HOUR_HEIGHT;
                    if (top < 0 || top > hours.length * HOUR_HEIGHT) return null;
                    return (
                      <>
                        <div
                          className="absolute left-0 right-0 z-20 h-px bg-rose-500"
                          style={{ top }}
                        />
                        <div
                          className="absolute z-20 h-2 w-2 -translate-y-1/2 rounded-full bg-rose-500"
                          style={{ top, left: -3 }}
                        />
                      </>
                    );
                  })()}

                  {/* Events */}
                  {dayEvents.map((ev, i) => {
                    const s = new Date(ev.start);
                    const e = new Date(ev.end);
                    const top = (differenceInMinutes(s, startOfDay(d)) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      14,
                      (differenceInMinutes(e, s) / 60) * HOUR_HEIGHT - 2,
                    );
                    return (
                      <button
                        key={ev.id ?? `${ev.start}-${i}`}
                        type="button"
                        onClick={() => setSelected(ev)}
                        aria-label={`${ev.title || 'Busy'} at ${format(s, 'h:mm a')}`}
                        className={cn(
                          'absolute left-1 right-1 z-10 overflow-hidden rounded-sm border px-1.5 py-0.5 text-left',
                          'border-primary/40 bg-primary/15 text-foreground',
                          'hover:bg-primary/25 hover:border-primary/60 transition-colors',
                        )}
                        style={{ top, height }}
                      >
                        <div className="truncate text-[10px] font-medium leading-tight">
                          {ev.title || 'Busy'}
                        </div>
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

      {/* Event detail side panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-left text-base">
                  {selected.title || 'Busy'}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="text-foreground">
                      {format(new Date(selected.start), 'EEEE, MMM d, yyyy')}
                    </div>
                    <div>
                      {format(new Date(selected.start), 'h:mm a')}–
                      {format(new Date(selected.end), 'h:mm a')}
                    </div>
                  </div>
                </div>
                {selected.location && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="text-foreground">{selected.location}</span>
                  </div>
                )}
                {selected.hangoutLink && (
                  <a
                    href={selected.hangoutLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Video className="h-4 w-4" /> Join video call
                  </a>
                )}
                {selected.attendees && selected.attendees.length > 0 && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <Users className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-0.5">
                      {selected.attendees.slice(0, 12).map((a, i) => (
                        <div key={i} className="text-foreground/85 text-xs">
                          {a.name || a.email}
                          {a.status && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              · {a.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.description && (
                  <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-xs text-foreground/85 whitespace-pre-wrap">
                    {selected.description}
                  </div>
                )}
                {selected.htmlLink && (
                  <a
                    href={selected.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Google Calendar
                  </a>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default InteractiveWeekCalendar;