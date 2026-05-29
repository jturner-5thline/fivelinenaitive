import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  format, startOfDay, endOfDay, parseISO, subDays,
  differenceInCalendarDays, addDays, addHours, addWeeks,
  formatDistanceToNow,
} from 'date-fns';
import {
  Calendar as CalendarIcon, CheckCircle2, X, Clock, Users, Mail,
  Search, ChevronDown, ChevronRight, Loader2, ListPlus, Link2,
  ExternalLink, Sparkles, StickyNote, Inbox,
  PartyPopper, GripVertical, ArrowLeft, Copy as CopyIcon,
  Briefcase, Video,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useMyTasks } from '@/hooks/useTasks';
import { QuickCreateTaskDialog } from '@/components/tasks/QuickCreateTaskDialog';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from '@/components/deal/email/EmailComposerCard';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';
import { usePersistentClears } from '@/hooks/usePersistentClears';
import { useDbPersistentClears } from '@/hooks/useDbPersistentClears';
import { EventClaapLinker } from '@/components/dashboard/EventClaapLinker';
import { MeetingClaapInlineAction } from '@/components/dashboard/MeetingClaapInlineAction';
import { MeetingDealInlineAction } from '@/components/dashboard/MeetingDealInlineAction';
import { MeetingFollowupInlineAction } from '@/components/dashboard/MeetingFollowupInlineAction';
import { MeetingTasksInlineAction } from '@/components/dashboard/MeetingTasksInlineAction';
import { MeetingScheduleInlineAction } from '@/components/dashboard/MeetingScheduleInlineAction';
import { FindATimeDialog } from '@/components/scheduling/FindATimeDialog';

// ─────────────────────────────────────────────────────────────
// End of Day · Two-pane master/detail layout
//
// The left pane is a compact, searchable, group-collapsible tile
// list of outstanding meeting follow-ups over the last 90 days.
// The right pane renders rich detail for the selected event —
// agenda, attendees, action items (email / task / link / note /
// schedule next), and a local activity history.
//
// Persistence:
//   - dismissed / resolved use usePersistentClears (per-user LS)
//   - snooze (per-event until-timestamp) is stored in LS
//   - per-event activity log is stored in LS
//   - left-pane width and collapsed groups are stored in LS
// ─────────────────────────────────────────────────────────────

const EOD_LOOKBACK_DAYS = 90;
const EOD_FETCH_MAX_RESULTS = 2000;
const PANE_WIDTH_KEY = 'eod:left-pane-width';
const SNOOZE_KEY_PREFIX = 'eod:snoozed';
const ACTIVITY_KEY_PREFIX = 'eod:activity';
const COLLAPSED_GROUPS_KEY = 'eod:collapsed-groups';
const UNDO_WINDOW_MS = 5000;

type FilterChip = 'has_deal' | 'no_follow_up' | 'carry_14d';

