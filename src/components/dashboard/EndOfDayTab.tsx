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
  Briefcase, Video, Undo2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMeetingClaapContext } from '@/hooks/useMeetingClaapContext';
import { useClaapTokenStatus } from '@/hooks/useClaapTokenStatus';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useMyTasks } from '@/hooks/useTasks';
import { normalizeEmailDomain, normalizeWebsiteDomain, isFreemailDomain } from '@/lib/domainMatch';
import { QuickCreateTaskDialog } from '@/components/tasks/QuickCreateTaskDialog';
import { EmailComposerCard, type ComposerRecipients, type ComposerSendOptions } from '@/components/deal/email/EmailComposerCard';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { useGmail } from '@/hooks/useGmail';
import { usePersistentClears } from '@/hooks/usePersistentClears';
import { useDbPersistentClears } from '@/hooks/useDbPersistentClears';
import { useRecentEodDismissals } from '@/hooks/useRecentEodDismissals';
import { EventClaapLinker } from '@/components/dashboard/EventClaapLinker';
import { MeetingClaapInlineAction } from '@/components/dashboard/MeetingClaapInlineAction';
import { MeetingDealInlineAction } from '@/components/dashboard/MeetingDealInlineAction';
import { MeetingFollowupInlineAction } from '@/components/dashboard/MeetingFollowupInlineAction';
import { MeetingScheduleInlineAction } from '@/components/dashboard/MeetingScheduleInlineAction';
import { MeetingCreateFollowUpAction } from '@/components/dashboard/MeetingCreateFollowUpAction';
import { MeetingAddToDealCalendarAction } from '@/components/dashboard/MeetingAddToDealCalendarAction';
import { FindATimeDialog } from '@/components/scheduling/FindATimeDialog';
import { SuggestedTasksSection } from '@/components/dashboard/SuggestedTasksSection';
import { ClaapNoteEditor } from '@/components/dashboard/ClaapNoteEditor';
import { HighlightCalendarMenu } from '@/components/calendar/HighlightCalendarMenu';
import { ShareNotesDialog } from '@/components/dashboard/ShareNotesDialog';
import { Share2 } from 'lucide-react';

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
const EVENTS_CACHE_KEY_PREFIX = 'eod:events-cache';

