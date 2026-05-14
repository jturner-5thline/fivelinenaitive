import { useEffect, useMemo, useState, useCallback } from 'react';
import { format, startOfDay, endOfDay, parseISO, isBefore, isAfter } from 'date-fns';
import {
  Mail, Users, Calendar as CalendarIcon, Loader2, X, Send, ListPlus,
  PanelRightClose, Sparkles, StickyNote, Video, Plus, Briefcase, ExternalLink, ChevronRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { GLASS_CARD, EmptySection, Section } from './briefingPrimitives';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { QuickCreateTaskDialog } from '@/components/tasks/QuickCreateTaskDialog';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useMyTasks } from '@/hooks/useTasks';
import { useDealsContext } from '@/contexts/DealsContext';
import { PipelineTab } from './DailyBriefingModal';

interface ContactInfo {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

function firstNameOf(name: string | null | undefined, fallbackEmail?: string): string {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/)[0];
  if (fallbackEmail) return fallbackEmail.split('@')[0];
  return 'there';
}

function InlineComposer({
  to,
  defaultSubject,
  recipientLabel,
  onClose,
}: {
  to: string;
  defaultSubject: string;
  recipientLabel: string;
  onClose: () => void;
}) {
  const [toField, setToField] = useState(to);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!toField.trim() || !subject.trim()) {
      toast.error('To and subject are required');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: [toField.trim()],
          subject: subject.trim(),
          body: body.replace(/\n/g, '<br/>'),
        },
      });
      if (error) throw error;
      toast.success(`Email sent to ${recipientLabel}`);
      onClose();
    } catch (err: any) {
      console.error('EOD inline send failed:', err);
      toast.error(err?.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-background/80 backdrop-blur-md p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Quick Reply
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          aria-label="Close composer"
          disabled={sending}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground w-12 shrink-0">To</span>
        <Input
          value={toField}
          onChange={(e) => setToField(e.target.value)}
          className="h-7 text-xs"
          disabled={sending}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground w-12 shrink-0">Subject</span>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-7 text-xs"
          disabled={sending}
        />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your message…"
        className="min-h-[120px] text-xs resize-y"
        disabled={sending}
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={sending}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSend}
          disabled={sending}
          className="h-7 text-xs gap-1.5"
        >
          {sending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Send
        </Button>
      </div>
    </div>
  );
}

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return 'All day';
  try {
    return format(parseISO(iso), 'h:mm a');
  } catch {
    return '';
  }
}

