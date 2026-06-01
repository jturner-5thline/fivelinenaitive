import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  X,
  Plus,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CalendarX,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { EmailThread } from './mockEmailData';
import { buildScheduleNotes } from '@/lib/scheduleMeetingNotes';
import { summarizeThreadTopic } from '@/services/smartEmailTopic';

/**
 * QuickBookMeetingPopover
 * -----------------------
 * Compact "true in-app" booking surface anchored to the Schedule Meeting
 * tile in the email AI Assist toolbar. Goal is to feel like Google
 * Calendar's quick-create: pick a slot in a mini week grid → adjust the
 * pre-filled fields → one click to create the event with a Google Meet
 * link and send invites.
 *
 * Nothing is written to the user's calendar or sent to attendees until
 * "Book meeting" is clicked. Until then every field is editable.
 *
 * For users without a connected calendar this surface short-circuits to
 * a Connect prompt instead of the booking UI.
 */

const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;
const DEFAULT_DURATION = 45;
const DURATION_PREF_KEY = 'naitive.meetingScheduler.durationMinutes';
const TZ_PREF_KEY = 'naitive.meetingScheduler.tz';

const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;
const ROW_MINUTES = 30; // 30-min grid resolution
const ROW_PX = 22;

const BROWSER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
const STATUS_TIMEOUT_MS = 3000;
const BUSY_TIMEOUT_MS = 8000;
const STUCK_LOADING_DEV_MS = 10_000;

type CalendarConn =
  | { kind: 'unknown' }
  | { kind: 'connected'; email?: string | null }
  | { kind: 'missing' }
  | { kind: 'expired'; email?: string | null }
  | { kind: 'alt_provider'; provider?: string | null }
  | { kind: 'error'; message: string; debug?: string };

function snippet(value: unknown, max = 240): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function buildInvokeError(label: string, error: any, data?: any): Error {
  const bodySnippet = data ? ` Body: ${snippet(data)}` : '';
  return new Error(`${label} failed: ${error?.message || 'Unknown error.'}${bodySnippet}`);
}

function timeoutReject(ms: number, label: string, meta?: Record<string, unknown>) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (label === 'freebusy') {
        // eslint-disable-next-line no-console
        console.warn('[scheduler] 8s timeout fired', meta ?? {});
      }
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
}

interface Attendee {
  email: string;
  name?: string;
  role: 'me' | 'recipient' | 'extra';
}

interface BusyBlock {
  start: Date;
  end: Date;
  title: string;
}

interface AiSlot {
  start: Date;
  end: Date;
  kind: 'best' | 'secondary';
}

interface Props {
  thread: EmailThread;
  dealId?: string | null;
  dealName?: string | null;
  /** Pre-fills "Me" attendee with display name when available. */
  meEmail?: string | null;
  meName?: string | null;
  /** Inserts a confirmation line into the reply draft. */
  onInsertDraft: (body: string) => void;
  /** Switches the parent inline panel to the legacy propose-by-email card. */
  onProposeViaEmail: () => void;
  /** Close the popover after success/cancel. */
  onClose: () => void;
}

/* ---------------------------------------------------------------- utils */

function startOfWeekMon(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Mon=1
  out.setDate(out.getDate() + diff);
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(d);
}
function fmtDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(d);
}
function fmtDateInput(d: Date): string {
  // yyyy-mm-dd in local time (we don't need TZ shifting for the input)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function fmtTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
function parseDateTimeInputs(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
}
function emailValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function emailKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Extract distinct participants from the thread to seed the attendee chips. */
function seedAttendees(
  thread: EmailThread,
  me: { email?: string | null; name?: string | null },
): Attendee[] {
  const out: Attendee[] = [];
  const seen = new Set<string>();
  const meKey = me.email ? emailKey(me.email) : null;
  out.push({ email: me.email || 'you@local', name: me.name || 'You', role: 'me' });
  if (meKey) seen.add(meKey);

  const latest = thread.latestEmail;
  if (latest?.from_email && !seen.has(emailKey(latest.from_email))) {
    out.push({
      email: latest.from_email,
      name: latest.from_name || undefined,
      role: 'recipient',
    });
    seen.add(emailKey(latest.from_email));
  }
  // Walk the thread for any other to/cc emails.
  for (const m of thread.emails || []) {
    const candidates: { email?: string | null; name?: string | null }[] = [
      { email: (m as any).from_email, name: (m as any).from_name },
      ...(Array.isArray((m as any).to_emails)
        ? (m as any).to_emails.map((e: string) => ({ email: e }))
        : []),
      ...(Array.isArray((m as any).cc_emails)
        ? (m as any).cc_emails.map((e: string) => ({ email: e }))
        : []),
    ];
    for (const c of candidates) {
      if (!c.email || !emailValid(c.email)) continue;
      const k = emailKey(c.email);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ email: c.email, name: c.name || undefined, role: 'extra' });
    }
  }
  return out;
}