type FilterChip = 'internal' | 'deals' | 'dismissed';

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
          <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[9px] border-white/15 text-white/75 bg-white/[0.04]">
            {ev._ageDays <= 0 ? 'Today' : ev._ageDays === 1 ? 'Yesterday' : `${ev._ageDays} days ago`}
          </Badge>
          <span className="ml-auto flex items-center gap-0.5 text-white/70">
            <Users className="h-2.5 w-2.5" />{attendeeCount}
          </span>
        </div>
      </div>

      {/* Hover action: dismiss (checkmark) */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/70 hover:text-emerald-300 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Dismiss</TooltipContent>
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

  const { events: hookEvents, listEvents, status, isStatusLoading } = useGoogleCalendar();
  // Hydrate instantly from a per-user localStorage cache so reopening the
  // End of Day tab paints the master list immediately. The real fetch still
  // runs in the background and refreshes the cache.
  const eventsCacheKey = `${EVENTS_CACHE_KEY_PREFIX}:${userId}`;
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    if (hookEvents && hookEvents.length) return hookEvents;
    return readLS<CalendarEvent[]>(eventsCacheKey, []);
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hookEvents && hookEvents.length) setEvents(hookEvents);
  }, [hookEvents]);

  const { deals } = useDealsContext();
  const teamMembers = useTeamMembers();
  const { createTask } = useMyTasks();
  const { company } = useCompany();

  const { clear: clearResolved, restore: restoreResolved, isCleared: isResolvedRaw } = useDbPersistentClears('eod-agenda');
  const { clear: clearDismissed, restore: restoreDismissed, isCleared: isDismissedRaw } = useDbPersistentClears('eod-dismissed');
  const { recent: recentDismissals, undo: undoDismissal, undoLast: undoLastDismissal } = useRecentEodDismissals();
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

  // Bulk "Mark all as read" — clears the blue unread dot on every currently
  // visible outstanding tile in one click (subtask #4: stop forcing users to
  // open every meeting to clear notifications).
  const markManyRead = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setReadSet(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      if (!changed) return prev;
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

  // Responsive: only collapse to a single stacked column on true tablet/mobile widths.
  // Laptop and desktop (>=768px) always show the two-column master/detail layout.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Fetch
  useEffect(() => {
    if (!enabled) return;
    // Allow the fetch when we either know we're connected OR when we already
    // have cached events (which implies a prior successful connection). This
    // avoids waiting for the status round-trip before refreshing the list.
    if (!status?.connected && events.length === 0) return;
    let cancelled = false;
    (async () => {
      // Only show the loading spinner on a true cold start.
      if (events.length === 0) setLoading(true);
      const timeMin = startOfDay(subDays(new Date(), EOD_LOOKBACK_DAYS)).toISOString();
      const timeMax = endOfDay(new Date()).toISOString();
      const res = await listEvents({ timeMin, timeMax, maxResults: EOD_FETCH_MAX_RESULTS });
      if (!cancelled) {
        const next = res?.events || hookEvents || [];
        setEvents(next);
        try { writeLS(eventsCacheKey, next); } catch { /* ignore quota */ }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status?.connected, listEvents, eventsCacheKey]);

  // Build outstanding (filter resolved + dismissed + snoozed)
  const outstanding = useMemo<TileEvent[]>(() => {
    const now = new Date();
    const ws = startOfDay(subDays(now, EOD_LOOKBACK_DAYS));
    const we = endOfDay(now);
    const ref = startOfDay(now);
    const normalizedEvents = (events || []).map(ev => {
      const start = safeParse(ev.start);
      const attendees = ev.attendees || [];
      const attendeeCount = attendees.length;
      const otherCount = attendees.filter(a => !a.self).length;
      const externalCount = attendees.filter(a => !a.self && !isInternalAttendee(a.email)).length;
      return { ev, start, attendeeCount, otherCount, externalCount };
    });

    const windowed = normalizedEvents.filter(({ start }) => !!start && start >= ws && start <= we);
    // Require at least one OTHER attendee besides the current user.
    // Personal/solo events (Gym, focus blocks, etc.) are filtered out.
    const audienceEligible = windowed.filter(({ otherCount }) => otherCount > 0);
    const showingDismissed = filterChips.has('dismissed');
    // Default view = actionable items: not resolved, not dismissed, not
    // snoozed, AND not yet marked-as-read. Opening details must not mark an
    // item read or clear it; only explicit actions should remove it from view.
    // The "Dismissed" chip flips the pane to show ONLY items that have been
    // cleared in some way — dismissed, resolved, or marked-as-read.
    const stateFiltered = audienceEligible.filter(({ ev, start }) => {
      const resolved = isResolved(ev.id);
      const dismissed = isDismissed(ev.id, start);
      const snoozed = isSnoozed(ev.id);
      const read = readSet.has(ev.id);
      if (showingDismissed) {
        return resolved || dismissed || read;
      }
      // Default view hides anything the user has acted on: resolved,
      // dismissed, snoozed, or marked-as-read. Those only resurface when
      // the "Dismissed" chip is explicitly selected.
      // Keep the currently-selected item visible if a clearing action lands
      // while its detail pane is still open.
      if (ev.id === selectedId) return !resolved && !dismissed && !snoozed;
      return !resolved && !dismissed && !snoozed && !read;
    });
    const result = stateFiltered
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
      const clearedRows = audienceEligible.length - stateFiltered.length;
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
  }, [events, isResolved, isDismissed, isSnoozed, readSet, search, filterChips, selectedId]);

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
  // Pre-compute deal matching context. A meeting counts as "Deals" when:
  //   1. It has a canonical link in `meeting_deal_links`, OR
  //   2. A Claap recording attached to the event is linked to a deal in
  //      `deal_claap_recordings` (the recording transcript/summary references
  //      the deal — Claap routing writes this link when the transcript
  //      mentions the deal name), OR
  //   3. The event title contains the deal name/company, OR
  //   4. Any non-internal attendee's email domain matches the deal's
  //      company URL domain or the deal's client-contact email domain.
  const visibleEventIds = useMemo(() => outstanding.map(e => e.id), [outstanding]);
  const { data: dealLinkedEventIds } = useQuery<Set<string>>({
    queryKey: ['eod-deal-linked-events', company?.id, visibleEventIds.join(',')],
    enabled: !!company?.id && visibleEventIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const hits = new Set<string>();
      // (1) meeting_deal_links
      try {
        const { data } = await (supabase.from('meeting_deal_links') as any)
          .select('meeting_external_id')
          .eq('org_company_id', company!.id)
          .in('meeting_external_id', visibleEventIds)
          .is('deleted_at', null);
        for (const row of (data || []) as Array<{ meeting_external_id: string }>) {
          if (row.meeting_external_id) hits.add(row.meeting_external_id);
        }
      } catch { /* noop */ }
      // (2) event_claap_recordings → deal_claap_recordings
      try {
        const { data: ecr } = await (supabase.from('event_claap_recordings') as any)
          .select('event_id, recording_id')
          .eq('org_company_id', company!.id)
          .in('event_id', visibleEventIds);
        const recIds = Array.from(new Set(((ecr || []) as Array<{ recording_id: string }>)
          .map(r => r.recording_id).filter(Boolean)));
        if (recIds.length) {
          const { data: dcr } = await supabase
            .from('deal_claap_recordings')
            .select('recording_id')
            .in('recording_id', recIds);
          const dealRecIds = new Set(((dcr || []) as Array<{ recording_id: string }>)
            .map(r => r.recording_id));
          for (const row of (ecr || []) as Array<{ event_id: string; recording_id: string }>) {
            if (dealRecIds.has(row.recording_id)) hits.add(row.event_id);
          }
        }
      } catch { /* noop */ }
      return hits;
    },
  });

  // Fetch transcript/summary text for any Claap recording linked to a visible
  // event so we can match deal names that the recording *content* mentions
  // (e.g. a "Structural Capital" event whose recording transcript discusses
  // the "Worthy" deal).
  const { data: eventRecordingText } = useQuery<Record<string, string>>({
    queryKey: ['eod-event-recording-text', company?.id, visibleEventIds.join(',')],
    enabled: !!company?.id && visibleEventIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, string> = {};
      try {
        const { data: ecr } = await (supabase.from('event_claap_recordings') as any)
          .select('event_id, recording_id')
          .eq('org_company_id', company!.id)
          .in('event_id', visibleEventIds);
        const rows = (ecr || []) as Array<{ event_id: string; recording_id: string }>;
        const recIds = Array.from(new Set(rows.map(r => r.recording_id).filter(Boolean)));
        if (!recIds.length) return out;
        const { data: recs } = await (supabase.from('claap_recordings') as any)
          .select('id, title, summary, synthesized_note, key_takeaways, action_items, chapters')
          .in('id', recIds);
        const textById = new Map<string, string>();
        for (const r of (recs || []) as Array<Record<string, any>>) {
          const parts: string[] = [];
          const push = (v: any) => {
            if (!v) return;
            if (typeof v === 'string') parts.push(v);
            else if (Array.isArray(v)) v.forEach(push);
            else if (typeof v === 'object') Object.values(v).forEach(push);
          };
          push(r.title); push(r.summary); push(r.synthesized_note);
          push(r.key_takeaways); push(r.action_items); push(r.chapters);
          textById.set(r.id, parts.join(' \n ').toLowerCase());
        }
        for (const row of rows) {
          const t = textById.get(row.recording_id);
          if (!t) continue;
          out[row.event_id] = (out[row.event_id] ? out[row.event_id] + ' \n ' : '') + t;
        }
      } catch { /* noop */ }
      return out;
    },
  });

  const dealMatchers = useMemo(() => {
    const domains = new Map<string, true>();
    const names: { needle: string }[] = [];
    // Common single words / short tokens we never want to use as a deal
    // matcher (otherwise titles like "Finance Sync" or "John & James" match
    // any deal whose name happens to contain "finance", "john", etc.).
    const STOPWORDS = new Set([
      'finance', 'sync', 'review', 'call', 'meeting', 'sales', 'team',
      'weekly', 'daily', 'monthly', 'check', 'checkin', 'check-in',
      'standup', 'stand-up', 'sync-up', 'syncup', 'kickoff', 'kick-off',
      'intro', 'follow', 'followup', 'follow-up', 'update', 'updates',
      'pipeline', 'partners', 'partner', 'ops', 'operations', 'deal',
      'deals', 'lender', 'lenders', 'capital', 'group', 'co', 'company',
      'inc', 'llc', 'ltd', 'the', 'and', 'for', 'with', 'naitive',
      '5th line', '5thline',
    ]);
    for (const d of deals || []) {
      const webDom = normalizeWebsiteDomain(d.companyUrl);
      if (webDom && !isFreemailDomain(webDom) && webDom !== '5thline.co') {
        domains.set(webDom, true);
      }
      const contactDom = normalizeEmailDomain(d.contactInfo) ?? normalizeEmailDomain(d.contactEmail);
      if (contactDom && !isFreemailDomain(contactDom) && contactDom !== '5thline.co') {
        domains.set(contactDom, true);
      }
      const company = (d.company || '').trim().toLowerCase();
      const name = (d.name || '').trim().toLowerCase();
      const pushName = (raw: string) => {
        if (!raw) return;
        // Require ≥4 chars and skip stopwords / generic tokens. A single-word
        // needle additionally must be ≥5 chars to avoid false positives like
        // "James"/"Finance" inside event titles.
        const cleaned = raw
          // Strip corporate suffixes so "Worthy Financial Inc" can still
          // surface its core token "worthy".
          .replace(/\b(inc|llc|ltd|co|corp|corporation|company|capital|partners|holdings|group)\b\.?/gi, '')
          .replace(/[,.]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (!cleaned) return;
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        const pushOne = (n: string) => {
          if (!n || n.length < 4) return;
          if (STOPWORDS.has(n)) return;
          names.push({ needle: n });
        };
        // Push the full phrase when it's multi-word — catches "structural
        // capital advisors" style titles.
        if (tokens.length > 1) pushOne(cleaned);
        // Always also push individual significant tokens (≥5 chars) so a
        // shortened event title like "Worthy call" matches a deal named
        // "Worthy Financial".
        for (const tok of tokens) {
          if (tok.length >= 5) pushOne(tok);
        }
        // Single-word deal names ≥5 chars are still allowed via the token
        // loop above; shorter single-word names are intentionally skipped.
      };
      pushName(company);
      if (name !== company) pushName(name);
    }
    return { domains, names };
  }, [deals]);

  // Word-boundary aware title match. We require the deal-name needle to
  // appear as a whole word (or contiguous phrase) inside the title — not
  // just as a substring — so titles like "Finance Sync" don't match a deal
  // called "Finance Co" via the bare substring "finance".
  const titleContainsNeedle = useCallback((title: string, needle: string): boolean => {
    if (!title || !needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return re.test(title);
  }, []);

  const eventMatchesDeal = useCallback((ev: TileEvent): boolean => {
    if (dealLinkedEventIds?.has(ev.id)) return true;
    // Purely internal meetings (every party @5thline.co) never count as a
    // deal meeting unless they have an explicit canonical link above.
    if (eventIsInternalStrict(ev)) return false;
    const title = (ev.summary || '').toLowerCase();
    if (title) {
      for (const { needle } of dealMatchers.names) {
        if (titleContainsNeedle(title, needle)) return true;
      }
    }
    // Match deal names against linked Claap recording transcript/summary
    // text — covers cases where the meeting title doesn't reference the
    // deal but the recording content does.
    const recText = eventRecordingText?.[ev.id];
    if (recText) {
      for (const { needle } of dealMatchers.names) {
        if (titleContainsNeedle(recText, needle)) return true;
      }
    }
    for (const a of (ev.attendees || [])) {
      if (a.self) continue;
      const dom = normalizeEmailDomain(a.email);
      if (!dom || isFreemailDomain(dom)) continue;
      if (dom === '5thline.co') continue;
      if (dealMatchers.domains.has(dom)) return true;
    }
    return false;
  }, [dealLinkedEventIds, dealMatchers, titleContainsNeedle, eventRecordingText]);

  // An event is "internal" when every email-bearing party (attendees + the
  // organizer) uses the @5thline.co domain. We include the organizer so
  // events where attendees are missing self entries (or where the organizer
  // isn't listed as an attendee) still resolve correctly. Solo events with
  // no other attendees count as internal when the organizer is internal.
  function eventIsInternalStrict(ev: TileEvent): boolean {
    const emails: string[] = [];
    for (const a of ev.attendees || []) {
      const e = (a.email || '').trim();
      if (e) emails.push(e);
    }
    const orgEmail = (ev.organizer?.email || '').trim();
    if (orgEmail) emails.push(orgEmail);
    if (emails.length === 0) return false;
    return emails.every(e => isInternalAttendee(e));
  }
  const eventIsInternal = useCallback((ev: TileEvent) => eventIsInternalStrict(ev), []);

  const filtered = useMemo<TileEvent[]>(() => {
    const q = search.trim().toLowerCase();
    return outstanding.filter(ev => {
      if (filterChips.has('internal') && !eventIsInternal(ev)) return false;
      if (filterChips.has('deals') && !eventMatchesDeal(ev)) return false;

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
  }, [outstanding, search, filterChips, contactsByEmail, eventIsInternal, eventMatchesDeal]);

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

  // Default to having the first visible item open in the detail pane so
  // the right side never renders empty when there's work to review.
  useEffect(() => {
    if (selectedEvent) return;
    const first = flatList[0];
    if (first) setSelectedId(first.id);
  }, [selectedEvent, flatList]);

  // Authoritative linked deal for the currently-selected event. Sourced
  // from `meeting_deal_links` (the same row written by "Link deal" via
  // MeetingDealInlineAction). The query key includes selectedId, so the
  // hook re-runs whenever the user changes the focused event; the
  // invalidate in MeetingDealInlineAction.persistLink also refreshes it
  // when the user switches the linked deal in-place. This is the SINGLE
  // source of truth for prefilling the New Task deal field — no fuzzy
  // matching on title/transcript and no "first active deal" fallback.
  const { data: selectedLinkedDealId } = useQuery<string | null>({
    queryKey: ['meeting-deal-link', selectedId, company?.id],
    enabled: !!company?.id && !!selectedId,
    staleTime: 0,
    queryFn: async () => {
      try {
        const { data } = await (supabase.from('meeting_deal_links') as any)
          .select('deal_id')
          .eq('org_company_id', company!.id)
          .eq('meeting_external_id', selectedId)
          .is('deleted_at', null)
          .order('linked_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return (data?.deal_id as string | undefined) ?? null;
      } catch {
        return null;
      }
    },
  });

  // One-time baseline (subtask #4): on the first time a user lands in EOD
  // after this feature ships, mark every currently-outstanding item as
  // read so they "start fresh" instead of seeing months of blue dots.
  useEffect(() => {
    if (!userId || outstanding.length === 0) return;
    const baselineKey = `eod:read-baselined:${userId}`;
    try {
      if (typeof window !== 'undefined' && !window.localStorage.getItem(baselineKey)) {
        markManyRead(outstanding.map(e => e.id));
        window.localStorage.setItem(baselineKey, new Date().toISOString());
      }
    } catch { /* ignore storage failures */ }
  }, [userId, outstanding, markManyRead]);

  const unreadVisibleIds = useMemo(
    () => filtered.filter(e => !readSet.has(e.id) && e.id !== selectedId).map(e => e.id),
    [filtered, readSet, selectedId],
  );

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

  // Pick the id of the next item to auto-select after the current one is
  // cleared, so the detail pane keeps flowing through the queue instead of
  // collapsing back to an empty state.
  const pickNextId = useCallback((clearedId: string): string | null => {
    const idx = flatList.findIndex(e => e.id === clearedId);
    if (idx === -1) {
      const first = flatList.find(e => e.id !== clearedId);
      return first ? first.id : null;
    }
    const after = flatList.slice(idx + 1).find(e => e.id !== clearedId);
    if (after) return after.id;
    const before = [...flatList.slice(0, idx)].reverse().find(e => e.id !== clearedId);
    return before ? before.id : null;
  }, [flatList]);

  const handleResolve = useCallback((id: string) => {
    clearResolved(id);
    activity.append(id, { kind: 'resolved', by: userId });
    if (selectedId === id) setSelectedId(pickNextId(id));
    bumpCleared(1);
    undoToast(id, 'resolved', 'Marked as resolved');
  }, [clearResolved, activity, userId, selectedId, undoToast, bumpCleared, pickNextId]);

  const handleDismiss = useCallback((id: string) => {
    clearDismissed(id);
    activity.append(id, { kind: 'dismissed', by: userId });
    if (selectedId === id) setSelectedId(pickNextId(id));
    bumpCleared(1);
    undoToast(id, 'dismissed', 'Dismissed');
  }, [clearDismissed, activity, userId, selectedId, undoToast, bumpCleared, pickNextId]);

  const handleSnooze = useCallback((id: string, until: Date, label: string) => {
    snooze(id, until);
    activity.append(id, { kind: 'snoozed', by: userId, detail: `Until ${format(until, 'PPp')}` });
    if (selectedId === id) setSelectedId(pickNextId(id));
    bumpCleared(1);
    toast(`Snoozed ${label}`, {
      duration: UNDO_WINDOW_MS,
      action: { label: 'Undo', onClick: () => { unsnooze(id); activity.append(id, { kind: 'restored', by: userId, detail: 'Undid snooze' }); } },
    });
  }, [snooze, unsnooze, activity, userId, selectedId, bumpCleared, pickNextId]);

  // Bulk actions ─────────────────────────────────────────────
  const bulkResolve = () => {
    const ids = Array.from(bulkSelected);
    ids.forEach(id => { clearResolved(id); activity.append(id, { kind: 'resolved', by: userId, detail: 'Bulk' }); });
    setBulkSelected(new Set());
    if (selectedId && ids.includes(selectedId)) {
      const next = flatList.find(e => !ids.includes(e.id));
      setSelectedId(next ? next.id : null);
    }
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
    if (selectedId && ids.includes(selectedId)) {
      const next = flatList.find(e => !ids.includes(e.id));
      setSelectedId(next ? next.id : null);
    }
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

  // Empty / disconnected states. While the calendar status is still resolving
  // (or we already have cached events from a prior session), assume connected
  // so reopening the Dashboard popup paints instantly instead of flashing the
  // "Connect Google Calendar" prompt.
  if (!status?.connected && !isStatusLoading && events.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/60 p-10 text-center">
        <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
        <p className="text-sm text-muted-foreground">
          Connect Google Calendar to see outstanding meeting follow-ups here.
        </p>
      </div>
    );
  }

  if (loading && outstanding.length === 0 && events.length === 0) {
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
      'panel-pane',
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-6 px-2 rounded-full text-[10px] font-medium border transition-colors inline-flex items-center gap-1',
                  filterChips.size > 0
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-white/[0.03] border-white/10 text-white/70 hover:text-white',
                )}
              >
                Filters{filterChips.size > 0 ? ` (${filterChips.size})` : ''}
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuLabel className="text-[10px]">Filter by</DropdownMenuLabel>
              {(['internal', 'deals', 'dismissed'] as FilterChip[]).map(chip => {
                const label = chip === 'internal' ? 'Internal' : chip === 'deals' ? 'Deals' : 'Dismissed';
                return (
                  <DropdownMenuCheckboxItem
                    key={chip}
                    checked={filterChips.has(chip)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => setFilterChips(prev => {
                      const next = new Set(prev);
                      if (next.has(chip)) next.delete(chip); else next.add(chip);
                      return next;
                    })}
                    className="text-xs"
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {filterChips.size > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs justify-center"
                    onSelect={() => setFilterChips(new Set())}
                  >
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex items-center gap-2">
            {recentDismissals.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Undo recent dismissals (${recentDismissals.length})`}
                    className="h-6 w-6 rounded-full border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors inline-flex items-center justify-center"
                    title={`Undo recent dismissals (${recentDismissals.length})`}
                  >
                    <Undo2 className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <span className="text-[11px] font-medium text-foreground">
                      Recent dismissals
                    </span>
                    <button
                      type="button"
                      className="text-[10px] text-primary hover:underline"
                      onClick={async () => {
                        const last = await undoLastDismissal();
                        if (last) toast.success('Restored last dismissal');
                      }}
                    >
                      Undo last
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {recentDismissals.map((d, idx) => (
                      <button
                        key={d.rowId}
                        type="button"
                        onClick={async () => {
                          await undoDismissal(d.rowId);
                          toast.success('Restored dismissal');
                        }}
                        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
                      >
                        <Undo2 className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-foreground truncate">
                            {idx === 0 ? 'Most recent' : `#${idx + 1}`} · {d.scope === 'eod-agenda' ? 'Resolved' : 'Dismissed'}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {d.itemId}
                          </div>
                          <div className="text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(d.clearedAt), { addSuffix: true })}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {unreadVisibleIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  markManyRead(unreadVisibleIds);
                  toast.success(`Marked ${unreadVisibleIds.length} as read`);
                }}
                className="h-6 px-2 rounded-full text-[10px] font-medium border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                title="Clear the unread dot on every visible item"
              >
                Mark all as read ({unreadVisibleIds.length})
              </button>
            )}
            <div className="text-[10px] text-muted-foreground/70">
              {filtered.length} of {outstanding.length}
            </div>
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
    <div className="panel-pane flex flex-col h-full min-w-0">
      {selectedEvent ? (
        <EventDetailPane
          key={selectedEvent.id}
          event={selectedEvent}
          linkedDealId={selectedLinkedDealId ?? null}
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
          onCreateTask={(initialTitle) => {
            setPrefill({
              title: initialTitle || `Follow Up: ${selectedEvent.summary || '(No title)'}`,
              // Explicit meeting→deal link is the SINGLE source of truth.
              // If nothing is linked, leave empty — never guess.
              dealId: selectedLinkedDealId ?? null,
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
        className="panel-shell flex h-full min-h-0 gap-2 p-1.5"
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
          // Meeting flow: the deal field is governed by the explicit
          // meeting→deal link only. Suppress the dialog's title-based
          // fuzzy auto-apply so it can never overwrite the explicit
          // link (or fall back to a random deal when nothing is linked).
          lockInitialDeal
          initialDueDate={new Date()}
          onCreate={async (input) => {
            await createTask.mutateAsync({
              title: input.title, priority: input.priority,
              due_date: input.due_date || undefined, status: input.status,
              assigned_to: input.assigned_to,
              recurrence_rule: input.recurrence_rule,
              recurrence_end_date: input.recurrence_end_date,
              deal_id: input.deal_id || undefined,
              source: input.deal_id && prefill.eventId
                ? {
                    module: 'rundown_item',
                    recordId: prefill.eventId,
                    sourceTimestamp: new Date().toISOString(),
                    sourceText: input.title,
                  }
                : null,
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
  deals, linkedDealId, onBack, onResolve, onDismiss, onSnooze,
  onLinkDeal, onNoteAdded, onEmailSent, onCreateTask,
}: {
  event: CalendarEvent;
  linkedDealId?: string | null;
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
  onCreateTask: (initialTitle?: string) => void;
}) {
  const attendees = event.attendees || [];
  const externals = attendees.filter(a => !a.self);
  const startDate = safeParse(event.start);
  const ageDays = startDate ? differenceInCalendarDays(startOfDay(new Date()), startOfDay(startDate)) : 0;
  const isCarry = ageDays > 0;

  const [composerForAll, setComposerForAll] = useState(false);
  const [composerPrefillBody, setComposerPrefillBody] = useState<string | undefined>(undefined);
  const [composerForOne, setComposerForOne] = useState<string | null>(null);
  const [attendeesExpanded, setAttendeesExpanded] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  const [savedNotes, setSavedNotes] = useState<{ id: string; text: string; at: string }[]>([]);
  const { user: authUser } = useAuth();

  // Load persisted meeting notes for this event so the user always sees
  // their prior notes when the detail pane re-opens — and so the nAItive
  // AI can search them via the copilot-chat tool.
  useEffect(() => {
    let cancelled = false;
    if (!authUser?.id || !event.id) {
      setSavedNotes([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('user_meeting_notes')
        .select('id, note_text, created_at')
        .eq('user_id', authUser.id)
        .eq('event_id', event.id)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('[EndOfDay] failed to load meeting notes', error.message);
        return;
      }
      setSavedNotes((data || []).map((r: any) => ({ id: r.id, text: r.note_text, at: r.created_at })));
    })();
    return () => { cancelled = true; };
  }, [authUser?.id, event.id]);
  const [notePrefilledFromClaap, setNotePrefilledFromClaap] = useState(false);
  const [notePrefillRecordingId, setNotePrefillRecordingId] = useState<string | null>(null);
  const [notePrefillSource, setNotePrefillSource] = useState<'claap' | 'local'>('local');
  const { tokenPresent: claapTokenPresent } = useClaapTokenStatus();
  const eventTitle = (event.summary || '(No title)').trim();
  const organizerEmail = event.organizer?.email || null;
  const claapCtx = useMeetingClaapContext({
    eventId: event.id,
    eventTitle,
    eventStart: event.start ?? null,
    organizerEmail,
  });
  const { fetching: claapCtxFetching, transcriptAvailable } = claapCtx;
  const [claapBackfilling, setClaapBackfilling] = useState(false);
  const [claapBackfillTried, setClaapBackfillTried] = useState<string | null>(null);

  // Pull live sync status for the linked recording (attempts + last error)
  // so the card can surface "Syncing…" / Retry on permanent failure.
  const recordingRowIdForStatus = claapCtx.recording?.rowId ?? null;
  const { data: claapSyncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['claap-recording-sync-status', recordingRowIdForStatus],
    enabled: !!recordingRowIdForStatus,
    refetchInterval: claapCtx.source === 'none' ? 5000 : false,
    queryFn: async () => {
      const { data } = await supabase
        .from('claap_recordings')
        .select('sync_attempts, last_sync_error, last_sync_status, claap_summary_synced_at')
        .eq('id', recordingRowIdForStatus!)
        .maybeSingle();
      return data;
    },
  });

  const regenerateClaapSummary = async (opts: { force?: boolean } = {}) => {
    if (!claapCtx.recording?.meetingRowId && !claapCtx.recording?.rowId) return;
    setClaapBackfilling(true);
    try {
      await supabase.functions.invoke('claap-backfill-summaries', {
        body: {
          recording_id: claapCtx.recording?.rowId ?? undefined,
          meeting_id: claapCtx.recording?.meetingRowId ?? undefined,
          force: !!opts.force,
        },
      });
    } catch (err) {
      console.warn('claap backfill failed', err);
    } finally {
      setClaapBackfilling(false);
      await Promise.all([claapCtx.refetch(), refetchSyncStatus()]);
    }
  };

  // Manual full reload: refetch transcript from Claap, then regenerate the AI
  // summary/action items/takeaways. Used when a matched recording shows blank.
  const reloadClaapNotes = async () => {
    if (!claapCtx.recording?.rowId && !claapCtx.recording?.id && !claapCtx.recording?.meetingRowId) {
      toast.info('No linked Claap recording to reload.');
      return;
    }
    setClaapBackfilling(true);
    try {
      try {
        await supabase.functions.invoke('claap-sync-recording-content', {
          body: {
            recording_id: claapCtx.recording?.rowId ?? undefined,
            external_id: claapCtx.recording?.id ?? undefined,
          },
        });
      } catch (err) {
        console.warn('claap-sync-recording-content failed', err);
      }
      try {
        await supabase.functions.invoke('claap-backfill-summaries', {
          body: {
            recording_id: claapCtx.recording?.rowId ?? undefined,
            meeting_id: claapCtx.recording?.meetingRowId ?? undefined,
            force: true,
          },
        });
      } catch (err) {
        console.warn('claap-backfill-summaries failed', err);
      }
      await Promise.all([claapCtx.refetch(), refetchSyncStatus()]);
      toast.success('Claap notes reloaded');
    } finally {
      setClaapBackfilling(false);
    }
  };

  // Auto-trigger backfill once per meeting when transcript exists but no AI content yet.
  useEffect(() => {
    if (!claapCtx.recording?.meetingRowId) return;
    if (claapCtx.source !== 'none') return;
    if (claapBackfillTried === claapCtx.recording.meetingRowId) return;
    setClaapBackfillTried(claapCtx.recording.meetingRowId);
    void regenerateClaapSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claapCtx.recording?.meetingRowId, claapCtx.source]);

  const buildClaapNote = (ctx: typeof claapCtx): string => {
    const lines: string[] = [];
    const titleSuffix = eventTitle ? ` — ${eventTitle}` : '';
    lines.push(`🎥 Claap Summary${titleSuffix}`);
    if (ctx.summary) lines.push('', ctx.summary.trim());
    if (ctx.keyTakeaways.length) {
      lines.push('', '💡 Key takeaways');
      ctx.keyTakeaways.forEach((s) => lines.push(`- ${s}`));
    }
    const url = ctx.recording?.url;
    if (url) lines.push('', `[Watch in Claap](${url})`);
    return lines.join('\n');
  };

  useEffect(() => {
    if (noteDirty || noteDraft.trim() || !claapCtx.recording?.linkedNote?.trim()) return;
    const existingNote = claapCtx.recording.linkedNote.trim();
    setNoteDraft(existingNote);
    setNotePrefilledFromClaap(false);
    setNotePrefillRecordingId(claapCtx.recording.id);
  }, [claapCtx.recording?.id, claapCtx.recording?.linkedNote, noteDirty, noteDraft]);

  // Auto-prefill the note when a linked Claap recording has AI content and
  // the user hasn't typed yet. If a different recording later becomes linked,
  // prompt before overwriting an unedited prefill.
  useEffect(() => {
    // Only prefill from a REAL Claap recording — never synthesize.
    if (claapCtx.source !== 'claap') return;
    const hasContent = !!claapCtx.summary || claapCtx.actionItems.length > 0 || claapCtx.keyTakeaways.length > 0;
    if (!hasContent || !claapCtx.recording) return;
    if (noteDirty) return;
    if (notePrefillRecordingId === claapCtx.recording.id) return;
    setNoteDraft(buildClaapNote(claapCtx));
    setNotePrefilledFromClaap(true);
    setNotePrefillSource('claap');
    setNotePrefillRecordingId(claapCtx.recording.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claapCtx.recording?.id, claapCtx.source, claapCtx.summary, claapCtx.actionItems.length, claapCtx.keyTakeaways.length, noteDirty]);

  const claapStillGenerating = claapCtx.source === 'none' && !!claapCtx.recording;
  const [claapLinkerOpen, setClaapLinkerOpen] = useState(false);
  const [scheduleNextOpen, setScheduleNextOpen] = useState(false);
  const [shareNotesOpen, setShareNotesOpen] = useState(false);

  const allEmails = externals.map(a => (a.email || '').trim()).filter(Boolean);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-px pt-1 pb-1 border-b border-white/[0.08]">
        <div className="flex items-start gap-2">
          {onBack && (
            <Button size="icon" variant="ghost" className="h-6 w-7 shrink-0" onClick={onBack} aria-label="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-white truncate">{eventTitle}</h2>
              <Badge variant="outline" className="border-white/15 text-white/75 bg-white/[0.04] text-[10px]">
                {ageDays <= 0 ? 'Today' : ageDays === 1 ? 'Yesterday' : `${ageDays} days ago`}
              </Badge>
              {event.html_link && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6" asChild>
                      <a href={event.html_link} target="_blank" rel="noreferrer" aria-label="Open in Google Calendar">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in Google Calendar</TooltipContent>
                </Tooltip>
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
          <div className="flex items-center gap-0.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-7 text-white/70 hover:text-emerald-300 hover:bg-emerald-500/10"
                  onClick={onDismiss}
                  aria-label="Dismiss"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dismiss</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Two-column body: main content + right action rail */}
      <div className="flex-1 min-h-0 min-w-0 w-full max-w-full flex flex-row">
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-px py-0.5 space-y-0.5">
        {/* Attendees */}
        <section>
          <div className="flex items-center justify-between gap-0.5 mb-0.5 flex-wrap">
            <button
              type="button"
              onClick={() => setAttendeesExpanded((v) => !v)}
              className="flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 hover:text-white min-w-0"
              aria-expanded={attendeesExpanded}
            >
              {attendeesExpanded
                ? <ChevronDown className="h-3 w-3 shrink-0" />
                : <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className="truncate">Attendees ({attendees.length})</span>
            </button>
            <div className="flex items-center gap-0.5 shrink-0">
              {allEmails.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-0.5"
                  onClick={() => {
                    navigator.clipboard.writeText(allEmails.join(', '));
                    toast.success(`Copied ${allEmails.length} email${allEmails.length === 1 ? '' : 's'}`);
                  }}
                  title="Copy all attendee emails"
                >
                  <CopyIcon className="h-3 w-3" /> Copy all
                </Button>
              )}
              {allEmails.length > 0 && (
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-0.5" onClick={() => setComposerForAll(v => !v)}>
                  <Mail className="h-3 w-3" /> Email all
                </Button>
              )}
            </div>
          </div>
          {composerForAll && allEmails.length > 0 && (
            <div className="mb-0.5">
              <InlineComposer
                to={allEmails}
                defaultSubject={`${eventTitle} Follow Up`}
                defaultBody={composerPrefillBody}
                recipientLabel={`${allEmails.length} attendees`}
                onClose={() => { setComposerForAll(false); setComposerPrefillBody(undefined); }}
                onSent={() => onEmailSent(`Sent follow-up to ${allEmails.length} attendees`)}
              />
            </div>
          )}
          {!attendeesExpanded ? (
            <div className="flex items-center flex-wrap gap-0.5">
              {attendees.slice(0, 3).map((a, i) => {
                const key = (a.email || '').trim().toLowerCase();
                const m = contactsByEmail[key];
                const name = m?.fullName || a.display_name || a.email || 'Unknown';
                return (
                  <span
                    key={`${event.id}::compact::${key || i}`}
                    className="inline-flex items-center max-w-[180px] h-6 px-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/85"
                    title={a.email || name}
                  >
                    <span className="truncate">{name}</span>
                  </span>
                );
              })}
              {attendees.length > 3 && (
                <button
                  type="button"
                  onClick={() => setAttendeesExpanded(true)}
                  className="inline-flex items-center h-6 px-2 rounded-full bg-primary/[0.08] border border-primary/30 text-[11px] text-primary hover:bg-primary/[0.14]"
                >
                  +{attendees.length - 3} more
                </button>
              )}
            </div>
          ) : (
          <div className="space-y-0.5">
            {attendees.map((a, i) => {
              const key = (a.email || '').trim().toLowerCase();
              const m = contactsByEmail[key];
              const name = m?.fullName || a.display_name || a.email || 'Unknown';
              const rowKey = `${event.id}::${key || i}`;
              const isComposing = composerForOne === rowKey;
              return (
                <div key={rowKey} className="rounded-md bg-white/[0.02] border border-white/[0.06] px-px py-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-0.5 flex-wrap">
                        <span className="text-xs font-medium text-white truncate">{name}</span>
                        {m?.jobTitle && <span className="text-[10px] text-white/65 truncate">· {m.jobTitle}</span>}
                        {m?.companyName && (
                          <Badge variant="outline" className="h-4 px-px text-[9px] border-white/15 bg-white/[0.04]">
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
                    <div className="mt-1">
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
          )}
        </section>

        {/* Linked Claap recording match strip (portal target) */}
        <div id={`claap-suggest-slot-${event.id}`} className="empty:hidden" />

        {/* Suggested tasks (extracted from Claap action items) */}
        <SuggestedTasksSection
          eventId={event.id}
          meetingRowId={claapCtx.recording?.meetingRowId ?? null}
          recordingRowId={claapCtx.recording?.rowId ?? null}
          source={claapCtx.source}
          fallbackActionItems={claapCtx.actionItems}
          linkedDealId={linkedDealId ?? null}
        />

        {/* Saved notes — selectable narrative */}
        {savedNotes.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
                Notes
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-white/70 hover:text-primary"
                    onClick={() => setShareNotesOpen(true)}
                    aria-label="Share notes via email"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share notes via email</TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-0.5">
              {savedNotes.map((n) => (
                <HighlightCalendarMenu
                  key={n.id}
                  sourceCtx={{
                    module: 'meeting_notes',
                    recordId: `${event.id}:${n.id}`,
                    sourceTimestamp: n.at,
                    dealId: linkedDealId ?? null,
                    label: eventTitle,
                  }}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] px-px py-0.5 text-[12px] leading-relaxed text-white/85 whitespace-pre-wrap select-text"
                >
                  {n.text}
                </HighlightCalendarMenu>
              ))}
            </div>
          </section>
        )}

        {/* Note / Claap summary */}
        <section>
          <div className="space-y-0.5">
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
          </div>

          {/* Add note */}
          <div className="mt-1">
            <div className="flex items-center gap-0.5 mb-0.5">
              <StickyNote className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">Add note</span>
              {savedNotes.length === 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 ml-auto text-white/70 hover:text-primary"
                      onClick={() => setShareNotesOpen(true)}
                      aria-label="Share notes via email"
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Share notes via email</TooltipContent>
                </Tooltip>
              )}
            </div>
            {notePrefilledFromClaap && (
              <div className="flex items-center gap-0.5 mb-0.5">
                <span className="inline-flex items-center gap-0.5 h-5 px-px rounded text-[10px] border border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                  <Sparkles className="h-2.5 w-2.5" /> AI pre-filled — Claap
                </span>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-white underline"
                  onClick={() => {
                    setNoteDraft('');
                    setNotePrefilledFromClaap(false);
                    setNotePrefillSource('local');
                    setNoteDirty(true);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            {!claapTokenPresent && notePrefillSource !== 'claap' && (
              <div className="mb-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-px py-0.5 text-[10px] text-amber-200 flex items-center justify-between gap-0.5">
                <span>Add <code className="font-mono">CLAAP_API_TOKEN</code> secret to fetch real Claap summaries.</span>
                <a
                  href="https://docs.lovable.dev/integrations/supabase#secrets"
                  target="_blank"
                  rel="noreferrer"
                  className="underline whitespace-nowrap"
                >How to add</a>
              </div>
            )}
            {claapStillGenerating && !notePrefilledFromClaap && !transcriptAvailable && !claapCtxFetching && (
              (claapSyncStatus?.sync_attempts ?? 0) > 3 && claapSyncStatus?.last_sync_status !== 'ok' ? (
                <div className="flex items-center gap-0.5 mb-0.5 text-[10px] text-rose-300 italic">
                  <span className="not-italic">
                    Claap recording is linked but its summary couldn't be retrieved
                    {claapSyncStatus?.last_sync_status === 'not_found' ? ' (Claap returned 404)' : ''}
                    {' — '}
                  </span>
                  <button
                    type="button"
                    className="underline hover:text-white not-italic"
                    disabled={claapBackfilling}
                    onClick={() => { void regenerateClaapSummary({ force: true }); }}
                  >
                    {claapBackfilling ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 mb-0.5 text-[10px] text-muted-foreground italic">
                  {claapBackfilling ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Syncing Claap…</span>
                    </>
                  ) : (
                    <span>
                      Claap summary not yet available for this recording — generated after the call ends.
                    </span>
                  )}
                  <button
                    type="button"
                    className="underline hover:text-white not-italic"
                    disabled={claapBackfilling}
                    onClick={() => { void regenerateClaapSummary(); }}
                  >
                    {claapBackfilling ? 'Generating…' : 'Refresh'}
                  </button>
                </div>
              )
            )}
            <HighlightCalendarMenu
              sourceCtx={{
                module: claapCtx.source === 'claap' ? 'claap_summary' : 'meeting_notes',
                recordId: event.id,
                sourceTimestamp: event.start || new Date().toISOString(),
                dealId: linkedDealId ?? null,
                label: eventTitle,
              }}
            >
              <ClaapNoteEditor
                value={noteDraft}
                onChange={(next) => { setNoteDraft(next); setNoteDirty(true); }}
                placeholder={`Note for ${userFirstName}'s records…`}
                defaultRendered={notePrefilledFromClaap}
                recordingUrl={claapCtx.recording?.url ?? null}
              />
            </HighlightCalendarMenu>
            <p className="mt-1 text-[10px] text-muted-foreground/70 italic">
              Action items moved to Suggested tasks above.
            </p>
            <div className="flex justify-end mt-1">
              <Button size="sm" className="h-6 text-[11px]" disabled={!noteDraft.trim()}
                onClick={async () => {
                  const text = noteDraft.trim();
                  onNoteAdded(text);
                  const nowIso = new Date().toISOString();
                  let insertedId = `${Date.now()}`;
                  if (authUser?.id) {
                    const attendeeEmails = (event.attendees || [])
                      .map((a) => a.email).filter(Boolean) as string[];
                    const attendeeNames = (event.attendees || [])
                      .map((a) => a.display_name || a.email || '').filter(Boolean) as string[];
                    const { data, error } = await supabase
                      .from('user_meeting_notes')
                      .insert({
                        user_id: authUser.id,
                        event_id: event.id,
                        event_title: eventTitle,
                        event_start: event.start || null,
                        event_end: event.end || null,
                        organizer_email: organizerEmail,
                        attendee_emails: attendeeEmails,
                        attendee_names: attendeeNames,
                        linked_deal_id: linkedDealId ?? null,
                        note_text: text,
                      })
                      .select('id, created_at')
                      .single();
                    if (error) {
                      console.warn('[EndOfDay] failed to save meeting note', error.message);
                      toast.error('Note added locally — save failed');
                    } else if (data) {
                      insertedId = data.id;
                    }
                  }
                  setSavedNotes((prev) => [
                    ...prev,
                    { id: insertedId, text, at: nowIso },
                  ]);
                  setNoteDraft('');
                  setNoteDirty(false);
                  setNotePrefilledFromClaap(false);
                  setNotePrefillRecordingId(null);
                  toast.success('Note added');
                }}
              >
                Save note
              </Button>
            </div>
          </div>
        </section>

        {/* History */}
        <section>
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-0.5">Activity</h3>
          {activityEntries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No activity yet on this item.</p>
          ) : (
            <ul className="space-y-0.5">
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

        {/* Right action rail */}
        <aside className="w-[180px] shrink-0 border-l border-white/[0.08] px-px py-0.5 overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80 mb-0.5">Action items</h3>
          <div className="flex flex-col gap-0.5 [&>*]:w-full [&>*]:min-w-0">
            <MeetingFollowupInlineAction
              eventId={event.id}
              eventTitle={eventTitle}
              primaryAttendeeName={externals[0]?.display_name || null}
              primaryAttendeeEmail={externals[0]?.email || null}
              onOpenComposer={(prefilled) => {
                setComposerPrefillBody(prefilled);
                setComposerForAll(true);
              }}
            />
            <MeetingCreateFollowUpAction
              eventId={event.id}
              eventTitle={eventTitle}
              eventStartISO={event.start}
              linkedDealId={linkedDealId ?? null}
            />
            <MeetingAddToDealCalendarAction
              eventId={event.id}
              eventTitle={eventTitle}
              eventStartISO={event.start}
              linkedDealId={linkedDealId ?? null}
            />
            <MeetingDealInlineAction
              eventId={event.id}
              eventTitle={eventTitle}
              attendees={(event.attendees || []).map(a => ({
                email: a.email,
                displayName: a.display_name,
                self: a.self,
              }))}
              onLinkedDeal={(d) => onLinkDeal(d)}
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
        </aside>
      </div>

      {/* Sticky footer */}
      <div className="border-t border-white/[0.08] px-px py-0.5 flex items-center gap-0.5">
        <Button size="sm" className="h-6 text-xs gap-0.5 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-500/40" onClick={onResolve}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs gap-0.5" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" /> Dismiss
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-0.5 ml-auto">
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

      <ShareNotesDialog
        open={shareNotesOpen}
        onOpenChange={setShareNotesOpen}
        eventTitle={eventTitle}
        eventStartISO={event.start}
        savedNotes={savedNotes}
        currentDraft={noteDraft}
        claapSummary={claapCtx.summary ?? null}
        claapUrl={claapCtx.recording?.url ?? null}
      />
    </div>
  );
}