export function EndOfDayAgendaSection({
  enabled,
  onCreateFollowUp,
  selectedEventId,
  onSelectEvent,
}: {
  enabled: boolean;
  onCreateFollowUp?: (ev: CalendarEvent, attendeeEmails: string[]) => void;
  selectedEventId?: string | null;
  onSelectEvent?: (ev: CalendarEvent | null) => void;
}) {
  const { events: hookEvents, listEvents, status } = useGoogleCalendar();
  const [events, setEvents] = useState<CalendarEvent[]>(hookEvents || []);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  // composerKey = `${eventId}::${attendeeEmail}` so only one composer is open at a time
  const [composerKey, setComposerKey] = useState<string | null>(null);

  const userFirstName = useMemo(() => {
    const meta: any = user?.user_metadata || {};
    return firstNameOf(meta.full_name || meta.name, user?.email || undefined);
  }, [user]);

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
            <ContextMenu key={ev.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    GLASS_CARD,
                    'p-4 transition-opacity',
                    isPast && 'opacity-50',
                    isCurrent && 'ring-1 ring-primary/40 bg-primary/[0.04]',
                    selectedEventId === ev.id && 'ring-2 ring-primary/60 bg-primary/[0.06]',
                  )}
                >
              <div className="flex items-start justify-between gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => onSelectEvent?.(selectedEventId === ev.id ? null : ev)}
                  className="min-w-0 flex-1 text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-white/[0.03] transition-colors"
                  title="Open meeting insights"
                >
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
                    <ChevronRight className={cn(
                      'h-3 w-3 text-muted-foreground/40 shrink-0 transition-transform',
                      selectedEventId === ev.id && 'rotate-90 text-primary',
                    )} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 ml-5">
                    {ev.all_day
                      ? 'All day'
                      : `${fmtTime(ev.start, false)}${
                          ev.end ? ` – ${fmtTime(ev.end, false)}` : ''
                        }`}
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateFollowUp?.(
                        ev,
                        attendees.map(a => (a.email || '').trim().toLowerCase()).filter(Boolean),
                      );
                    }}
                    title="Create a follow-up task for this meeting"
                  >
                    <ListPlus className="h-3.5 w-3.5" />
                    Create Follow Up
                  </Button>
                  <div className="text-[11px] text-muted-foreground/70 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {attendees.length}
                  </div>
                </div>
              </div>

              {attendees.length > 0 ? (
                <div className="space-y-1.5">
                  {attendees.map((a, idx) => {
                    const emailKey = (a.email || '').trim().toLowerCase();
                    const matched = contactsByEmail[emailKey];
                    const name =
                      matched?.fullName || a.display_name || a.email || 'Unknown';
                    const rowKey = `${ev.id}::${emailKey || idx}`;
                    const isComposing = composerKey === rowKey;
                    const attendeeFirst = firstNameOf(name, a.email || undefined);
                    const defaultSubject = `${attendeeFirst} & ${userFirstName} Follow Up`;
                    return (
                      <div key={rowKey}>
                        <div className="flex items-center justify-between gap-2 rounded-md bg-white/[0.02] glass-border-softer px-2.5 py-1.5">
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
                          className={cn(
                            'h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground',
                            isComposing && 'text-primary',
                          )}
                          aria-label={`Email ${name}`}
                          disabled={!a.email}
                          title={a.email ? `Email ${name}` : 'No email available'}
                          onClick={() =>
                            setComposerKey(isComposing ? null : rowKey)
                          }
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                        </div>
                        {isComposing && a.email && (
                          <InlineComposer
                            to={a.email}
                            defaultSubject={defaultSubject}
                            recipientLabel={name}
                            onClose={() => setComposerKey(null)}
                          />
                        )}
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
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onSelect={() =>
                    onCreateFollowUp?.(
                      ev,
                      attendees.map(a => (a.email || '').trim().toLowerCase()).filter(Boolean),
                    )
                  }
                >
                  <ListPlus className="h-3.5 w-3.5 mr-2" />
                  Create Follow Up
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </Section>
  );
}

export function EndOfDayTab({
  enabled,
  onNavigate,
  targetAssigneeName,
  targetUserId,
  briefingType,
}: {
  enabled: boolean;
  onNavigate?: (path: string) => void;
  targetAssigneeName?: string;
  targetUserId?: string;
  briefingType?: string;
}) {
  const { user } = useAuth();
  const teamMembers = useTeamMembers();
  const { createTask } = useMyTasks();
  const { deals } = useDealsContext();

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState('');
  const [prefillDealId, setPrefillDealId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [notesByEvent, setNotesByEvent] = useState<Record<string, string>>({});

  const handleCreateFollowUp = useCallback(
    (ev: CalendarEvent, attendeeEmails: string[]) => {
      // Best-effort deal match: match attendee email domains to a deal's
      // company URL host. Common email providers (gmail, etc.) are skipped.
      const COMMON = new Set([
        'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
        'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
      ]);
      let matchedId: string | null = null;
      for (const email of attendeeEmails) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain || COMMON.has(domain)) continue;
        const found = (deals || []).find(d => {
          try {
            const url = (d as any).companyUrl as string | undefined;
            if (!url) return false;
            const host = new URL(url.startsWith('http') ? url : `https://${url}`)
              .hostname.toLowerCase().replace(/^www\./, '');
            return host === domain || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
          } catch {
            return false;
          }
        });
        if (found) {
          matchedId = found.id;
          break;
        }
      }
      setPrefillTitle(`Follow Up: ${ev.summary || '(No title)'}`);
      setPrefillDealId(matchedId);
      setFollowUpOpen(true);
    },
    [deals],
  );

  return (
    <div className="flex gap-3 min-h-0">
      <div
        className={cn(
          'space-y-4 transition-all duration-300 ease-out min-w-0',
          selectedEvent ? 'flex-1 lg:max-w-[58%]' : 'flex-1',
        )}
      >
        <EndOfDayAgendaSection
          enabled={enabled}
          onCreateFollowUp={handleCreateFollowUp}
          selectedEventId={selectedEvent?.id || null}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
        />

        <div className="pt-2 border-t border-white/10">
          <PipelineTab
            enabled={enabled}
            onNavigate={onNavigate || (() => {})}
            targetDealOwnerName={targetAssigneeName}
            targetUserId={targetUserId}
            briefingType={briefingType}
          />
        </div>
      </div>

      {selectedEvent && (
        <EodContextSidebar
          event={selectedEvent}
          note={notesByEvent[selectedEvent.id] || ''}
          onNoteChange={(v) =>
            setNotesByEvent((prev) => ({ ...prev, [selectedEvent.id]: v }))
          }
          onClose={() => setSelectedEvent(null)}
          onCreateFollowUp={() =>
            handleCreateFollowUp(
              selectedEvent,
              (selectedEvent.attendees || [])
                .map((a) => (a.email || '').trim().toLowerCase())
                .filter(Boolean),
            )
          }
          onCreateDeal={() => onNavigate?.('/deals?new=1')}
        />
      )}

      <QuickCreateTaskDialog
        open={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
        teamMembers={teamMembers}
        currentUserId={user?.id || ''}
        initialTitle={prefillTitle}
        initialDealId={prefillDealId}
        initialDueDate={new Date()}
        onCreate={async (input) => {
          await createTask.mutateAsync({
            title: input.title,
            priority: input.priority,
            due_date: input.due_date || undefined,
            status: input.status,
            assigned_to: input.assigned_to,
            recurrence_rule: input.recurrence_rule,
            recurrence_end_date: input.recurrence_end_date,
            deal_id: input.deal_id || undefined,
          });
          toast.success(`Task created: "${input.title}"`);
          setFollowUpOpen(false);
        }}
      />
    </div>
  );
}