/** Build the initial NOTES block from structured thread + slot context.
 *  Replaces the legacy `seedAgenda` which dumped the raw email body. */
function initialNotes(args: {
  thread: EmailThread;
  dealName?: string | null;
  tz: string;
  topic?: string | null;
}): string {
  const latest = args.thread.latestEmail;
  const receivedAt = latest?.received_at ? new Date(latest.received_at) : null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return buildScheduleNotes({
    dealName: args.dealName ?? null,
    sender: {
      name: latest?.from_name ?? null,
      email: latest?.from_email ?? null,
      receivedAt,
    },
    proposedStart: null,
    proposedEnd: null,
    attendeeTimezones: [args.tz],
    freeBusyVerified: false,
    topic: args.topic ?? null,
    fallbackSubject: args.thread.subject ?? null,
    threadId: args.thread.provider_thread_id || args.thread.threadId,
    origin,
    userTz: args.tz,
  });
}

/** Compute the first 3 free slots after `from` of `durationMin` length,
 *  inside working hours, that don't overlap any busy block. */
function computeAiSlots(
  busy: BusyBlock[],
  durationMin: number,
  from: Date,
): AiSlot[] {
  const slots: AiSlot[] = [];
  const stepMs = ROW_MINUTES * 60_000;
  const dur = durationMin * 60_000;
  let cursor = new Date(from);
  // Snap forward to next 30-min mark inside working hours.
  cursor.setSeconds(0, 0);
  const m = cursor.getMinutes();
  if (m % ROW_MINUTES !== 0) {
    cursor = new Date(cursor.getTime() + (ROW_MINUTES - (m % ROW_MINUTES)) * 60_000);
  }
  const limit = addDays(from, 14);
  let guard = 0;
  while (cursor < limit && slots.length < 3 && guard++ < 2000) {
    const dow = cursor.getDay();
    const hr = cursor.getHours();
    if (dow === 0 || dow === 6 || hr < WORK_START_HOUR || hr >= WORK_END_HOUR) {
      cursor = new Date(cursor.getTime() + stepMs);
      continue;
    }
    const end = new Date(cursor.getTime() + dur);
    if (end.getHours() + end.getMinutes() / 60 > WORK_END_HOUR) {
      // skip rest of day
      cursor.setHours(WORK_START_HOUR, 0, 0, 0);
      cursor = addDays(cursor, 1);
      continue;
    }
    const conflict = busy.some(
      (b) => cursor < b.end && end > b.start,
    );
    if (!conflict) {
      slots.push({
        start: new Date(cursor),
        end,
        kind: slots.length === 0 ? 'best' : 'secondary',
      });
      // jump to end + step so we don't return overlapping suggestions
      cursor = new Date(end.getTime() + stepMs);
      continue;
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }
  return slots;
}

/* ---------------------------------------------------------------- main */

export function QuickBookMeetingPopover({
  thread,
  dealId,
  dealName,
  meEmail,
  meName,
  onInsertDraft,
  onProposeViaEmail,
  onClose,
}: Props) {
  /* ----- calendar connection status */
  const [loadNonce, setLoadNonce] = useState(0);
  const retryScheduler = useCallback(() => setLoadNonce((n) => n + 1), []);
  const [calendarConn, setCalendarConn] = useState<CalendarConn>({ kind: 'unknown' });
  const [statusLoading, setStatusLoading] = useState(true);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [busyDebug, setBusyDebug] = useState<string | null>(null);
  const [debugSimulateTimeout, setDebugSimulateTimeout] = useState(false);
  const lastFetchStartedAtRef = useRef<number | null>(null);
  const lastFetchErrorRef = useRef<string | null>(null);
  const timeoutHandleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!busyLoading) return;
    const startedAt = lastFetchStartedAtRef.current ?? Date.now();
    const handle = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[scheduler] stuck-loading assertion tripped', {
        nonce: loadNonce,
        hasUser: !!meEmail,
        tz: timezone,
        duration: Date.now() - startedAt,
        calendarStatus: calendarConn.kind,
        lastFetchStartedAt: lastFetchStartedAtRef.current,
        lastFetchError: lastFetchErrorRef.current,
        timeoutHandle: timeoutHandleRef.current,
      });
      toast.error('Scheduler stuck >10s — check console');
    }, STUCK_LOADING_DEV_MS);
    return () => clearTimeout(handle);
  }, [busyLoading, loadNonce, meEmail, timezone, calendarConn.kind]);

  useEffect(() => {
    let cancelled = false;
    setStatusLoading(true);
    setBusyLoading(false);
    setBusyError(null);
    setBusyDebug(null);
    setCalendarConn({ kind: 'unknown' });
    lastFetchErrorRef.current = null;
    timeoutHandleRef.current = null;

    (async () => {
      try {
        // eslint-disable-next-line no-console
        console.info('[scheduler] calendar-status request start', { nonce: loadNonce });
        const { data, error } = await Promise.race([
          supabase.functions.invoke('calendar-status', { body: {} }),
          timeoutReject(STATUS_TIMEOUT_MS, 'calendar-status', { nonce: loadNonce }),
        ]) as Awaited<ReturnType<typeof supabase.functions.invoke>>;
        if (cancelled) return;
        if (error) throw buildInvokeError('calendar-status', error, data);
        const statusData = (data ?? {}) as Record<string, any>;
        // eslint-disable-next-line no-console
        console.info('[scheduler] calendar-status response', {
          nonce: loadNonce,
          connected: !!statusData.connected,
          isExpired: !!statusData.is_expired,
          provider: statusData.provider ?? null,
        });
        const provider = String(statusData.provider || '').toLowerCase() || null;
        if (!statusData.connected) {
          if (provider && provider !== 'google') {
            setCalendarConn({ kind: 'alt_provider', provider });
          } else {
            setCalendarConn({ kind: 'missing' });
          }
        } else if (statusData.is_expired) {
          setCalendarConn({ kind: 'expired', email: statusData.email ?? null });
        } else {
          setCalendarConn({ kind: 'connected', email: statusData.email ?? null });
        }
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.message || 'Calendar status check failed.';
        // eslint-disable-next-line no-console
        console.error('[scheduler] calendar-status error', { nonce: loadNonce, message });
        setCalendarConn({
          kind: 'error',
          message: "Couldn't load your calendar availability.",
          debug: message,
        });
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadNonce]);

  // Surface a toast with a Connect CTA the first time we detect a
  // disconnected calendar, so the user notices even if the inline prompt
  // is scrolled out of view.
  const connectToastShownRef = useRef(false);
  useEffect(() => {
    if ((calendarConn.kind === 'missing' || calendarConn.kind === 'expired' || calendarConn.kind === 'alt_provider') && !connectToastShownRef.current) {
      connectToastShownRef.current = true;
      toast('Google Calendar not connected', {
        description: 'Connect your calendar to book meetings from here.',
        action: {
          label: 'Connect Google Calendar',
          onClick: () => window.open('/settings/integrations', '_blank'),
        },
      });
    }
  }, [calendarConn.kind]);

  /* ----- timezone + duration prefs */
  const [timezone] = useState<string>(() => {
    try {
      return localStorage.getItem(TZ_PREF_KEY) || BROWSER_TZ;
    } catch {
      return BROWSER_TZ;
    }
  });
  const [duration, setDurationState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(DURATION_PREF_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      return DURATION_OPTIONS.includes(n as any) ? n : DEFAULT_DURATION;
    } catch {
      return DEFAULT_DURATION;
    }
  });
  const setDuration = useCallback((n: number) => {
    setDurationState(n);
    try {
      localStorage.setItem(DURATION_PREF_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  /* ----- week window */
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMon(new Date()));
  const weekDays = useMemo(
    () => [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i)),
    [weekStart],
  );

  /* ----- busy fetch (current visible week + previous next-1 week buffer) */
  const [busy, setBusy] = useState<BusyBlock[]>([]);
  const busyReqRef = useRef(0);

  useEffect(() => {
    if (calendarConn.kind !== 'connected') return;
    const reqId = ++busyReqRef.current;
    const timeMin = new Date(weekStart);
    const timeMax = addDays(weekStart, 7);
    setBusyLoading(true);
    setBusyError(null);
    setBusyDebug(null);
    lastFetchStartedAtRef.current = Date.now();
    timeoutHandleRef.current = `freebusy:${reqId}`;
    (async () => {
      try {
        // eslint-disable-next-line no-console
        console.info('[scheduler] freebusy request start', {
          nonce: loadNonce,
          reqId,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          debugSimulateTimeout,
        });
        const request = debugSimulateTimeout
          ? new Promise<never>(() => {})
          : supabase.functions.invoke('calendar-events', {
              body: {
                action: 'list',
                calendar_id: 'primary',
                time_min: timeMin.toISOString(),
                time_max: timeMax.toISOString(),
                max_results: 250,
              },
            });
        const { data, error } = await Promise.race([
          request,
          timeoutReject(BUSY_TIMEOUT_MS, 'freebusy', { hasUser: !!meEmail, tz: timezone, nonce: loadNonce }),
        ]) as Awaited<ReturnType<typeof supabase.functions.invoke>>;
        if (busyReqRef.current !== reqId) return;
        if (error) throw buildInvokeError('calendar-events', error, data);
        const eventsData = (data ?? {}) as Record<string, any>;
        const evs = Array.isArray(eventsData.events) ? eventsData.events : [];
        // eslint-disable-next-line no-console
        console.info('[scheduler] freebusy response', {
          nonce: loadNonce,
          reqId,
          eventCount: evs.length,
        });
        setBusy(
          evs
            .filter((e: any) => e?.start && e?.end && !e?.all_day)
            .map((e: any) => ({
              start: new Date(e.start),
              end: new Date(e.end),
              title: e.summary || 'Busy',
            })),
        );
      } catch (e: any) {
        if (busyReqRef.current !== reqId) return;
        const message = e?.message || 'Could not read calendar availability.';
        // eslint-disable-next-line no-console
        console.error('[scheduler] freebusy error', { nonce: loadNonce, reqId, message });
        lastFetchErrorRef.current = message;
        setBusy([]);
        setBusyError("Couldn't load your calendar availability.");
        setBusyDebug(message);
      } finally {
        if (busyReqRef.current === reqId) {
          timeoutHandleRef.current = null;
          setBusyLoading(false);
        }
      }
    })();
  }, [calendarConn.kind, weekStart, loadNonce, debugSimulateTimeout, meEmail, timezone]);

  /* ----- AI-recommended slots */
  const aiSlots = useMemo<AiSlot[]>(() => {
    if (calendarConn.kind !== 'connected') return [];
    const startFrom = new Date();
    // Recompute relative to today, not weekStart, so it stays sensible
    // when the user navigates weeks.
    return computeAiSlots(busy, duration, startFrom);
  }, [busy, duration, calendarConn.kind]);

  /* ----- selected slot + editable invite fields */
  const initialAttendees = useMemo(
    () => seedAttendees(thread, { email: meEmail, name: meName }),
    [thread, meEmail, meName],
  );

  const initialTitle = dealName
    ? `${dealName} — Intro call`
    : thread.subject
      ? `Re: ${thread.subject}`
      : 'Intro call';

  const [title, setTitle] = useState<string>(initialTitle);
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [newAttendee, setNewAttendee] = useState('');
  const [description, setDescription] = useState<string>(() =>
    initialNotes({ thread, dealName, tz: timezone, topic: null }),
  );
  // Track if user has manually edited NOTES so the auto-refresh effects
  // don't clobber their changes.
  const descriptionTouchedRef = useRef(false);
  const setDescriptionUserEdit = useCallback((v: string) => {
    descriptionTouchedRef.current = true;
    setDescription(v);
  }, []);
  // Topic line — async-resolved via smart-email-ai summarize_thread.
  const [aiTopic, setAiTopic] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const topic = await summarizeThreadTopic({ dealId, thread });
      if (!cancelled && topic) setAiTopic(topic);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, thread]);
  const [useMeet, setUseMeet] = useState(true);
  const [customLocation, setCustomLocation] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(
    'none',
  );
  const [reminder, setReminder] = useState<'10' | '15' | '30' | '60'>('15');
  const [visibility, setVisibility] = useState<'default' | 'private' | 'public'>('default');

  // Auto-select best-fit slot when AI suggestions resolve & nothing chosen yet.
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  useEffect(() => {
    if (selectedStart) return;
    const best = aiSlots.find((s) => s.kind === 'best');
    if (best) setSelectedStart(best.start);
  }, [aiSlots, selectedStart]);

  // Mirror selected slot into the date/time fields.
  const selectedEnd = useMemo(
    () => (selectedStart ? new Date(selectedStart.getTime() + duration * 60_000) : null),
    [selectedStart, duration],
  );
  const [dateStr, setDateStr] = useState<string>('');
  const [startStr, setStartStr] = useState<string>('');
  const [endStr, setEndStr] = useState<string>('');
  useEffect(() => {
    if (selectedStart && selectedEnd) {
      setDateStr(fmtDateInput(selectedStart));
      setStartStr(fmtTimeInput(selectedStart));
      setEndStr(fmtTimeInput(selectedEnd));
    }
  }, [selectedStart, selectedEnd]);

  // When user edits date/time inputs manually, lift back into selectedStart.
  const onCommitFields = useCallback(() => {
    const s = parseDateTimeInputs(dateStr, startStr);
    if (s) setSelectedStart(s);
    const e = parseDateTimeInputs(dateStr, endStr);
    if (s && e && e > s) {
      const minutes = Math.round((e.getTime() - s.getTime()) / 60_000);
      if (DURATION_OPTIONS.includes(minutes as any) && minutes !== duration) {
        setDuration(minutes);
      }
    }
  }, [dateStr, startStr, endStr, duration, setDuration]);

  /* ----- conflict detection on currently chosen slot */
  const conflict = useMemo<BusyBlock | null>(() => {
    if (!selectedStart || !selectedEnd) return null;
    return (
      busy.find((b) => selectedStart < b.end && selectedEnd > b.start) || null
    );
  }, [busy, selectedStart, selectedEnd]);

  /* ----- auto-recompose NOTES when slot/topic resolve (unless user edited). */
  useEffect(() => {
    if (descriptionTouchedRef.current) return;
    const latest = thread.latestEmail;
    const receivedAt = latest?.received_at ? new Date(latest.received_at) : null;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const tzs = Array.from(
      new Set(attendees.map(() => timezone)),
    );
    const next = buildScheduleNotes({
      dealName: dealName ?? null,
      sender: {
        name: latest?.from_name ?? null,
        email: latest?.from_email ?? null,
        receivedAt,
      },
      proposedStart: selectedStart,
      proposedEnd: selectedEnd,
      attendeeTimezones: tzs,
      freeBusyVerified: !!selectedStart && !busyLoading && !conflict,
      topic: aiTopic,
      fallbackSubject: thread.subject ?? null,
      threadId: thread.provider_thread_id || thread.threadId,
      origin,
      userTz: timezone,
    });
    setDescription(next);
  }, [
    aiTopic,
    selectedStart,
    selectedEnd,
    conflict,
    busyLoading,
    timezone,
    dealName,
    thread,
    attendees,
  ]);

  /* ----- attendee chip handlers */
  const addAttendee = useCallback(() => {
    const raw = newAttendee.trim();
    if (!raw) return;
    if (!emailValid(raw)) {
      toast.error('Enter a valid email address.');
      return;
    }
    const k = emailKey(raw);
    if (attendees.some((a) => emailKey(a.email) === k)) {
      setNewAttendee('');
      return;
    }
    setAttendees([...attendees, { email: raw, role: 'extra' }]);
    setNewAttendee('');
  }, [newAttendee, attendees]);
  const removeAttendee = useCallback((key: string) => {
    setAttendees((prev) => prev.filter((a) => emailKey(a.email) !== key));
  }, []);

  /* ----- booking action */
  const [booking, setBooking] = useState(false);
  const book = useCallback(async () => {
    if (!selectedStart || !selectedEnd) {
      toast.error('Pick a time slot first.');
      return;
    }
    const externalAttendees = attendees.filter((a) => a.role !== 'me');
    if (externalAttendees.length === 0) {
      toast.error('Add at least one attendee.');
      return;
    }
    setBooking(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'create',
          calendar_id: 'primary',
          timezone,
          event_data: {
            summary: title || 'Meeting',
            description: description || undefined,
            location: useMeet ? undefined : customLocation || undefined,
            start: selectedStart.toISOString(),
            end: selectedEnd.toISOString(),
            attendees: externalAttendees.map((a) => ({
              email: a.email,
              name: a.name,
            })),
            add_meet_link: useMeet,
          },
        },
      });
      if (error) throw error;
      const meetLink: string | null = data?.event?.hangout_link || null;
      const eventId: string | null = data?.event?.id || null;

      const whenText = `${fmtDay(selectedStart, timezone)}, ${fmtTime(
        selectedStart,
        timezone,
      )}–${fmtTime(selectedEnd, timezone)}`;

      toast.success(
        `Meeting booked for ${whenText}. Invite sent to ${externalAttendees.length} attendee${externalAttendees.length > 1 ? 's' : ''}.`,
      );

      // Append a confirmation line to the reply draft.
      const draftLines = [
        `Meeting booked for ${whenText} — invite sent.`,
        meetLink ? `Google Meet: ${meetLink}` : null,
      ].filter(Boolean) as string[];
      onInsertDraft(draftLines.join('\n'));

      // Activity feed: log against the linked deal if any.
      if (dealId) {
        try {
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes?.user?.id;
          if (uid) {
            await supabase.from('deal_audit_log').insert({
              deal_id: dealId,
              user_id: uid,
              action_type: 'meeting_booked',
              entity_type: 'calendar_event',
              entity_id: eventId,
              entity_name: title,
              metadata: {
                start: selectedStart.toISOString(),
                end: selectedEnd.toISOString(),
                timezone,
                meet_link: meetLink,
                attendees: externalAttendees.map((a) => a.email),
                thread_id: thread.threadId,
                subject: thread.subject,
              },
            });
          }
        } catch (logErr) {
          // Non-fatal — surface to console only.
          console.warn('[QuickBook] activity log failed', logErr);
        }
      }

      onClose();
    } catch (e: any) {
      console.error('[QuickBook] booking failed', e);
      toast.error(e?.message || 'Could not create the event.');
    } finally {
      setBooking(false);
    }
  }, [
    selectedStart,
    selectedEnd,
    attendees,
    title,
    description,
    useMeet,
    customLocation,
    timezone,
    dealId,
    thread.threadId,
    thread.subject,
    onInsertDraft,
    onClose,
  ]);

  /* ----- not-connected guard ---------------------------------------- */
  if (statusLoading) {
    return (
      <div className="w-[min(360px,calc(100vw-48px))] max-w-full max-h-[calc(100%-48px)] overflow-y-auto p-4 flex items-center justify-center text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
        Checking calendar…
      </div>
    );
  }
  if (calendarConn.kind !== 'connected') {
    return (
      <div className="w-[min(340px,calc(100vw-48px))] max-w-full max-h-[calc(100%-48px)] overflow-y-auto p-4">
        <Header onClose={onClose} />
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-200">
            <CalendarX className="h-3.5 w-3.5" />
            Calendar not connected
          </div>
          <p className="text-[11.5px] leading-snug text-foreground/75">
            Connect your Google Calendar to book meetings, generate Meet links,
            and send invites directly from this thread.
          </p>
          <Button
            size="sm"
            className="h-7 text-[11.5px] w-full"
            onClick={() => {
              window.open('/settings/integrations', '_blank');
            }}
          >
            <ExternalLink className="h-3 w-3 mr-1.5" />
            Connect calendar
          </Button>
        </div>
        <ProposeFallbackLink onClick={onProposeViaEmail} />
      </div>
    );
  }

  /* ----- main popover body ----------------------------------------- */
  const totalRows = (WORK_END_HOUR - WORK_START_HOUR) * (60 / ROW_MINUTES);

  return (
    <div className="w-full max-w-full max-h-[calc(100%-48px)] overflow-y-auto p-3 space-y-3 text-foreground">
      <Header onClose={onClose} />

      {/* Duration pill row */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">
          Duration
        </span>
        {DURATION_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setDuration(opt)}
            className={cn(
              'h-6 px-2 rounded-md text-[11px] border transition',
              duration === opt
                ? 'border-primary/70 bg-primary/20 text-primary-foreground'
                : 'border-white/10 bg-white/[0.03] text-foreground/70 hover:bg-white/[0.06]',
            )}
          >
            {opt}m
          </button>
        ))}
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="h-6 w-6 rounded-md border border-white/10 bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07]"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          aria-label="Previous week"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-medium">
            {fmtDay(weekStart, timezone)} – {fmtDay(addDays(weekStart, 4), timezone)}
          </span>
          <button
            type="button"
            className="text-[10.5px] px-1.5 h-5 rounded border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-foreground/70"
            onClick={() => setWeekStart(startOfWeekMon(new Date()))}
          >
            Today
          </button>
          {busyLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <button
          type="button"
          className="h-6 w-6 rounded-md border border-white/10 bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07]"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          aria-label="Next week"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Mini week grid */}
      <WeekGrid
        days={weekDays}
        busy={busy}
        aiSlots={aiSlots}
        duration={duration}
        selectedStart={selectedStart}
        onSelectSlot={(d) => setSelectedStart(d)}
        totalRows={totalRows}
      />

      {/* Legend + best-fit shortcut */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/80">
        <LegendSwatch className="bg-emerald-500/40 border-emerald-400/60" label="Best fit" />
        <LegendSwatch className="bg-sky-500/30 border-sky-400/60" label="Suggested" />
        <LegendSwatch className="bg-white/15 border-white/20" label="Busy" />
      </div>

      {/* Conflict warning */}
      {conflict && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
          <AlertTriangle className="h-3 w-3" />
          Conflicts with: <span className="font-medium">{conflict.title}</span>
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
        <FieldRow label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-7 text-[12px]"
          />
        </FieldRow>

        <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-end">
          <FieldRow label="Date">
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              onBlur={onCommitFields}
              className="h-7 text-[12px]"
            />
          </FieldRow>
          <FieldRow label="Start">
            <Input
              type="time"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              onBlur={onCommitFields}
              className="h-7 text-[12px] w-[88px]"
            />
          </FieldRow>
          <FieldRow label="End">
            <Input
              type="time"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              onBlur={onCommitFields}
              className="h-7 text-[12px] w-[88px]"
            />
          </FieldRow>
        </div>

        {/* Attendees chips */}
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Attendees
          </Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {attendees.map((a) => (
              <span
                key={emailKey(a.email)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
                  a.role === 'me'
                    ? 'border-primary/40 bg-primary/15 text-primary-foreground'
                    : 'border-white/15 bg-white/[0.05] text-foreground/85',
                )}
              >
                {a.name || a.email}
                {a.role !== 'me' && (
                  <button
                    type="button"
                    onClick={() => removeAttendee(emailKey(a.email))}
                    className="text-foreground/60 hover:text-foreground"
                    aria-label={`Remove ${a.email}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            ))}
            <div className="inline-flex items-center gap-1">
              <Input
                value={newAttendee}
                onChange={(e) => setNewAttendee(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addAttendee();
                  }
                }}
                placeholder="add email…"
                className="h-6 text-[11px] w-[130px]"
              />
              <button
                type="button"
                onClick={addAttendee}
                className="h-6 w-6 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center"
                aria-label="Add attendee"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
        {attendees.filter((a) => a.role !== 'me').length === 0 && (
          <p className="mt-1 text-[10.5px] text-amber-200/80">
            Add an attendee to send the invite.
          </p>
        )}
        </div>

        {/* Video / location */}
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            Where
          </Label>
          <div className="mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUseMeet(true)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11.5px]',
                useMeet
                  ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/10 bg-white/[0.03] text-foreground/70',
              )}
            >
              <Video className="h-3 w-3" />
              Google Meet
            </button>
            <button
              type="button"
              onClick={() => setUseMeet(false)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 h-7 text-[11.5px]',
                !useMeet
                  ? 'border-primary/40 bg-primary/15 text-primary-foreground'
                  : 'border-white/10 bg-white/[0.03] text-foreground/70',
              )}
            >
              <MapPin className="h-3 w-3" />
              In person / custom
            </button>
            {!useMeet && (
              <Input
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="Location"
                className="h-7 text-[11.5px] flex-1 min-w-0"
              />
            )}
          </div>
        </div>

        {/* Description */}
        <FieldRow label="Notes">
          <Textarea
            value={description}
            onChange={(e) => setDescriptionUserEdit(e.target.value)}
            rows={3}
            className="text-[12px] min-h-[60px] resize-none"
          />
        </FieldRow>

        {/* More options */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {moreOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          More options
        </button>
        {moreOpen && (
          <div className="grid grid-cols-3 gap-2">
            <FieldRow label="Repeat">
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as any)}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Does not repeat</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Reminder">
              <Select value={reminder} onValueChange={(v) => setReminder(v as any)}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Visibility">
              <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11.5px]"
          onClick={onClose}
          disabled={booking}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-[11.5px] px-3"
          onClick={book}
          disabled={booking || !selectedStart}
        >
          {booking ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
          ) : (
            <CalendarClock className="h-3 w-3 mr-1.5" />
          )}
          Book meeting
        </Button>
      </div>

      <ProposeFallbackLink onClick={onProposeViaEmail} />
    </div>
  );
}

/* ---------------------------------------------------------- subcomponents */

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold">
        <CalendarClock className="h-3.5 w-3.5 text-primary" />
        Schedule meeting
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('inline-block h-2 w-3 rounded-sm border', className)} />
      {label}
    </span>
  );
}

function ProposeFallbackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-center text-[11px] text-muted-foreground/80 hover:text-foreground underline-offset-2 hover:underline pt-1"
    >
      Propose via email instead
    </button>
  );
}

/* ---------------------------------------------------------------- grid */

function WeekGrid({
  days,
  busy,
  aiSlots,
  duration,
  selectedStart,
  onSelectSlot,
  totalRows,
}: {
  days: Date[];
  busy: BusyBlock[];
  aiSlots: AiSlot[];
  duration: number;
  selectedStart: Date | null;
  onSelectSlot: (d: Date) => void;
  totalRows: number;
}) {
  const gridHeight = totalRows * ROW_PX;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 overflow-hidden">
      {/* day headers */}
      <div className="grid grid-cols-[40px_repeat(5,1fr)] border-b border-white/10 bg-white/[0.02]">
        <div />
        {days.map((d) => {
          const isToday = sameDay(d, new Date());
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'py-1 text-center text-[10.5px] font-medium border-l border-white/10',
                isToday ? 'text-primary' : 'text-foreground/70',
              )}
            >
              {d.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
              <span className="text-foreground/50">{d.getDate()}</span>
            </div>
          );
        })}
      </div>
      {/* body */}
      <div className="grid grid-cols-[40px_repeat(5,1fr)] relative" style={{ height: gridHeight }}>
        {/* hour gutter */}
        <div className="relative">
          {Array.from({ length: WORK_END_HOUR - WORK_START_HOUR }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 text-[9px] text-muted-foreground/60 pl-1"
              style={{ top: i * 2 * ROW_PX }}
            >
              {((WORK_START_HOUR + i + 11) % 12) + 1}
              {WORK_START_HOUR + i < 12 ? 'a' : 'p'}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day.toISOString()}
            day={day}
            busy={busy}
            aiSlots={aiSlots}
            duration={duration}
            selectedStart={selectedStart}
            onSelectSlot={onSelectSlot}
            totalRows={totalRows}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  busy,
  aiSlots,
  duration,
  selectedStart,
  onSelectSlot,
  totalRows,
}: {
  day: Date;
  busy: BusyBlock[];
  aiSlots: AiSlot[];
  duration: number;
  selectedStart: Date | null;
  onSelectSlot: (d: Date) => void;
  totalRows: number;
}) {
  // Build the per-row clickable cells.
  const cells = useMemo(() => {
    const out: { start: Date; end: Date }[] = [];
    for (let row = 0; row < totalRows; row++) {
      const start = new Date(day);
      start.setHours(WORK_START_HOUR, 0, 0, 0);
      start.setMinutes(row * ROW_MINUTES);
      const end = new Date(start.getTime() + ROW_MINUTES * 60_000);
      out.push({ start, end });
    }
    return out;
  }, [day, totalRows]);

  // Compute busy overlays positioned absolutely.
  const dayStart = new Date(day);
  dayStart.setHours(WORK_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

  const overlays = busy
    .filter((b) => b.end > dayStart && b.start < dayEnd)
    .map((b, i) => {
      const top = Math.max(0, (b.start.getTime() - dayStart.getTime()) / 60_000) * (ROW_PX / ROW_MINUTES);
      const height =
        Math.min(
          (dayEnd.getTime() - dayStart.getTime()) / 60_000,
          (b.end.getTime() - Math.max(b.start.getTime(), dayStart.getTime())) / 60_000,
        ) * (ROW_PX / ROW_MINUTES);
      return { top: Math.max(0, top), height: Math.max(6, height), title: b.title, key: i };
    });

  const aiForDay = aiSlots.filter((s) => sameDay(s.start, day));

  return (
    <div className="relative border-l border-white/10">
      {cells.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelectSlot(c.start)}
          className="absolute left-0 right-0 hover:bg-white/[0.05] border-b border-white/[0.04]"
          style={{ top: i * ROW_PX, height: ROW_PX }}
          aria-label={`Select ${c.start.toLocaleTimeString()}`}
        />
      ))}

      {/* Busy overlays */}
      {overlays.map((o) => (
        <div
          key={o.key}
          title={o.title}
          className="absolute left-0.5 right-0.5 rounded-sm bg-white/15 border border-white/20 text-[9px] text-foreground/70 px-1 overflow-hidden pointer-events-none"
          style={{ top: o.top, height: o.height }}
        >
          <span className="line-clamp-1">{o.title}</span>
        </div>
      ))}

      {/* AI slot highlights */}
      {aiForDay.map((s, i) => {
        const top =
          ((s.start.getTime() - dayStart.getTime()) / 60_000) * (ROW_PX / ROW_MINUTES);
        const height = ((s.end.getTime() - s.start.getTime()) / 60_000) * (ROW_PX / ROW_MINUTES);
        const isBest = s.kind === 'best';
        return (
          <div
            key={`ai-${i}`}
            className={cn(
              'absolute left-0.5 right-0.5 rounded-sm pointer-events-none border',
              isBest
                ? 'bg-emerald-500/25 border-emerald-400/60'
                : 'bg-sky-500/20 border-sky-400/50',
            )}
            style={{ top, height }}
          >
            {isBest && (
              <span className="absolute -top-1 left-0.5 text-[8.5px] font-semibold px-1 rounded bg-emerald-500/80 text-black">
                Best
              </span>
            )}
          </div>
        );
      })}

      {/* Selected slot outline */}
      {selectedStart && sameDay(selectedStart, day) && (
        <SelectedOverlay
          start={selectedStart}
          duration={duration}
          dayStart={dayStart}
        />
      )}
    </div>
  );
}

function SelectedOverlay({
  start,
  duration,
  dayStart,
}: {
  start: Date;
  duration: number;
  dayStart: Date;
}) {
  const top = ((start.getTime() - dayStart.getTime()) / 60_000) * (ROW_PX / ROW_MINUTES);
  const height = duration * (ROW_PX / ROW_MINUTES);
  return (
    <div
      className="absolute left-0 right-0 rounded-sm pointer-events-none border-2 border-primary/80"
      style={{ top: Math.max(0, top), height }}
    />
  );
}