interface ContactInfo {
  fullName: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

interface ActivityEntry {
  id: string;
  at: string;
  by: string | null;
  kind: 'resolved' | 'dismissed' | 'snoozed' | 'restored' | 'task_created' | 'email_sent' | 'note_added' | 'linked_deal';
  detail?: string;
}

// ─── helpers ─────────────────────────────────────────────────
function firstNameOf(name: string | null | undefined, fallbackEmail?: string) {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/)[0];
  if (fallbackEmail) return fallbackEmail.split('@')[0];
  return 'there';
}
function fmtTime(iso: string | undefined, allDay?: boolean) {
  if (!iso) return '';
  if (allDay) return 'All day';
  try { return format(parseISO(iso), 'h:mm a'); } catch { return ''; }
}
function safeParse(iso?: string): Date | null {
  if (!iso) return null;
  try {
    const parsed = parseISO(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}
function emailDomain(email: string | null | undefined): string {
  if (!email) return '';
  const idx = email.lastIndexOf('@');
  return idx >= 0 ? email.slice(idx + 1).toLowerCase() : '';
}
function isInternalAttendee(email: string | null | undefined): boolean {
  return emailDomain(email) === '5thline.co';
}
function readLS<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ─── snooze hook ─────────────────────────────────────────────
function useSnooze(userId: string) {
  const storageKey = `${SNOOZE_KEY_PREFIX}:${userId}`;
  const [map, setMap] = useState<Record<string, string>>(() => readLS(storageKey, {}));
  const persist = useCallback((next: Record<string, string>) => {
    setMap(next);
    writeLS(storageKey, next);
  }, [storageKey]);
  const snooze = useCallback((id: string, until: Date) => {
    persist({ ...readLS(storageKey, {}), [id]: until.toISOString() });
  }, [storageKey, persist]);
  const unsnooze = useCallback((id: string) => {
    const next = { ...readLS<Record<string, string>>(storageKey, {}) };
    delete next[id];
    persist(next);
  }, [storageKey, persist]);
  const isSnoozed = useCallback((id: string) => {
    const until = map[id];
    if (!until) return false;
    try { return parseISO(until) > new Date(); } catch { return false; }
  }, [map]);
  const snoozedUntil = useCallback((id: string) => map[id] ? safeParse(map[id]) : null, [map]);
  return { snooze, unsnooze, isSnoozed, snoozedUntil };
}

// ─── activity log hook ───────────────────────────────────────
function useActivityLog(userId: string) {
  const storageKey = `${ACTIVITY_KEY_PREFIX}:${userId}`;
  const [log, setLog] = useState<Record<string, ActivityEntry[]>>(() => readLS(storageKey, {}));
  const append = useCallback((eventId: string, entry: Omit<ActivityEntry, 'id' | 'at'> & { at?: string }) => {
    setLog(prev => {
      const next = { ...prev };
      const list = next[eventId] || [];
      const full: ActivityEntry = {
        id: crypto.randomUUID(),
        at: entry.at || new Date().toISOString(),
        by: entry.by ?? null,
        kind: entry.kind,
        detail: entry.detail,
      };
      next[eventId] = [full, ...list].slice(0, 50);
      writeLS(storageKey, next);
      return next;
    });
  }, [storageKey]);
  const get = useCallback((eventId: string) => log[eventId] || [], [log]);
  return { append, get };
}

// ─── inline composer ─────────────────────────────────────────
function InlineComposer({
  to, defaultSubject, defaultBody, recipientLabel, onClose, onSent,
}: {
  to: string[];
  defaultSubject: string;
  defaultBody?: string;
  recipientLabel: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const signature = useUserEmailSignature();
  const { sendEmail } = useGmail();
  const [recipients, setRecipients] = useState<ComposerRecipients>({ to, cc: [], bcc: [] });
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody || '');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const handleSend = useCallback(async (_o: ComposerSendOptions) => {
    if (recipients.to.length === 0) { toast.error('Add at least one recipient'); return; }
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    try {
      const result = await sendEmail({
        to: recipients.to, cc: recipients.cc, bcc: recipients.bcc,
        subject: subject.trim(), bodyHtml: body, body: body.replace(/<[^>]+>/g, ''),
        attachments: files.length > 0 ? files : undefined,
      });
      if (!result) throw new Error('Send failed');
      toast.success(`Email sent to ${recipientLabel}`);
      onSent?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send email';
      toast.error(msg);
    }
  }, [recipients, subject, body, files, sendEmail, onSent, onClose, recipientLabel]);

  return (
    <div className="rounded-lg border border-primary/30 bg-background/80 backdrop-blur-md overflow-hidden">
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
        onDiscard={() => { onClose(); toast.info('Draft discarded'); }}
        signature={signature}
        variant="inline"
        showSubject
        className="rounded-none border-0 shadow-none mx-0 my-0"
      />
    </div>
  );
}

// ─── compact left-pane tile ─────────────────────────────────
interface TileEvent extends CalendarEvent {
  _ageDays: number;
  _isCarry: boolean;
}

function EventTile({
  ev, active, selected, onClick, onToggleSelect, onResolve, onDismiss,
  isUnread,
}: {
  ev: TileEvent;
  active: boolean;
  selected: boolean;
  onClick: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onResolve: () => void;
  onDismiss: () => void;
  isUnread: boolean;
}) {
  const startStr = ev.start ? format(parseISO(ev.start), 'MMM d') : '';
  const attendeeCount = (ev.attendees || []).filter(a => !a.self).length;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg pl-3 pr-2 py-2 min-h-[64px] cursor-pointer transition-all',
        'border border-transparent',
        active
          ? 'bg-primary/[0.10] border-primary/30 shadow-[inset_3px_0_0_0_hsl(var(--primary))]'
          : 'hover:bg-white/[0.04]',
      )}
    >
      {/* multi-select checkbox (visible on hover or when any selected) */}
      <div
        className={cn('shrink-0', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity')}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
      >
        <Checkbox checked={selected} onCheckedChange={() => { /* handled by wrapper */ }} />
      </div>

      {/* unread dot */}
      {isUnread && !selected && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarIcon className="h-3.5 w-3.5 text-white/80 shrink-0" />
          <span className="text-sm font-medium text-white truncate">
            {ev.summary || '(No title)'}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-white/65 truncate">
          <span className="truncate">
            {ev._isCarry
              ? `Outstanding since ${startStr}`
              : startStr}
          </span>
          <span className="text-white/40">·</span>
          <span className="truncate">{fmtTime(ev.start, ev.all_day)}</span>
          {ev._isCarry && (
            <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[9px] border-amber-500/40 text-amber-300 bg-amber-500/10">
              Carry-forward · {ev._ageDays}d
            </Badge>
          )}
          <span className="ml-auto flex items-center gap-0.5 text-white/70">
            <Users className="h-2.5 w-2.5" />{attendeeCount}
          </span>
        </div>
      </div>

      {/* hover actions */}
      <div
        className={cn(
          'flex items-center gap-0.5 shrink-0',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 transition-opacity',
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-white/70 hover:text-emerald-300 hover:bg-emerald-500/15"
              onClick={(e) => { e.stopPropagation(); onResolve(); }}
              aria-label="Mark resolved"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Mark resolved (E)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-white/70 hover:text-rose-300 hover:bg-rose-500/15"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Dismiss (D)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────
export function EndOfDayTab({
  enabled,
}: {
  enabled: boolean;
  onNavigate?: (path: string) => void;
  targetAssigneeName?: string;
  targetUserId?: string;
  briefingType?: string;
}) {
  const { user } = useAuth();
  const userId = user?.id || 'anon';
  const userFirstName = useMemo(() => {
    const meta = (user?.user_metadata || {}) as { full_name?: string; name?: string };
    return firstNameOf(meta.full_name || meta.name, user?.email || undefined);
  }, [user]);

  const { events: hookEvents, listEvents, status } = useGoogleCalendar();
  const [events, setEvents] = useState<CalendarEvent[]>(hookEvents || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEvents(hookEvents || []);
  }, [hookEvents]);

  const { deals } = useDealsContext();
  const teamMembers = useTeamMembers();
  const { createTask } = useMyTasks();

  const { clear: clearResolved, restore: restoreResolved, isCleared: isResolvedRaw } = useDbPersistentClears('eod-agenda');
  const { clear: clearDismissed, restore: restoreDismissed, isCleared: isDismissedRaw } = useDbPersistentClears('eod-dismissed');
  const isResolved = useCallback((id: string) => isResolvedRaw(id), [isResolvedRaw]);
  // For dismissals, also honor a per-user cutoff date so historical backfills
  // don't require enumerating every event id.
  const isDismissed = useCallback(
    (id: string, itemDate?: Date | string | null) => isDismissedRaw(id, itemDate),
    [isDismissedRaw],
  );
  const { snooze, unsnooze, isSnoozed, snoozedUntil } = useSnooze(userId);
  const activity = useActivityLog(userId);

  // Read state
  const [readSet, setReadSet] = useState<Set<string>>(() => new Set(readLS<string[]>(`eod:read:${userId}`, [])));
  const markRead = useCallback((id: string) => {
    setReadSet(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      writeLS(`eod:read:${userId}`, Array.from(next));
      return next;
    });
  }, [userId]);

  // Selection (single) + bulk
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // Search + filters
  const [search, setSearch] = useState('');
  const [filterChips, setFilterChips] = useState<Set<FilterChip>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tracks items the user resolved/dismissed/snoozed during this session.
  // Used to decide whether the empty state is a celebratory "you cleared
  // everything" vs. a neutral "nothing here today" vs. a filter-zero state.
  const [clearedCount, setClearedCount] = useState(0);
  const bumpCleared = useCallback((n = 1) => setClearedCount(c => c + n), []);

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(readLS<string[]>(COLLAPSED_GROUPS_KEY, [])),
  );
  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeLS(COLLAPSED_GROUPS_KEY, Array.from(next));
      return next;
    });
  };

  // Left pane width (resizable)
  const [paneWidth, setPaneWidth] = useState<number>(() => readLS<number>(PANE_WIDTH_KEY, 380));
  const draggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onDragStart = () => { draggingRef.current = true; document.body.style.cursor = 'col-resize'; };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const w = Math.min(Math.max(e.clientX - rect.left, 260), Math.min(600, rect.width * 0.6));
      setPaneWidth(w);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      writeLS(PANE_WIDTH_KEY, paneWidth);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [paneWidth]);

  // Responsive: <1100px collapses to single column
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Fetch
  useEffect(() => {
    if (!enabled || !status?.connected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const timeMin = startOfDay(subDays(new Date(), EOD_LOOKBACK_DAYS)).toISOString();
      const timeMax = endOfDay(new Date()).toISOString();
      const res = await listEvents({ timeMin, timeMax, maxResults: EOD_FETCH_MAX_RESULTS });
      if (!cancelled) {
        setEvents(res?.events || hookEvents || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, status?.connected, listEvents, hookEvents]);

  // Build outstanding (filter resolved + dismissed + snoozed)
  const outstanding = useMemo<TileEvent[]>(() => {
    const now = new Date();
    const ws = startOfDay(subDays(now, EOD_LOOKBACK_DAYS));
    const we = endOfDay(now);
    const ref = startOfDay(now);
    const normalizedEvents = (events || []).map(ev => {
      const start = safeParse(ev.start);
      const attendeeCount = (ev.attendees || []).length;
      const externalCount = (ev.attendees || []).filter(a => !a.self && !isInternalAttendee(a.email)).length;
      return { ev, start, attendeeCount, externalCount };
    });

    const windowed = normalizedEvents.filter(({ start }) => !!start && start >= ws && start <= we);
    const audienceEligible = windowed.filter(({ start, externalCount, attendeeCount }) => {
      const age = start ? differenceInCalendarDays(ref, startOfDay(start)) : 0;
      if (age <= 0) return true;
      if (externalCount > 0) return true;
      return attendeeCount === 0;
    });
    const uncleared = audienceEligible.filter(({ ev, start }) => (
      !isResolved(ev.id) && !isDismissed(ev.id, start) && !isSnoozed(ev.id)
    ));
    const result = uncleared
      .map(({ ev, start }) => {
        const ageDays = start ? differenceInCalendarDays(ref, startOfDay(start)) : 0;
        return { ...ev, _ageDays: ageDays, _isCarry: ageDays > 0 };
      })
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    try {
      const todayRows = result.filter(r => r._ageDays <= 0).length;
      const carryForwardRows = result.filter(r => r._ageDays > 0).length;
      const invalidDateRows = normalizedEvents.filter(({ start }) => !start).length;
      const outsideWindowRows = normalizedEvents.length - windowed.length;
      const audienceFilteredRows = windowed.length - audienceEligible.length;
      const clearedRows = audienceEligible.length - uncleared.length;
      // eslint-disable-next-line no-console
      console.log('[EndOfDay] query result', {
        rawEvents: normalizedEvents.length,
        invalidDateRows,
        outsideWindowRows,
        audienceFilteredRows,
        clearedRows,
        totalRows: result.length,
        todayRows,
        carryForwardRows,
        appliedFilters: {
          search: search.trim(),
          chips: Array.from(filterChips),
        },
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch { /* noop */ }
    return result;
  }, [events, isResolved, isDismissed, isSnoozed, search, filterChips]);

  // Attendee contact lookup (batched)
  const allEmails = useMemo(() => {
    const s = new Set<string>();
    outstanding.forEach(ev => (ev.attendees || []).forEach(a => {
      const e = (a.email || '').trim().toLowerCase();
      if (e) s.add(e);
    }));
    return Array.from(s);
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
      if (error) return {};
      const map: Record<string, ContactInfo> = {};
      (data || []).forEach((c) => {
        const row = c as { email?: string; full_name?: string; first_name?: string; last_name?: string; job_title?: string; crm_companies?: { name?: string } | null };
        const key = (row.email || '').trim().toLowerCase();
        if (!key) return;
        map[key] = {
          fullName: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || null,
          jobTitle: row.job_title || null,
          companyName: row.crm_companies?.name || null,
        };
      });
      return map;
    },
  });

  // Apply search / filter chips
  const filtered = useMemo<TileEvent[]>(() => {
    const q = search.trim().toLowerCase();
    return outstanding.filter(ev => {
      // chip: carry > 14d
      if (filterChips.has('carry_14d') && ev._ageDays <= 14) return false;
      // chip: has linked deal — we approximate via local activity log
      const log = activity.get(ev.id);
      const hasDealLink = log.some(l => l.kind === 'linked_deal');
      if (filterChips.has('has_deal') && !hasDealLink) return false;
      // chip: no follow-up sent (no email_sent + no task_created in log)
      const hasFollowUp = log.some(l => l.kind === 'email_sent' || l.kind === 'task_created');
      if (filterChips.has('no_follow_up') && hasFollowUp) return false;

      if (!q) return true;
      if ((ev.summary || '').toLowerCase().includes(q)) return true;
      const ax = ev.attendees || [];
      for (const a of ax) {
        if ((a.email || '').toLowerCase().includes(q)) return true;
        if ((a.display_name || '').toLowerCase().includes(q)) return true;
        const m = contactsByEmail[(a.email || '').trim().toLowerCase()];
        if (m?.fullName?.toLowerCase().includes(q)) return true;
        if (m?.companyName?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [outstanding, search, filterChips, contactsByEmail, activity]);

  // Group into buckets
  type Bucket = { key: string; label: string; items: TileEvent[] };
  const buckets = useMemo<Bucket[]>(() => {
    const today: TileEvent[] = [];
    const yesterday: TileEvent[] = [];
    const week: TileEvent[] = [];
    const month: TileEvent[] = [];
    const quarter: TileEvent[] = [];
    for (const ev of filtered) {
      const d = ev._ageDays;
      if (d <= 0) today.push(ev);
      else if (d === 1) yesterday.push(ev);
      else if (d <= 7) week.push(ev);
      else if (d <= 30) month.push(ev);
      else quarter.push(ev);
    }
    return [
      { key: 'today', label: 'Today', items: today },
      { key: 'yesterday', label: 'Yesterday', items: yesterday },
      { key: 'week', label: '2–7 Days', items: week },
      { key: 'month', label: '8–30 Days', items: month },
      { key: 'quarter', label: '31–90 Days', items: quarter },
    ].filter(b => b.items.length > 0);
  }, [filtered]);

  // Flatten for keyboard nav (skipping collapsed groups)
  const flatList = useMemo(() => {
    const out: TileEvent[] = [];
    for (const b of buckets) {
      if (collapsedGroups.has(b.key)) continue;
      out.push(...b.items);
    }
    return out;
  }, [buckets, collapsedGroups]);

  // Selected event lookup
  const selectedEvent = useMemo(
    () => filtered.find(e => e.id === selectedId) || outstanding.find(e => e.id === selectedId) || null,
    [filtered, outstanding, selectedId],
  );

  useEffect(() => {
    if (selectedId) markRead(selectedId);
  }, [selectedId, markRead]);

  // Undo-aware actions ────────────────────────────────────────
  const undoToast = useCallback((id: string, kind: 'resolved' | 'dismissed', label: string) => {
    toast(label, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (kind === 'resolved') restoreResolved(id);
          else restoreDismissed(id);
          activity.append(id, { kind: 'restored', by: userId, detail: `Undid ${kind}` });
        },
      },
    });
  }, [restoreResolved, restoreDismissed, activity, userId]);

  const handleResolve = useCallback((id: string) => {
    clearResolved(id);
    activity.append(id, { kind: 'resolved', by: userId });
    if (selectedId === id) setSelectedId(null);
    bumpCleared(1);
    undoToast(id, 'resolved', 'Marked as resolved');
  }, [clearResolved, activity, userId, selectedId, undoToast, bumpCleared]);

  const handleDismiss = useCallback((id: string) => {
    clearDismissed(id);
    activity.append(id, { kind: 'dismissed', by: userId });
    if (selectedId === id) setSelectedId(null);
    bumpCleared(1);
    undoToast(id, 'dismissed', 'Dismissed');
  }, [clearDismissed, activity, userId, selectedId, undoToast, bumpCleared]);

  const handleSnooze = useCallback((id: string, until: Date, label: string) => {
    snooze(id, until);
    activity.append(id, { kind: 'snoozed', by: userId, detail: `Until ${format(until, 'PPp')}` });
    if (selectedId === id) setSelectedId(null);
    bumpCleared(1);
    toast(`Snoozed ${label}`, {
      duration: UNDO_WINDOW_MS,
      action: { label: 'Undo', onClick: () => { unsnooze(id); activity.append(id, { kind: 'restored', by: userId, detail: 'Undid snooze' }); } },
    });
  }, [snooze, unsnooze, activity, userId, selectedId, bumpCleared]);

  // Bulk actions ─────────────────────────────────────────────
  const bulkResolve = () => {
    const ids = Array.from(bulkSelected);
    ids.forEach(id => { clearResolved(id); activity.append(id, { kind: 'resolved', by: userId, detail: 'Bulk' }); });
    setBulkSelected(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    bumpCleared(ids.length);
    toast(`Resolved ${ids.length} item${ids.length === 1 ? '' : 's'}`, {
      duration: UNDO_WINDOW_MS,
      action: { label: 'Undo', onClick: () => ids.forEach(id => restoreResolved(id)) },
    });
  };
  const bulkDismiss = () => {
    const ids = Array.from(bulkSelected);
    ids.forEach(id => { clearDismissed(id); activity.append(id, { kind: 'dismissed', by: userId, detail: 'Bulk' }); });
    setBulkSelected(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    bumpCleared(ids.length);
    toast(`Dismissed ${ids.length} item${ids.length === 1 ? '' : 's'}`, {
      duration: UNDO_WINDOW_MS,
      action: { label: 'Undo', onClick: () => ids.forEach(id => restoreDismissed(id)) },
    });
  };

  // Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !inField) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (inField) return;
      const idx = selectedId ? flatList.findIndex(e2 => e2.id === selectedId) : -1;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const next = flatList[Math.min(idx + 1, flatList.length - 1)] || flatList[0];
        if (next) setSelectedId(next.id);
      } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const prev = flatList[Math.max(idx - 1, 0)];
        if (prev) setSelectedId(prev.id);
      } else if (selectedId) {
        if (e.key.toLowerCase() === 'e') { e.preventDefault(); handleResolve(selectedId); }
        else if (e.key.toLowerCase() === 'd') { e.preventDefault(); handleDismiss(selectedId); }
        else if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          const ev = flatList.find(x => x.id === selectedId);
          if (ev) handleSnooze(ev.id, addDays(new Date(), 1), ev.summary || 'event');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, flatList, selectedId, handleResolve, handleDismiss, handleSnooze]);

  // QuickCreateTask state
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ title: string; dealId: string | null; eventId?: string }>({ title: '', dealId: null });

  const clearAllFilters = useCallback(() => {
    setFilterChips(new Set());
    setSearch('');
  }, []);

  // Empty / disconnected states
  if (!status?.connected) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/60 p-10 text-center">
        <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
        <p className="text-sm text-muted-foreground">
          Connect Google Calendar to see outstanding meeting follow-ups here.
        </p>
      </div>
    );
  }

  if (loading && outstanding.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-12">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading outstanding meetings…
      </div>
    );
  }

  const isFullyEmpty = outstanding.length === 0;
  const hasActiveFilters = filterChips.size > 0 || search.trim().length > 0;

  // Master pane content
  const masterPane = (
    <div className={cn(
      'flex flex-col min-w-0 h-full',
      'rounded-xl border border-white/10 bg-background/40',
    )}>
      {/* Toolbar */}
      <div className="px-3 pt-3 pb-2 border-b border-white/[0.06] space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, attendee, company…  ( / )"
            className="h-8 pl-8 text-xs bg-white/[0.03] border-white/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(['has_deal', 'no_follow_up', 'carry_14d'] as FilterChip[]).map(chip => {
            const label = chip === 'has_deal' ? 'Has linked deal'
              : chip === 'no_follow_up' ? 'No follow-up sent'
              : 'Carry-forward > 14d';
            const on = filterChips.has(chip);
            return (
              <button
                key={chip}
                onClick={() => setFilterChips(prev => {
                  const next = new Set(prev);
                  if (next.has(chip)) next.delete(chip); else next.add(chip);
                  return next;
                })}
                className={cn(
                  'h-6 px-2 rounded-full text-[10px] font-medium border transition-colors',
                  on
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white',
                )}
              >
                {label}
              </button>
            );
          })}
          <div className="ml-auto text-[10px] text-muted-foreground/70">
            {filtered.length} of {outstanding.length}
          </div>
        </div>
      </div>

      {/* Bulk bar */}
      {bulkSelected.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.06] bg-primary/[0.04]">
          <span className="text-[11px] text-white/85">{bulkSelected.size} selected</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1.5" onClick={bulkResolve}>
              <CheckCircle2 className="h-3.5 w-3.5" />Resolve
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1.5 text-rose-300 hover:text-rose-200" onClick={bulkDismiss}>
              <X className="h-3.5 w-3.5" />Dismiss
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setBulkSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-3">
        {filtered.length === 0 && !isFullyEmpty ? (
          // Filters/search are hiding everything — neutral state, no celebration.
          <div className="text-center py-12">
            <p className="text-sm text-white/85">No items match your filters</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {outstanding.length} outstanding item{outstanding.length === 1 ? '' : 's'} hidden by filters
            </p>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-7 text-[11px]"
                onClick={clearAllFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : isFullyEmpty && clearedCount > 0 ? (
          // User cleared everything in this session — celebrate.
          <div className="text-center py-12">
            <PartyPopper className="h-8 w-8 mx-auto text-emerald-300 mb-3" />
            <p className="text-sm font-medium text-white">You're clear of outstanding items</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nothing left to follow up on. Nice work.
            </p>
          </div>
        ) : isFullyEmpty ? (
          // Naturally empty (nothing was cleared this session) — soft neutral.
          <div className="text-center py-12">
            <Inbox className="h-7 w-7 mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/85">Nothing outstanding right now</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              New meeting follow-ups will appear here as they come in.
            </p>
          </div>
        ) : (
          buckets.map(b => {
            const collapsed = collapsedGroups.has(b.key);
            return (
              <div key={b.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(b.key)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/80 hover:text-white"
                >
                  {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span>{b.label}</span>
                  <span className="text-muted-foreground/60">· {b.items.length}</span>
                  <span className="flex-1 ml-1 h-px bg-white/[0.06]" />
                </button>
                {!collapsed && (
                  <div className="space-y-1 mt-1">
                    {b.items.map(ev => (
                      <EventTile
                        key={ev.id}
                        ev={ev}
                        active={selectedId === ev.id}
                        selected={bulkSelected.has(ev.id)}
                        isUnread={!readSet.has(ev.id) && selectedId !== ev.id}
                        onClick={() => setSelectedId(ev.id)}
                        onToggleSelect={(e) => {
                          setBulkSelected(prev => {
                            const next = new Set(prev);
                            if (e.shiftKey && selectedId) {
                              const a = flatList.findIndex(x => x.id === selectedId);
                              const b2 = flatList.findIndex(x => x.id === ev.id);
                              if (a >= 0 && b2 >= 0) {
                                const [lo, hi] = a < b2 ? [a, b2] : [b2, a];
                                for (let i = lo; i <= hi; i++) next.add(flatList[i].id);
                                return next;
                              }
                            }
                            if (next.has(ev.id)) next.delete(ev.id); else next.add(ev.id);
                            return next;
                          });
                        }}
                        onResolve={() => handleResolve(ev.id)}
                        onDismiss={() => handleDismiss(ev.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // Detail pane
  const detailPane = (
    <div className="flex flex-col h-full min-w-0 rounded-xl border border-white/10 bg-background/40">
      {selectedEvent ? (
        <EventDetailPane
          event={selectedEvent}
          contactsByEmail={contactsByEmail}
          activityEntries={activity.get(selectedEvent.id)}
          userFirstName={userFirstName}
          snoozedUntil={snoozedUntil(selectedEvent.id)}
          deals={deals.map(d => ({ id: d.id, name: d.name, company: d.company }))}
          onBack={isNarrow ? () => setSelectedId(null) : undefined}
          onResolve={() => handleResolve(selectedEvent.id)}
          onDismiss={() => handleDismiss(selectedEvent.id)}
          onSnooze={(d, label) => handleSnooze(selectedEvent.id, d, label)}
          onLinkDeal={(deal) => {
            activity.append(selectedEvent.id, { kind: 'linked_deal', by: userId, detail: deal.name });
            toast.success(`Linked to deal: ${deal.name}`);
          }}
          onNoteAdded={(text) => {
            activity.append(selectedEvent.id, { kind: 'note_added', by: userId, detail: text.slice(0, 120) });
          }}
          onEmailSent={(label) => {
            activity.append(selectedEvent.id, { kind: 'email_sent', by: userId, detail: label });
          }}
          onCreateTask={() => {
            setPrefill({
              title: `Follow Up: ${selectedEvent.summary || '(No title)'}`,
              dealId: null,
              eventId: selectedEvent.id,
            });
            setFollowUpOpen(true);
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
          <div className="h-14 w-14 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-white">Nothing selected</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">
            Select an event from the left to view details and actions.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={containerRef}
        className="flex gap-2 min-h-0 h-[calc(100vh-260px)] min-h-[520px]"
      >
        {isNarrow ? (
          <div className="flex-1 min-w-0">
            {selectedEvent ? detailPane : masterPane}
          </div>
        ) : (
          <>
            <div style={{ width: paneWidth }} className="shrink-0 min-w-0">
              {masterPane}
            </div>
            <div
              onMouseDown={onDragStart}
              className="w-1.5 cursor-col-resize hover:bg-primary/30 rounded-full self-stretch flex items-center justify-center group"
              title="Drag to resize"
              aria-label="Resize panes"
            >
              <GripVertical className="h-4 w-4 text-white/20 group-hover:text-primary/60" />
            </div>
            <div className="flex-1 min-w-0">{detailPane}</div>
          </>
        )}

        <QuickCreateTaskDialog
          open={followUpOpen}
          onClose={() => setFollowUpOpen(false)}
          teamMembers={teamMembers}
          currentUserId={user?.id || ''}
          initialTitle={prefill.title}
          initialDealId={prefill.dealId}
          initialDueDate={new Date()}
          onCreate={async (input) => {
            await createTask.mutateAsync({
              title: input.title, priority: input.priority,
              due_date: input.due_date || undefined, status: input.status,
              assigned_to: input.assigned_to,
              recurrence_rule: input.recurrence_rule,
              recurrence_end_date: input.recurrence_end_date,
              deal_id: input.deal_id || undefined,
            });
            if (prefill.eventId) {
              activity.append(prefill.eventId, { kind: 'task_created', by: userId, detail: input.title });
            }
            toast.success(`Task created: "${input.title}"`);
            setFollowUpOpen(false);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

// ─── detail pane ────────────────────────────────────────────
function EventDetailPane({
  event, contactsByEmail, activityEntries, userFirstName, snoozedUntil,
  deals, onBack, onResolve, onDismiss, onSnooze,
  onLinkDeal, onNoteAdded, onEmailSent, onCreateTask,
}: {
  event: CalendarEvent;
  contactsByEmail: Record<string, ContactInfo>;
  activityEntries: ActivityEntry[];
  userFirstName: string;
  snoozedUntil: Date | null;
  deals: { id: string; name: string; company: string }[];
  onBack?: () => void;
  onResolve: () => void;
  onDismiss: () => void;
  onSnooze: (d: Date, label: string) => void;
  onLinkDeal: (deal: { id: string; name: string }) => void;
  onNoteAdded: (text: string) => void;
  onEmailSent: (label: string) => void;
  onCreateTask: () => void;
}) {
  const attendees = event.attendees || [];
  const externals = attendees.filter(a => !a.self);
  const startDate = safeParse(event.start);
  const ageDays = startDate ? differenceInCalendarDays(startOfDay(new Date()), startOfDay(startDate)) : 0;
  const isCarry = ageDays > 0;

  const [composerForAll, setComposerForAll] = useState(false);
  const [composerForOne, setComposerForOne] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [dealQuery, setDealQuery] = useState('');
  const [claapLinkerOpen, setClaapLinkerOpen] = useState(false);
  const [scheduleNextOpen, setScheduleNextOpen] = useState(false);

  const matchingDeals = useMemo(() => {
    const q = dealQuery.trim().toLowerCase();
    if (!q) return deals.slice(0, 8);
    return deals.filter(d => d.name.toLowerCase().includes(q) || d.company.toLowerCase().includes(q)).slice(0, 12);
  }, [deals, dealQuery]);

  const eventTitle = (event.summary || '(No title)').trim();
  const allEmails = externals.map(a => (a.email || '').trim()).filter(Boolean);
  const why = useMemo(() => {
    if (isCarry && externals.length === 0) return 'Internal meeting still flagged as outstanding — no external follow-up captured.';
    if (isCarry) return `Outstanding for ${ageDays} day${ageDays === 1 ? '' : 's'} with no follow-up logged from your end.`;
    if (externals.length === 0) return 'Internal-only meeting. Mark as resolved if no follow-up is needed.';
    return 'Follow-up to external attendees has not yet been sent.';
  }, [isCarry, ageDays, externals.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 pt-3 pb-3 border-b border-white/[0.08]">
        <div className="flex items-start gap-2">
          {onBack && (
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onBack} aria-label="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-white truncate">{eventTitle}</h2>
              {isCarry && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-500/10 text-[10px]">
                  Carry-forward · {ageDays}d
                </Badge>
              )}
              {snoozedUntil && (
                <Badge variant="outline" className="border-blue-500/40 text-blue-300 bg-blue-500/10 text-[10px]">
                  Snoozed until {format(snoozedUntil, 'MMM d, h:mm a')}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {startDate ? format(startDate, 'EEE, MMM d, yyyy') : ''}
              {event.all_day ? ' · All day' : ` · ${fmtTime(event.start)}${event.end ? ` – ${fmtTime(event.end)}` : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10" onClick={onResolve}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark resolved (E)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-rose-300 hover:text-rose-200 hover:bg-rose-500/10" onClick={onDismiss}>
                  <X className="h-3.5 w-3.5" /> Dismiss
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dismiss (D)</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Snooze <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[10px]">Snooze until</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => onSnooze(addHours(new Date(), 4), eventTitle)}>4 hours</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSnooze(addDays(new Date(), 1), eventTitle)}>Tomorrow</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSnooze(addWeeks(new Date(), 1), eventTitle)}>1 week</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {event.html_link && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                    <a href={event.html_link} target="_blank" rel="noreferrer" aria-label="Open in Google Calendar">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open in Google Calendar</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-5">
        {/* Why outstanding */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">Why this is still outstanding</span>
          </div>
          <p className="text-xs text-white/85 leading-relaxed">{why}</p>
        </section>

        {/* Agenda / context */}
        <section>
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">Agenda</h3>
          {event.description ? (
            <div className="text-xs text-white/85 leading-relaxed whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.02] p-3 max-h-48 overflow-y-auto">
              {event.description.replace(/<[^>]+>/g, '')}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No agenda captured for this meeting.</p>
          )}
        </section>

        {/* Attendees */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
              Attendees ({attendees.length})
            </h3>
            {allEmails.length > 0 && (
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => setComposerForAll(v => !v)}>
                <Mail className="h-3 w-3" /> Email all
              </Button>
            )}
          </div>
          {composerForAll && allEmails.length > 0 && (
            <div className="mb-2">
              <InlineComposer
                to={allEmails}
                defaultSubject={`${eventTitle} Follow Up`}
                recipientLabel={`${allEmails.length} attendees`}
                onClose={() => setComposerForAll(false)}
                onSent={() => onEmailSent(`Sent follow-up to ${allEmails.length} attendees`)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            {attendees.map((a, i) => {
              const key = (a.email || '').trim().toLowerCase();
              const m = contactsByEmail[key];
              const name = m?.fullName || a.display_name || a.email || 'Unknown';
              const rowKey = `${event.id}::${key || i}`;
              const isComposing = composerForOne === rowKey;
              return (
                <div key={rowKey} className="rounded-md bg-white/[0.02] border border-white/[0.06] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-white truncate">{name}</span>
                        {m?.jobTitle && <span className="text-[10px] text-white/65 truncate">· {m.jobTitle}</span>}
                        {m?.companyName && (
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-white/15 bg-white/[0.04]">
                            {m.companyName}
                          </Badge>
                        )}
                      </div>
                      {a.email && <div className="text-[10px] text-white/60 truncate">{a.email}</div>}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!a.email}
                            onClick={() => setComposerForOne(isComposing ? null : rowKey)}
                            aria-label={`Email ${name}`}
                          >
                            <Mail className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Draft follow-up</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!a.email}
                            onClick={() => {
                              if (a.email) {
                                navigator.clipboard.writeText(a.email);
                                toast.success('Email copied');
                              }
                            }}
                            aria-label={`Copy ${name}'s email`}
                          >
                            <CopyIcon className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy email</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {isComposing && a.email && (
                    <div className="mt-2">
                      <InlineComposer
                        to={[a.email]}
                        defaultSubject={`${eventTitle} Follow Up`}
                        recipientLabel={name}
                        onClose={() => setComposerForOne(null)}
                        onSent={() => onEmailSent(`Sent follow-up to ${name}`)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Action items */}
        <section>
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">Action items</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="h-8 justify-start gap-2 text-xs" onClick={() => setComposerForAll(true)}>
              <Mail className="h-3.5 w-3.5" /> Send follow-up
            </Button>
            <Button size="sm" variant="outline" className="h-8 justify-start gap-2 text-xs" onClick={onCreateTask}>
              <ListPlus className="h-3.5 w-3.5" /> Create task
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 justify-start gap-2 text-xs">
                  <Link2 className="h-3.5 w-3.5" /> Link to deal
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2">
                <Input
                  value={dealQuery}
                  onChange={(e) => setDealQuery(e.target.value)}
                  placeholder="Search deals…"
                  className="h-7 text-xs mb-2"
                />
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {matchingDeals.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground p-2">No deals match.</p>
                  ) : matchingDeals.map(d => (
                    <button
                      key={d.id}
                      onClick={() => onLinkDeal(d)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-white/[0.05] text-xs"
                    >
                      <div className="font-medium text-white truncate flex items-center gap-1.5">
                        <Briefcase className="h-3 w-3 text-white/60" />{d.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{d.company}</div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              variant="outline"
              className="h-8 justify-start gap-2 text-xs"
              onClick={() => setScheduleNextOpen(true)}
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Schedule next
            </Button>
            <FindATimeDialog
              open={scheduleNextOpen}
              onOpenChange={setScheduleNextOpen}
              defaultTitle={`Follow-up: ${eventTitle}`}
              attendees={externals
                .filter((a) => a.email)
                .map((a) => ({ email: a.email!, name: a.display_name || a.email }))}
              onScheduled={() => {
                toast.success('Calendar invite sent');
                onEmailSent('Sent calendar invite (Schedule next)');
              }}
            />
            <MeetingClaapInlineAction
              eventId={event.id}
              eventTitle={eventTitle}
              eventStart={event.start}
              eventEnd={event.end}
              organizerEmail={event.organizer?.email || null}
              attendees={(event.attendees || []).map(a => ({
                email: a.email,
                displayName: a.display_name,
                self: a.self,
                responseStatus: a.response_status,
              }))}
              onOpenPicker={() => setClaapLinkerOpen(true)}
            />
          </div>

          {/* Add note */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <StickyNote className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">Add note</span>
            </div>
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={`Note for ${userFirstName}'s records…`}
              className="min-h-[72px] text-xs resize-y bg-white/[0.02]"
            />
            <div className="flex justify-end mt-1.5">
              <Button size="sm" className="h-7 text-[11px]" disabled={!noteDraft.trim()}
                onClick={() => { onNoteAdded(noteDraft.trim()); setNoteDraft(''); toast.success('Note added'); }}
              >
                Save note
              </Button>
            </div>
          </div>
        </section>

        {/* History */}
        <section>
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-2">Activity</h3>
          {activityEntries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No activity yet on this item.</p>
          ) : (
            <ul className="space-y-1.5">
              {activityEntries.map(entry => (
                <li key={entry.id} className="flex items-start gap-2 text-[11px] text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium capitalize">{entry.kind.replace('_', ' ')}</span>
                    {entry.detail && <span className="text-white/65"> · {entry.detail}</span>}
                    <span className="text-muted-foreground/70 ml-1">
                      · {formatDistanceToNow(parseISO(entry.at), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sticky footer */}
      <div className="border-t border-white/[0.08] px-3 py-2.5 flex items-center gap-2">
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-500/40" onClick={onResolve}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" /> Dismiss
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 ml-auto">
              <Clock className="h-3.5 w-3.5" /> Snooze <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSnooze(addHours(new Date(), 4), eventTitle)}>4 hours</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(addDays(new Date(), 1), eventTitle)}>Tomorrow</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(addWeeks(new Date(), 1), eventTitle)}>1 week</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EventClaapLinker
        open={claapLinkerOpen}
        onOpenChange={setClaapLinkerOpen}
        eventId={event.id}
        eventTitle={eventTitle}
        attendeeEmails={allEmails}
      />
    </div>
  );
}