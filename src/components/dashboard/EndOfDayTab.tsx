import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay, endOfDay, parseISO, isBefore, isAfter } from 'date-fns';
import { Mail, Users, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { Button } from '@/components/ui/button';
import { GLASS_CARD, EmptySection, Section } from './briefingPrimitives';
import { cn } from '@/lib/utils';

interface ContactInfo {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day';
  try {
    return format(parseISO(iso), 'h:mm a');
  } catch {
    return '';
  }
}

function attendeeDisplayName(a: CalendarEvent['attendees'] extends (infer U)[] | null ? U : never): string {
  return a.display_name || a.email || 'Unknown';
}

export function EndOfDayAgendaSection({ enabled }: { enabled: boolean }) {
  const { events: hookEvents, listEvents, status } = useGoogleCalendar();
  const [events, setEvents] = useState<CalendarEvent[]>(hookEvents || []);
  const [loading, setLoading] = useState(false);

  // Reuse the same calendar data already fetched by AgendaIntel via the
  // module-level cache in useGoogleCalendar. Only trigger a fetch if the
  // hook has nothing cached yet for today's window.
  useEffect(() => {
    if (!enabled || !status?.connected) return;
    if (hookEvents && hookEvents.length > 0) {
      setEvents(hookEvents);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const timeMin = startOfDay(new Date()).toISOString();
      const timeMax = endOfDay(new Date()).toISOString();
      const res = await listEvents({ timeMin, timeMax, maxResults: 100 });
      if (!cancelled) {
        setEvents(res?.events || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, status?.connected, hookEvents, listEvents]);

  // Filter to today's meetings only and sort chronologically.
  const todays = useMemo(() => {
    const dayStart = startOfDay(new Date());
    const dayEnd = endOfDay(new Date());
    return (events || [])
      .filter(ev => {
        if (!ev.start) return false;
        try {
          const s = parseISO(ev.start);
          return s >= dayStart && s <= dayEnd;
        } catch {
          return false;
        }
      })
      .slice()
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [events]);

  // Collect unique attendee emails to look up in CRM in a single batch.
  const allEmails = useMemo(() => {
    const set = new Set<string>();
    todays.forEach(ev => {
      (ev.attendees || []).forEach(a => {
        const e = (a.email || '').trim().toLowerCase();
        if (e) set.add(e);
      });
    });
    return Array.from(set);
  }, [todays]);

  const { data: contactsByEmail = {} } = useQuery({
    queryKey: ['eod-attendee-contacts', allEmails.sort().join('|')],
    enabled: enabled && allEmails.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, ContactInfo>> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('email, full_name, first_name, last_name, job_title, primary_company_id, crm_companies:crm_company_id(name)')
        .in('email', allEmails);
      if (error) {
        console.error('EOD attendee lookup failed:', error);
        return {};
      }
      const map: Record<string, ContactInfo> = {};
      (data || []).forEach((c: any) => {
        const key = (c.email || '').trim().toLowerCase();
        if (!key) return;
        map[key] = {
          fullName:
            c.full_name ||
            [c.first_name, c.last_name].filter(Boolean).join(' ') ||
            null,
          jobTitle: c.job_title || null,
          companyName: c.crm_companies?.name || null,
        };
      });
      return map;
    },
  });

  if (!status?.connected) {
    return (
      <Section title="Today's Agenda">
        <EmptySection message="Connect Google Calendar to see today's meetings here." />
      </Section>
    );
  }

  if (loading && todays.length === 0) {
    return (
      <Section title="Today's Agenda">
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading today's meetings…
        </div>
      </Section>
    );
  }

  if (todays.length === 0) {
    return (
      <Section title="Today's Agenda">
        <EmptySection message="No meetings on the calendar today." />
      </Section>
    );
  }

  const now = new Date();

  return (
    <Section title="Today's Agenda">
      <div className="space-y-3">
        {todays.map(ev => {
          let startDate: Date | null = null;
          let endDate: Date | null = null;
          try {
            startDate = ev.start ? parseISO(ev.start) : null;
            endDate = ev.end ? parseISO(ev.end) : null;
          } catch {
            /* ignore */
          }
          const isPast = !!endDate && isBefore(endDate, now);
          const isCurrent =
            !!startDate && !!endDate && !isAfter(startDate, now) && isAfter(endDate, now);
          const attendees = ev.attendees || [];

          return (
            <div
              key={ev.id}
              className={cn(
                GLASS_CARD,
                'p-4 transition-opacity',
                isPast && 'opacity-50',
                isCurrent && 'ring-1 ring-primary/40 bg-primary/[0.04]',
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      {ev.summary || '(No title)'}
                    </h4>
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium shrink-0">
                        Now
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 ml-5">
                    {ev.all_day
                      ? 'All day'
                      : `${fmtTime(ev.start, false)}${
                          ev.end ? ` – ${fmtTime(ev.end, false)}` : ''
                        }`}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1 shrink-0">
                  <Users className="h-3 w-3" />
                  {attendees.length}
                </div>
              </div>

              {attendees.length > 0 ? (
                <div className="space-y-1.5">
                  {attendees.map((a, idx) => {
                    const emailKey = (a.email || '').trim().toLowerCase();
                    const matched = contactsByEmail[emailKey];
                    const name =
                      matched?.fullName || a.display_name || a.email || 'Unknown';
                    return (
                      <div
                        key={`${ev.id}-${emailKey || idx}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-white/[0.02] glass-border-softer px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-foreground truncate">
                              {name}
                            </span>
                            {matched?.jobTitle && (
                              <span className="text-[10px] text-muted-foreground/70 truncate">
                                · {matched.jobTitle}
                              </span>
                            )}
                            {matched?.companyName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground/80 truncate">
                                {matched.companyName}
                              </span>
                            )}
                          </div>
                          {a.email && (
                            <div className="text-[10px] text-muted-foreground/60 truncate">
                              {a.email}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Email ${name}`}
                          disabled
                          title="Email (coming soon)"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground/60 italic">
                  No attendees on this event.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function EndOfDayTab({ enabled }: { enabled: boolean }) {
  return (
    <div className="space-y-4">
      <EndOfDayAgendaSection enabled={enabled} />
    </div>
  );
}