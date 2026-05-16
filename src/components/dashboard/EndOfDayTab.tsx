import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  format, startOfDay, endOfDay, parseISO, isBefore, isAfter,
  subDays, differenceInCalendarDays,
} from 'date-fns';
import {
  Mail, Users, Calendar as CalendarIcon, Loader2, ListPlus,
  PanelRightClose, Sparkles, StickyNote, Video, Plus, Briefcase, ExternalLink, ChevronRight,
  Check,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { Button } from '@/components/ui/button';
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
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from '@/components/deal/email/EmailComposerCard';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';
import { MeetingClaapLinker, type AffiliatedDeal, type ManualClaapLink } from './MeetingClaapLinker';
import { usePersistentClears } from '@/hooks/usePersistentClears';

const EOD_LOOKBACK_DAYS = 90;

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
  const signature = useUserEmailSignature();
  const { sendEmail } = useGmail();
  const [recipients, setRecipients] = useState<ComposerRecipients>({
    to: [to],
    cc: [],
    bcc: [],
  });
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const handleSend = useCallback(
    async (_opts: ComposerSendOptions) => {
      if (recipients.to.length === 0) {
        toast.error('Add at least one recipient');
        return;
      }
      if (!subject.trim()) {
        toast.error('Subject is required');
        return;
      }
      try {
        const result = await sendEmail({
          to: recipients.to,
          cc: recipients.cc,
          bcc: recipients.bcc,
          subject: subject.trim(),
          bodyHtml: body,
          body: body.replace(/<[^>]+>/g, ''),
          attachments: files.length > 0 ? files : undefined,
        });
        if (!result) throw new Error('Send failed');
        toast.success(`Email sent to ${recipientLabel}`);
        onClose();
      } catch (err: any) {
        console.error('EOD compose send failed:', err);
        toast.error(err?.message || 'Failed to send email');
      }
    },
    [recipients, subject, body, files, sendEmail, onClose, recipientLabel],
  );

  const handleDiscard = useCallback(() => {
    onClose();
    toast.info('Draft discarded');
  }, [onClose]);

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-background/80 backdrop-blur-md overflow-hidden">
      <EmailComposerCard
        replyToName={recipientLabel}
        hideReplyAnchor
        recipients={recipients}
        onRecipientsChange={setRecipients}
        subject={subject}
        onSubjectChange={setSubject}
        body={body}
        onBodyChange={setBody}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onFilesChange={setFiles}
        onSend={handleSend}
        onDiscard={handleDiscard}
        signature={signature}
        variant="inline"
        showSubject
        className="rounded-none border-0 shadow-none mx-0 my-0"
      />
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
  const { clear: clearItem, isCleared } = usePersistentClears('eod-agenda');

  const userFirstName = useMemo(() => {
    const meta: any = user?.user_metadata || {};
    return firstNameOf(meta.full_name || meta.name, user?.email || undefined);
  }, [user]);

  // Fetch the full End of Day backlog window: meetings from up to 90 days
  // ago through end of today. Today's same-day cache from useGoogleCalendar
  // is insufficient — we always need the wider window here.
  useEffect(() => {
    if (!enabled || !status?.connected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const timeMin = startOfDay(subDays(new Date(), EOD_LOOKBACK_DAYS)).toISOString();
      const timeMax = endOfDay(new Date()).toISOString();
      const res = await listEvents({ timeMin, timeMax, maxResults: 500 });
      if (!cancelled) {
        setEvents(res?.events || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, status?.connected, listEvents]);

  // Build the outstanding-meeting backlog for the last 90 days, excluding
  // anything the user has explicitly cleared. Sorted oldest first so the
  // most overdue follow-ups surface at the top of their group.
  const outstanding = useMemo(() => {
    const windowStart = startOfDay(subDays(new Date(), EOD_LOOKBACK_DAYS));
    const windowEnd = endOfDay(new Date());
    return (events || [])
      .filter(ev => {
        if (!ev.start) return false;
        try {
          const s = parseISO(ev.start);
          return s >= windowStart && s <= windowEnd;
        } catch {
          return false;
        }
      })
      .filter(ev => {
        const atts = ev.attendees || [];
        return atts.some(a => !a.self);
      })
      .filter(ev => !isCleared(ev.id))
      .slice()
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }, [events, isCleared]);

  // Group by outstanding-age buckets.
  type Bucket = { key: string; label: string; items: CalendarEvent[] };
  const buckets: Bucket[] = useMemo(() => {
    const today: CalendarEvent[] = [];
    const week: CalendarEvent[] = [];
    const month: CalendarEvent[] = [];
    const quarter: CalendarEvent[] = [];
    const ref = startOfDay(new Date());
    for (const ev of outstanding) {
      try {
        const s = parseISO(ev.start);
        const days = differenceInCalendarDays(ref, startOfDay(s));
        if (days <= 0) today.push(ev);
        else if (days <= 7) week.push(ev);
        else if (days <= 30) month.push(ev);
        else quarter.push(ev);
      } catch {
        today.push(ev);
      }
    }
    return [
      { key: 'today', label: 'Today', items: today },
      { key: 'week', label: 'Last 7 days', items: week },
      { key: 'month', label: '8–30 days', items: month },
      { key: 'quarter', label: '31–90 days', items: quarter },
    ].filter(b => b.items.length > 0);
  }, [outstanding]);

  // Collect unique attendee emails to look up in CRM in a single batch.
  const allEmails = useMemo(() => {
    const set = new Set<string>();
    outstanding.forEach(ev => {
      (ev.attendees || []).forEach(a => {
        const e = (a.email || '').trim().toLowerCase();
        if (e) set.add(e);
      });
    });
    return Array.from(set);
  }, [outstanding]);

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
      <Section title="End of Day · Outstanding">
        <EmptySection message="Connect Google Calendar to see outstanding meeting follow-ups here." />
      </Section>
    );
  }

  if (loading && outstanding.length === 0) {
    return (
      <Section title="End of Day · Outstanding">
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading outstanding meetings…
        </div>
      </Section>
    );
  }

  if (outstanding.length === 0) {
    return (
      <Section title="End of Day · Outstanding">
        <EmptySection message="No outstanding meeting follow-ups in the last 90 days." />
      </Section>
    );
  }

  const now = new Date();
  const refDay = startOfDay(now);

  return (
    <Section title="End of Day · Outstanding">
      <p className="text-[11px] text-muted-foreground/80 -mt-1 mb-2">
        Showing all unresolved End of Day items from the last 90 days. Clear an item to remove it from the backlog.
      </p>
      <div className="space-y-5">
        {buckets.map(bucket => (
          <div key={bucket.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/80">
                {bucket.label}
              </span>
              <span className="text-[10px] text-muted-foreground/60">· {bucket.items.length}</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="space-y-3">
        {bucket.items.map(ev => {
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
          const ageDays = startDate ? differenceInCalendarDays(refDay, startOfDay(startDate)) : 0;
          const isCarryForward = ageDays > 0;
          const outstandingSince = startDate ? format(startDate, 'MMM d') : '';

          return (
            <ContextMenu key={ev.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    GLASS_CARD,
                    'p-4 transition-opacity',
                    isPast && !isCarryForward && 'opacity-50',
                    isCurrent && 'ring-1 ring-primary/40 bg-primary/[0.04]',
                    isCarryForward && 'border-l-2 border-amber-500/40',
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
                    <CalendarIcon className="h-3.5 w-3.5 text-white shrink-0" />
                    <h4 className="text-sm font-semibold text-white truncate">
                      {ev.summary || '(No title)'}
                    </h4>
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium shrink-0">
                        Now
                      </span>
                    )}
                    {isCarryForward && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium shrink-0">
                        Carry-forward · {ageDays}d
                      </span>
                    )}
                    <ChevronRight className={cn(
                      'h-3 w-3 text-white/60 shrink-0 transition-transform',
                      selectedEventId === ev.id && 'rotate-90 text-primary',
                    )} />
                  </div>
                  <div className="text-[11px] text-white/80 mt-0.5 ml-5">
                    {outstandingSince && (
                      <span className="text-white/70">Outstanding since {outstandingSince} · </span>
                    )}
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
                    className="h-7 px-2 text-[11px] gap-1 text-white hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateFollowUp?.(
                        ev,
                        attendees.map(a => (a.email || '').trim().toLowerCase()).filter(Boolean),
                      );
                    }}
                    title="Create a follow-up task for this meeting"
                  >
                    <ListPlus className="h-3.5 w-3.5 text-white" />
                    Create Follow Up
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/80 hover:text-emerald-300 hover:bg-emerald-500/15"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearItem(ev.id);
                      toast.success('Cleared from End of Day backlog');
                    }}
                    title="Clear from End of Day (resolved)"
                    aria-label="Clear from End of Day backlog"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </Button>
                  <div className="text-[11px] text-white/85 flex items-center gap-1">
                    <Users className="h-3 w-3 text-white" />
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
                    const eventTitle = (ev.summary || '').trim();
                    const defaultSubject = eventTitle
                      ? `${eventTitle} Follow Up`
                      : `${attendeeFirst} & ${userFirstName} Follow Up`;
                    return (
                      <div key={rowKey}>
                        <div className="flex items-center justify-between gap-2 rounded-md bg-white/[0.02] glass-border-softer px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-white truncate">
                              {name}
                            </span>
                            {matched?.jobTitle && (
                              <span className="text-[10px] text-white/75 truncate">
                                · {matched.jobTitle}
                              </span>
                            )}
                            {matched?.companyName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.08] text-white truncate">
                                {matched.companyName}
                              </span>
                            )}
                          </div>
                          {a.email && (
                            <div className="text-[10px] text-white/70 truncate">
                              {a.email}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-7 w-7 shrink-0 text-white hover:text-white',
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
                <div className="text-[11px] text-white/70 italic">
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
          </div>
        ))}
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
  const [claapLinksByEvent, setClaapLinksByEvent] = useState<Record<string, ManualClaapLink[]>>({});

  const matchAffiliatedDeals = useCallback(
    (ev: CalendarEvent): AffiliatedDeal[] => {
      const COMMON = new Set([
        'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
        'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
      ]);
      const emails = (ev.attendees || [])
        .map((a) => (a.email || '').trim().toLowerCase())
        .filter(Boolean);
      const matched = new Map<string, AffiliatedDeal>();
      for (const email of emails) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain || COMMON.has(domain)) continue;
        for (const d of deals || []) {
          try {
            const url = (d as any).companyUrl as string | undefined;
            if (!url) continue;
            const host = new URL(url.startsWith('http') ? url : `https://${url}`)
              .hostname.toLowerCase().replace(/^www\./, '');
            if (host === domain || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`)) {
              matched.set(d.id, { id: d.id, name: d.name || (d as any).company || 'Untitled deal' });
            }
          } catch {
            /* ignore */
          }
        }
      }
      return Array.from(matched.values());
    },
    [deals],
  );

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
          affiliatedDeals={matchAffiliatedDeals(selectedEvent)}
          manualClaapLinks={claapLinksByEvent[selectedEvent.id] || []}
          onAddManualClaapLink={(link) =>
            setClaapLinksByEvent((prev) => ({
              ...prev,
              [selectedEvent.id]: [
                ...(prev[selectedEvent.id] || []).filter((l) => l.id !== link.id),
                link,
              ],
            }))
          }
          onRemoveManualClaapLink={(recordingId) =>
            setClaapLinksByEvent((prev) => ({
              ...prev,
              [selectedEvent.id]: (prev[selectedEvent.id] || []).filter((l) => l.id !== recordingId),
            }))
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

// ─────────────────────────────────────────────────────────────
// Contextual right sidebar shown inside the End of Day tab
// when an item is selected. Lives inside the popup shell — not
// a top-level modal — and uses the same Liquid Glass surface.
// ─────────────────────────────────────────────────────────────
function EodContextSidebar({
  event,
  note,
  onNoteChange,
  onClose,
  onCreateFollowUp,
  onCreateDeal,
  affiliatedDeals,
  manualClaapLinks,
  onAddManualClaapLink,
  onRemoveManualClaapLink,
}: {
  event: CalendarEvent;
  note: string;
  onNoteChange: (v: string) => void;
  onClose: () => void;
  onCreateFollowUp: () => void;
  onCreateDeal: () => void;
  affiliatedDeals: AffiliatedDeal[];
  manualClaapLinks: ManualClaapLink[];
  onAddManualClaapLink: (link: ManualClaapLink) => void;
  onRemoveManualClaapLink: (recordingId: string) => void;
}) {
  const attendees = event.attendees || [];
  const externals = attendees.filter((a) => !a.self);
  const claapLinks = useMemo(() => {
    const text = `${event.description || ''} ${event.location || ''}`;
    const re = /https?:\/\/(?:www\.)?claap\.io\/[^\s)]+/gi;
    return Array.from(new Set((text.match(re) || []).map((s) => s.trim())));
  }, [event.description, event.location]);

  const insightLines = useMemo(() => {
    const lines: string[] = [];
    if (externals.length > 0) {
      lines.push(
        `${externals.length} external attendee${externals.length === 1 ? '' : 's'} expected.`,
      );
    } else if (attendees.length > 0) {
      lines.push('Internal-only meeting.');
    }
    if (event.hangout_link) lines.push('Video call link is attached.');
    if (claapLinks.length > 0) lines.push('Linked Claap recording available.');
    if (lines.length === 0) lines.push('No additional context available yet.');
    return lines;
  }, [externals.length, attendees.length, event.hangout_link, claapLinks.length]);

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 w-[380px] xl:w-[420px] max-h-full',
        'rounded-xl border border-white/10 bg-background/60 backdrop-blur-xl',
        'animate-in slide-in-from-right-4 fade-in duration-200',
      )}
      style={{ boxShadow: '0 24px 48px -24px hsl(var(--background) / 0.6)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-white/10">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
            Meeting context
          </p>
          <h3 className="text-sm font-semibold text-foreground truncate mt-0.5">
            {event.summary || '(No title)'}
          </h3>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {event.all_day
              ? 'All day'
              : `${fmtTime(event.start, false)}${event.end ? ` – ${fmtTime(event.end, false)}` : ''}`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close context panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Insights */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
              Insights
            </span>
          </div>
          <ul className="space-y-1">
            {insightLines.map((l, i) => (
              <li key={i} className="text-xs text-foreground/85 leading-snug flex gap-1.5">
                <span className="text-primary/60 mt-1.5 h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Notes */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
              Notes
            </span>
          </div>
          <Textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Jot a quick takeaway from this meeting…"
            className="min-h-[110px] text-xs resize-y bg-white/[0.02]"
          />
          <p className="text-[10px] text-muted-foreground/50 mt-1">
            Notes stay with you for this session.
          </p>
        </section>

        {/* Linked Claap */}
        <MeetingClaapLinker
          affiliatedDeals={affiliatedDeals}
          inlineExistingUrls={claapLinks}
          manualLinks={manualClaapLinks}
          onAddManualLink={onAddManualClaapLink}
          onRemoveManualLink={onRemoveManualClaapLink}
        />

        {/* Attendees quick view */}
        {attendees.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
                Attendees ({attendees.length})
              </span>
            </div>
            <ul className="space-y-1">
              {attendees.slice(0, 6).map((a, i) => (
                <li key={i} className="text-[11px] text-foreground/80 truncate">
                  {a.display_name || a.email}
                </li>
              ))}
              {attendees.length > 6 && (
                <li className="text-[10px] text-muted-foreground/60">
                  +{attendees.length - 6} more
                </li>
              )}
            </ul>
          </section>
        )}
      </div>

      {/* Quick actions */}
      <div className="border-t border-white/10 px-3 py-2.5 space-y-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full justify-start h-8 text-xs gap-2"
          onClick={onCreateFollowUp}
        >
          <Plus className="h-3.5 w-3.5" />
          Create task
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full justify-start h-8 text-xs gap-2"
          onClick={onCreateDeal}
        >
          <Briefcase className="h-3.5 w-3.5" />
          Create deal
        </Button>
      </div>
    </aside>
  );
}