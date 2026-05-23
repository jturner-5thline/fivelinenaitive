import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CalendarClock, Video, Check, AlertTriangle, X, ChevronDown, ChevronUp, CalendarX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AvailabilityCheckCard } from './AvailabilityCheckCard';
import { InteractiveWeekCalendar } from './InteractiveWeekCalendar';
import type { EmailThread } from './mockEmailData';
import { useRenderMeetingTitle } from '@/hooks/useRenderMeetingTitle';

/**
 * MeetingSchedulerCard
 * --------------------
 * Inline scheduling workspace launched from the "Request a meeting" chip in
 * AiAssistSidebar. Reads the user's connected Google Calendar (via Nylas
 * `calendar-events`), proposes 3 free 45-minute slots over the next 5
 * business days, lets the user pick which ones to offer, choose attendees
 * from the 5th Line team list, and produce an insertable text block.
 *
 * Two-stage flow — never auto-creates a calendar event:
 *   Stage 1 (Propose): user picks slots + parties → "Insert proposal" puts
 *     a paragraph into the composer for the recipient to choose from.
 *   Stage 2 (Confirm): once the recipient replies with their pick, the user
 *     selects ONE slot and clicks "Confirm & create event" — only then do
 *     we hit Nylas `create` with attendees + Google Meet autocreate.
 */

interface Slot {
  start: Date;
  end: Date;
}

interface BusyEvent {
  start: string;
  end: string;
  all_day: boolean;
  /** Event title (when the calendar API returned one). Optional because
   *  Nylas may omit it for privacy-restricted events — those render as
   *  "Busy". */
  title?: string | null;
}

/**
 * One conflict surfaced in the "Why these times?" explanation panel —
 * an existing calendar event that overlapped at least one working-hour
 * candidate slot, with the count of slots it knocked out.
 */
interface BlockingEvent {
  title: string;
  start: Date;
  end: Date;
  blockedSlotCount: number;
}

interface Props {
  /** Recipient email pulled from the latest message — added as attendee. */
  recipientEmail?: string;
  recipientName?: string;
  /** Subject line used for the calendar event title. */
  threadSubject?: string;
  /** Matched deal name, woven into the meeting title when available. */
  dealName?: string;
  /** Deal id — when provided, the stage-driven title template is used for
   *  both the calendar event summary and the meeting-suggestion subject. */
  dealId?: string | null;
  /** Full email thread — when provided, an Availability Check section is
   *  rendered at the top to parse proposed times and cross-reference the
   *  user's calendar. */
  thread?: EmailThread;
  /** Inserts text into the composer body. */
  onInsert: (text: string) => void;
  /** Closes the scheduler back to the chip row. */
  onClose: () => void;
}

/** Default meeting length when no preference is persisted. */
const DEFAULT_SLOT_MINUTES = 45;
/** Selectable durations exposed in the picker. */
const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;
const WORK_START_HOUR = 9;   // 9 AM local
const WORK_END_HOUR = 17;    // 5 PM local

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const TZ_PREF_KEY = 'naitive.meetingScheduler.tz';
const DURATION_PREF_KEY = 'naitive.meetingScheduler.durationMinutes';
/** Persisted parties mode: 'me' or 'me_plus'. */
const PARTIES_MODE_PREF_KEY = 'naitive.meetingScheduler.partiesMode';
/** Persisted teammate profile IDs (JSON-encoded string array). */
const PARTIES_IDS_PREF_KEY = 'naitive.meetingScheduler.extraTeamMemberIds';
/** Persisted slot indices the user last chose to offer (JSON array of ints).
 *  Slot identities change every session (fresh calendar reads), so we
 *  preserve the *positional* preference and intersect with the new slot
 *  count on load — e.g. a user who always picks the first two slots will
 *  open the scheduler with [0, 1] pre-checked even after a refresh. */
const SELECTED_IDX_PREF_KEY = 'naitive.meetingScheduler.selectedSlotIdx';

/**
 * Curated timezone shortlist — covers the common 5th Line counterparties
 * (US East/West, London, Continental EU, India, Singapore, Tokyo, AU)
 * plus the user's detected browser TZ if it isn't already in the list.
 * The full IANA list is huge; this keeps the picker scannable while
 * still allowing arbitrary IANA strings (the saved pref is honored even
 * if it's not one of the presets).
 */
const TZ_PRESETS: { id: string; label: string }[] = [
  { id: 'America/New_York',    label: 'New York (ET)' },
  { id: 'America/Chicago',     label: 'Chicago (CT)' },
  { id: 'America/Denver',      label: 'Denver (MT)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { id: 'America/Toronto',     label: 'Toronto (ET)' },
  { id: 'America/Sao_Paulo',   label: 'São Paulo (BRT)' },
  { id: 'Europe/London',       label: 'London (GMT/BST)' },
  { id: 'Europe/Dublin',       label: 'Dublin (GMT/IST)' },
  { id: 'Europe/Paris',        label: 'Paris (CET)' },
  { id: 'Europe/Berlin',       label: 'Berlin (CET)' },
  { id: 'Europe/Madrid',       label: 'Madrid (CET)' },
  { id: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { id: 'Asia/Kolkata',        label: 'Mumbai (IST)' },
  { id: 'Asia/Singapore',      label: 'Singapore (SGT)' },
  { id: 'Asia/Hong_Kong',      label: 'Hong Kong (HKT)' },
  { id: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { id: 'Australia/Sydney',    label: 'Sydney (AEST)' },
  { id: 'UTC',                 label: 'UTC' },
];

/** Short label for a TZ chip, e.g. "ET", "PT", "BST". Falls back to the
 *  full IANA id if the runtime can't resolve a short name. */
function shortTzLabel(tz: string, ref: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(ref);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart?.value || tz;
  } catch {
    return tz;
  }
}

function fmtSlot(s: Slot, tz: string): string {
  const day = s.start.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  });
  const start = s.start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
  const end = s.end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
  return `${day}, ${start}–${end} (${shortTzLabel(tz, s.start)})`;
}

/**
 * Compact time-only label for a slot in a given zone, e.g. "2:00–2:45 PM (ET)".
 * Used to render the secondary "your local time" line next to each slot
 * without repeating the date.
 */
function fmtSlotTimeOnly(s: Slot, tz: string): string {
  const start = s.start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
  const end = s.end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
  return `${start}–${end} (${shortTzLabel(tz, s.start)})`;
}

/**
 * Build candidate working-hour slots across the next 5 business days,
 * anchored in the user-selected timezone. We compute the wall-clock
 * date/hour in `tz`, then resolve back to a real UTC instant — that way
 * "10:00 in London" lands at the right absolute moment regardless of the
 * browser locale running this code.
 */
function buildCandidateSlots(now: Date, tz: string, durationMinutes: number): Slot[] {
  const slots: Slot[] = [];
  // Get the calendar date "today" as seen in `tz` (so a user in NY at 11pm
  // doesn't accidentally schedule for "tomorrow" in London terms).
  const todayInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  let days = 0;
  let dayOffset = 0;
  while (days < 5 && dayOffset < 14) {
    dayOffset += 1;
    const candidateDay = new Date(todayInTz);
    candidateDay.setDate(candidateDay.getDate() + dayOffset);
    const dow = candidateDay.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    days += 1;
    const y = candidateDay.getFullYear();
    const m = candidateDay.getMonth() + 1;
    const d = candidateDay.getDate();
    // Step the start hour at hourly anchors but ensure the chosen
    // duration still fits inside the working window.
    const durationHours = durationMinutes / 60;
    for (let h = WORK_START_HOUR; h + durationHours <= WORK_END_HOUR; h += 1) {
      const start = zonedDateToUtc(y, m, d, h, 0, tz);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
      slots.push({ start, end });
    }
  }
  return slots;
}

/**
 * Resolve a wall-clock (Y/M/D h:m) inside an IANA timezone to an absolute
 * UTC `Date`. Uses the round-trip trick: format the same instant in both
 * UTC and the target tz, measure the offset, then subtract.
 */
function zonedDateToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Start with the naive UTC instant for those wall-clock numbers.
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  // What does that instant look like in the target tz?
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcGuess);
  const get = (t: string) => Number(tzParts.find((p) => p.type === t)?.value || '0');
  const asTz = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  const offsetMs = asTz - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

/** Filter out slots that overlap any busy event. */
function filterFreeSlots(candidates: Slot[], busy: BusyEvent[]): Slot[] {
  const busyRanges = busy
    .filter((b) => !b.all_day && b.start && b.end)
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
  return candidates.filter((slot) => {
    const s = slot.start.getTime();
    const e = slot.end.getTime();
    return !busyRanges.some((b) => s < b.e && e > b.s);
  });
}

/**
 * Identify which busy events actually blocked candidate slots, with a
 * count of how many slots each one knocked out. Used to power the
 * "Why these times?" explanation panel — gives the user a transparent
 * audit trail of why their availability is what it is.
 *
 * All-day events are excluded (they don't block specific working-hour
 * slots in a useful way) and conflicts are sorted by start time so the
 * panel reads chronologically.
 */
function computeBlockingEvents(
  candidates: Slot[],
  busy: BusyEvent[],
): BlockingEvent[] {
  const out: BlockingEvent[] = [];
  for (const b of busy) {
    if (b.all_day || !b.start || !b.end) continue;
    const bStart = new Date(b.start);
    const bEnd = new Date(b.end);
    const bs = bStart.getTime();
    const be = bEnd.getTime();
    let blocked = 0;
    for (const slot of candidates) {
      const s = slot.start.getTime();
      const e = slot.end.getTime();
      if (s < be && e > bs) blocked += 1;
    }
    if (blocked > 0) {
      out.push({
        title: (b.title || '').trim() || 'Busy',
        start: bStart,
        end: bEnd,
        blockedSlotCount: blocked,
      });
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return out;
}

/** Pick 3 well-spaced free slots — prefer different days when possible. */
function pickThreeSpread(free: Slot[]): Slot[] {
  if (free.length <= 3) return free.slice(0, 3);
  const byDay = new Map<string, Slot[]>();
  for (const slot of free) {
    const k = slot.start.toDateString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(slot);
  }
  const out: Slot[] = [];
  // First pass: one per day, mid-morning preference (closest to 10am).
  for (const dayList of byDay.values()) {
    if (out.length >= 3) break;
    const preferred = dayList.reduce((best, cur) =>
      Math.abs(cur.start.getHours() - 10) < Math.abs(best.start.getHours() - 10) ? cur : best,
    );
    out.push(preferred);
  }
  // Backfill if fewer than 3 days had availability.
  for (const slot of free) {
    if (out.length >= 3) break;
    if (!out.includes(slot)) out.push(slot);
  }
  return out.slice(0, 3);
}

export function MeetingSchedulerCard({
  recipientEmail,
  recipientName,
  threadSubject,
  dealName,
  dealId,
  thread,
  onInsert,
  onClose,
}: Props) {
  const { user } = useAuth();
  const teamMembers = useTeamMembers();
  const { render: renderTitle } = useRenderMeetingTitle(dealId ?? null);

  // ── Timezone preference ───────────────────────────────────────────────
  // Persisted in localStorage so the user's choice sticks across sessions
  // (e.g. a London-based partner manager always wants Europe/London even
  // if their browser temporarily reports a different IANA value).
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return localStorage.getItem(TZ_PREF_KEY) || BROWSER_TZ;
    } catch {
      return BROWSER_TZ;
    }
  });

  // ── Meeting duration preference ──────────────────────────────────────
  // Persisted alongside the timezone so a user who always books 30-min
  // intros doesn't have to reset it on every email.
  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(DURATION_PREF_KEY);
      const parsed = raw ? Number(raw) : NaN;
      return DURATION_OPTIONS.includes(parsed as any) ? parsed : DEFAULT_SLOT_MINUTES;
    } catch {
      return DEFAULT_SLOT_MINUTES;
    }
  });

  const handleDurationChange = useCallback((next: string) => {
    const n = Number(next);
    if (!Number.isFinite(n) || n <= 0) return;
    setDurationMinutes(n);
    try { localStorage.setItem(DURATION_PREF_KEY, String(n)); } catch { /* ignore */ }
  }, []);

  // Build the dropdown options once — include the persisted/browser tz at
  // the top if it isn't part of the curated list.
  const tzOptions = useMemo(() => {
    const ids = new Set(TZ_PRESETS.map((p) => p.id));
    const extras: { id: string; label: string }[] = [];
    if (!ids.has(BROWSER_TZ)) {
      extras.push({ id: BROWSER_TZ, label: `${BROWSER_TZ} (your computer)` });
    }
    if (!ids.has(timezone) && timezone !== BROWSER_TZ) {
      extras.push({ id: timezone, label: timezone });
    }
    return [...extras, ...TZ_PRESETS];
  }, [timezone]);

  const [loadingBusy, setLoadingBusy] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposedSlots, setProposedSlots] = useState<Slot[]>([]);
  // Hydrate the slot-index preference from localStorage; default to the
  // first three positions (matches the previous behaviour). The preference
  // is intersected with the freshly proposed slot count once the calendar
  // load finishes, so we never end up with a stale index out of range.
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(SELECTED_IDX_PREF_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const ints = arr.filter((v) => Number.isInteger(v) && v >= 0);
          if (ints.length > 0) return new Set<number>(ints);
        }
      }
    } catch { /* ignore */ }
    return new Set([0, 1, 2]);
  });

  const [partiesMode, setPartiesMode] = useState<'me' | 'me_plus'>(() => {
    try {
      const raw = localStorage.getItem(PARTIES_MODE_PREF_KEY);
      return raw === 'me_plus' ? 'me_plus' : 'me';
    } catch {
      return 'me';
    }
  });
  // Multi-select: any number of 5th Line teammates can be added as
  // attendees alongside the current user. Stored as a Set of profile IDs
  // so toggling is O(1) and the order matches the team list.
  const [extraTeamMemberIds, setExtraTeamMemberIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(PARTIES_IDS_PREF_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const ids = arr.filter((v): v is string => typeof v === 'string');
          if (ids.length > 0) return new Set<string>(ids);
        }
      }
    } catch { /* ignore */ }
    return new Set();
  });

  const [stage, setStage] = useState<'propose' | 'confirm'>('propose');
  // ── Editable attendee overlay (confirm stage) ──────────────────────────
  // Defaults are derived from recipient + current user + selected teammates.
  // The user can remove any default by adding a key to `removedKeys`, or add
  // custom guests via `customAttendees`. Both reset when re-entering the
  // confirm stage so the list always starts from the current proposal.
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  const [customAttendees, setCustomAttendees] = useState<Array<{ email: string; name?: string }>>([]);
  const [newAttendeeEmail, setNewAttendeeEmail] = useState('');
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  // Calendar events that knocked out one or more candidate working-hour
  // slots — surfaced in the "Why these times?" explanation panel.
  const [blockingEvents, setBlockingEvents] = useState<BlockingEvent[]>([]);
  // Total count of working-hour candidate slots BEFORE busy filtering.
  // Powers the "X of Y working-hour slots are taken" headline.
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [showWhyPanel, setShowWhyPanel] = useState(false);

  // ── Load free/busy from connected Google Calendar (via Nylas) ───────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBusy(true);
      setErrorMsg(null);
      try {
        const now = new Date();
        const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
        const { data, error } = await supabase.functions.invoke('calendar-events', {
          body: {
            action: 'list',
            time_min: now.toISOString(),
            time_max: horizon.toISOString(),
            max_results: 200,
            timezone,
          },
        });
        if (cancelled) return;
        if (error) throw error;
        const events: BusyEvent[] = (data?.events || []).map((e: any) => ({
          start: e.start,
          end: e.end,
          all_day: !!e.all_day,
          // Nylas/Google return the title under different keys depending
          // on provider mapping — fall back through the common ones.
          title: e.title || e.summary || e.subject || null,
        }));
        const candidates = buildCandidateSlots(now, timezone, durationMinutes);
        const free = filterFreeSlots(candidates, events);
        const picked = pickThreeSpread(free);
        // Capture conflict metadata for the explanation panel BEFORE we
        // narrow down to the picked top-3 — we want to explain blockers
        // across the entire working-hour window, not just the offered
        // slots.
        setBlockingEvents(computeBlockingEvents(candidates, events));
        setTotalCandidates(candidates.length);
        setProposedSlots(picked);
        // Reconcile the persisted index preference against the freshly
        // proposed slot count. Drop anything out of range; if nothing
        // valid remains, fall back to "all proposed slots checked".
        setSelectedSlotIdx((prev) => {
          const valid = Array.from(prev).filter((i) => i < picked.length);
          if (valid.length > 0) return new Set(valid);
          return new Set(picked.map((_, i) => i));
        });
      } catch (e: any) {
        console.error('[MeetingScheduler] free/busy load failed', e);
        setErrorMsg(e?.message || 'Could not read calendar. Reconnect your account in Settings.');
      } finally {
        if (!cancelled) setLoadingBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-run whenever the user changes timezone or duration — both shift
    // the wall-clock anchors / slot length, so the proposed list must
    // rebuild to match what the recipient will actually see.
  }, [timezone, durationMinutes]);

  const handleTimezoneChange = useCallback((next: string) => {
    setTimezone(next);
    try { localStorage.setItem(TZ_PREF_KEY, next); } catch { /* ignore */ }
  }, []);

  const toggleSlot = (i: number) => {
    setSelectedSlotIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      try {
        localStorage.setItem(SELECTED_IDX_PREF_KEY, JSON.stringify(Array.from(next)));
      } catch { /* ignore */ }
      return next;
    });
  };

  // Persist parties mode whenever it flips. Kept in an effect (rather
  // than wrapping setPartiesMode) so the RadioGroup's onValueChange stays
  // a plain setter.
  useEffect(() => {
    try { localStorage.setItem(PARTIES_MODE_PREF_KEY, partiesMode); } catch { /* ignore */ }
  }, [partiesMode]);

  // Persist the teammate ID set on every change.
  useEffect(() => {
    try {
      localStorage.setItem(
        PARTIES_IDS_PREF_KEY,
        JSON.stringify(Array.from(extraTeamMemberIds)),
      );
    } catch { /* ignore */ }
  }, [extraTeamMemberIds]);

  const extraMembers: TeamMember[] = useMemo(
    () => teamMembers.filter((m) => extraTeamMemberIds.has(m.id)),
    [teamMembers, extraTeamMemberIds],
  );

  // Default attendees as a stable, key-addressable list. Keys use email
  // (trimmed + case-folded) so removals survive re-renders and dedupe
  // naturally. The same person can be selected from multiple sources
  // (e.g. recipient who is also a teammate, or a custom-added email that
  // matches the current user) — `normEmailKey` is the single source of
  // truth that collapses every variant into one chip.
  type AttendeeRow = {
    key: string;
    email: string;
    name?: string;
    role: 'recipient' | 'me' | 'teammate' | 'custom';
    removable: boolean;
  };
  const normEmailKey = (e: string | null | undefined): string =>
    (e || '').trim().toLowerCase();
  const defaultAttendees: AttendeeRow[] = useMemo(() => {
    const rows: AttendeeRow[] = [];
    if (recipientEmail && normEmailKey(recipientEmail)) {
      rows.push({
        key: normEmailKey(recipientEmail),
        email: recipientEmail.trim(),
        name: recipientName,
        role: 'recipient',
        removable: true,
      });
    }
    if (user?.email && normEmailKey(user.email)) {
      rows.push({
        key: normEmailKey(user.email),
        email: user.email.trim(),
        name: 'You',
        role: 'me',
        // The organiser is implicit on the Nylas event; allow removal too
        // so the user has full control over the visible invite list.
        removable: true,
      });
    }
    if (partiesMode === 'me_plus') {
      for (const m of extraMembers) {
        if (!normEmailKey(m.email)) continue;
        rows.push({
          key: normEmailKey(m.email),
          email: m.email.trim(),
          name: m.display_name,
          role: 'teammate',
          removable: true,
        });
      }
    }
    return rows;
  }, [recipientEmail, recipientName, user?.email, partiesMode, extraMembers]);

  const finalAttendees: AttendeeRow[] = useMemo(() => {
    const seen = new Set<string>();
    const rows: AttendeeRow[] = [];
    // Dedup precedence: defaults preserve the order recipient → you →
    // teammates, then custom rows are appended only if their normalized
    // key hasn't already been used. This guarantees that if a teammate's
    // email matches the recipient (or the user adds a custom email that
    // matches anyone above), the duplicate is dropped silently and the
    // first occurrence — usually the more meaningful role — wins.
    for (const r of defaultAttendees) {
      if (removedKeys.has(r.key) || seen.has(r.key)) continue;
      seen.add(r.key);
      rows.push(r);
    }
    for (const c of customAttendees) {
      const key = normEmailKey(c.email);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, email: c.email.trim(), name: c.name, role: 'custom', removable: true });
    }
    return rows;
  }, [defaultAttendees, removedKeys, customAttendees]);

  // Reset the editable overlay every time the user enters the confirm
  // stage, so the chips reflect the current proposal (changes to teammates
  // or recipient since last visit aren't lost behind stale removals).
  useEffect(() => {
    if (stage === 'confirm') {
      setRemovedKeys(new Set());
      setCustomAttendees([]);
      setNewAttendeeEmail('');
    }
  }, [stage]);

  const removeAttendee = useCallback((key: string) => {
    const norm = normEmailKey(key);
    // Custom rows are dropped from `customAttendees`; defaults are masked
    // via `removedKeys` so re-entering confirm restores them naturally.
    setCustomAttendees((prev) => prev.filter((c) => normEmailKey(c.email) !== norm));
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.add(norm);
      return next;
    });
  }, []);

  const addCustomAttendee = useCallback(() => {
    const raw = newAttendeeEmail.trim();
    if (!raw) return;
    // Minimal RFC-ish guard — the calendar API will reject bad addresses
    // anyway, so we just block obviously-invalid entries here.
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
    if (!ok) {
      toast.error('Enter a valid email address.');
      return;
    }
    const key = normEmailKey(raw);
    // If the email matches a previously-removed default, un-remove it
    // instead of adding a duplicate row.
    if (removedKeys.has(key)) {
      setRemovedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setNewAttendeeEmail('');
      return;
    }
    if (finalAttendees.some((r) => r.key === key)) {
      toast.error('That attendee is already on the list.');
      return;
    }
    setCustomAttendees((prev) => [...prev, { email: raw }]);
    setNewAttendeeEmail('');
  }, [newAttendeeEmail, removedKeys, finalAttendees]);

  const toggleExtraMember = useCallback((id: string) => {
    setExtraTeamMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /**
   * Natural-language subject for the proposal block, e.g.
   *   "I"                                  → just me
   *   "Alex and I"                         → me + 1
   *   "Alex, Jordan and I"                 → me + 2+
   * Falls back to "I" if me_plus is selected but no teammates are checked
   * yet (avoids a dangling "and I").
   */
  const partiesLine = useMemo(() => {
    if (partiesMode !== 'me_plus' || extraMembers.length === 0) return 'I';
    const names = extraMembers.map((m) => m.display_name);
    if (names.length === 1) return `${names[0]} and I`;
    const head = names.slice(0, -1).join(', ');
    const tail = names[names.length - 1];
    return `${head} and ${tail} and I`;
  }, [partiesMode, extraMembers]);

  // ── Stage 1: insert "here are 3 times" proposal text ────────────────────
  const insertProposal = useCallback(() => {
    const chosen = proposedSlots.filter((_, i) => selectedSlotIdx.has(i));
    if (chosen.length === 0) {
      toast.error('Pick at least one slot to offer.');
      return;
    }
    const lines = chosen.map((s) => `• ${fmtSlot(s, timezone)}`).join('\n');
    const block =
      `${partiesLine === 'I' ? 'I have' : `${partiesLine} have`} the following times available:\n` +
      `${lines}\n\n` +
      `Please reply with your preference and I will send a formal invite.`;
    onInsert(block);
    toast.success('Proposed times added to your reply.');
  }, [proposedSlots, selectedSlotIdx, partiesLine, timezone, onInsert]);

  // ── Stage 2: confirm one slot → create the calendar event ──────────────
  const confirmAndCreate = useCallback(async () => {
    if (confirmedIdx === null) {
      toast.error('Select the confirmed time slot first.');
      return;
    }
    const slot = proposedSlots[confirmedIdx];
    if (!slot) return;
    // The user can fully edit the attendee list in the confirm stage, so
    // require at least one attendee on the final list rather than the
    // original recipient.
    if (finalAttendees.length === 0) {
      toast.error('Add at least one attendee before confirming.');
      return;
    }
    setCreating(true);
    try {
      // Use the user-edited attendee list. Skip the organiser's own email
      // since Nylas adds them automatically as the event owner; including
      // them again can cause "duplicate attendee" rejections on some
      // Google Workspace tenants. Final dedup on the normalized key is a
      // defence-in-depth guarantee: even if upstream state ever lets the
      // same email through twice, only one row reaches the calendar API.
      const seenOut = new Set<string>();
      const attendees: { email: string; name?: string }[] = [];
      for (const a of finalAttendees) {
        if (a.role === 'me') continue;
        if (seenOut.has(a.key)) continue;
        seenOut.add(a.key);
        attendees.push({ email: a.email, name: a.name });
      }
      // Stage-driven title (fix #3). Falls back to legacy behaviour when no
      // deal context is available (e.g. composer launched from a stray
      // thread with no matched deal).
      const renderedTitle = dealId ? renderTitle().trim() : '';
      const summary = renderedTitle
        || (dealName ? `${dealName} — Intro call` : threadSubject ? `Re: ${threadSubject}` : 'Intro call');
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'create',
          calendar_id: 'primary',
          // Forwarded to Nylas as start_timezone/end_timezone so the
          // Google Calendar event (and its Meet invite email) renders in
          // the user's preferred zone for every attendee.
          timezone,
          event_data: {
            summary,
            description: dealName ? `Discussion re: ${dealName}` : undefined,
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            attendees,
            add_meet_link: true,
          },
        },
      });
      if (error) throw error;
      const meetLink: string | null = data?.event?.hangout_link || null;
      const lines = [
        `Confirmed for ${fmtSlot(slot, timezone)}.`,
        meetLink ? `Google Meet: ${meetLink}` : null,
        `Calendar invite sent — looking forward to it.`,
      ].filter(Boolean) as string[];
      onInsert(lines.join('\n'));
      toast.success(meetLink ? 'Event created with Meet link.' : 'Event created.');
      onClose();
    } catch (e: any) {
      console.error('[MeetingScheduler] create event failed', e);
      toast.error(e?.message || 'Could not create the event.');
    } finally {
      setCreating(false);
    }
  }, [confirmedIdx, proposedSlots, finalAttendees, dealName, threadSubject, timezone, onInsert, onClose]);

  return (
    <div className="rounded-lg border border-white/10 bg-card/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          Schedule a meeting
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close scheduler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Live, interactive week view of the user's connected Google Calendar
          — replaces the previous static preview so users can actually scroll
          through hours, jump between weeks, and click events for details. */}
      <InteractiveWeekCalendar gridHeight={320} />

      {/* Availability Check — parses proposed times from the open thread,
          cross-references the user's connected calendar, and surfaces
          one-click "Propose this time" replies. Falls back to a "no times
          detected" state when the thread contains no proposals, in which
          case the candidate slots below act as the alternative. */}
      {thread && (
        <AvailabilityCheckCard
          thread={thread}
          onInsertDraft={(body) => onInsert(body)}
        />
      )}

      {/* Timezone selector — controls both slot wall-clock anchoring and
          the timezone written onto the Google Calendar event. Persists to
          localStorage so the choice carries across sessions. */}
      <div className="flex items-center gap-2">
        <Label htmlFor="meeting-tz" className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
          Time zone
        </Label>
        <Select value={timezone} onValueChange={handleTimezoneChange}>
          <SelectTrigger
            id="meeting-tz"
            className="h-7 text-[11px] flex-1 min-w-0"
            aria-label="Time zone for proposed slots and calendar invite"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {tzOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id} className="text-[11.5px]">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Duration selector — drives both the candidate slot length and
          the end time written onto the Google Calendar event. Persisted
          to localStorage. */}
      <div className="flex items-center gap-2">
        <Label htmlFor="meeting-duration" className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
          Duration
        </Label>
        <Select value={String(durationMinutes)} onValueChange={handleDurationChange}>
          <SelectTrigger
            id="meeting-duration"
            className="h-7 text-[11px] flex-1 min-w-0"
            aria-label="Meeting duration for proposed slots and calendar invite"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_OPTIONS.map((mins) => (
              <SelectItem key={mins} value={String(mins)} className="text-[11.5px]">
                {mins < 60
                  ? `${mins} minutes`
                  : mins === 60
                    ? '1 hour'
                    : `${mins / 60} hours`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Slots list */}
      {loadingBusy ? (
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-11/12" />
          <div className="flex items-center gap-1.5 pt-0.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
            <span className="text-[10px] text-muted-foreground/70">
              Reading your calendar…
            </span>
          </div>
        </div>
      ) : errorMsg ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      ) : proposedSlots.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          No open slots in the next 5 business days. Try again later or block off less time.
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
            {stage === 'propose' ? 'Pick which slots to offer' : 'Pick the confirmed slot'}
          </div>
          {proposedSlots.map((slot, i) => {
            const checked = stage === 'propose' ? selectedSlotIdx.has(i) : confirmedIdx === i;
            return (
              <label
                key={i}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-[11.5px]',
                  'border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors',
                  checked && 'border-primary/40 bg-primary/10',
                )}
              >
                {stage === 'propose' ? (
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSlot(i)}
                    className="h-3.5 w-3.5"
                  />
                ) : (
                  <input
                    type="radio"
                    name="confirmed-slot"
                    checked={checked}
                    onChange={() => setConfirmedIdx(i)}
                    className="h-3 w-3 accent-primary"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-foreground/85 truncate">{fmtSlot(slot, timezone)}</div>
                  {/* Secondary line: same instant in the user's browser
                      time zone, so they always see what the slot looks
                      like locally. Hidden when the selected zone IS the
                      browser zone (would be redundant). */}
                  {timezone !== BROWSER_TZ && (
                    <div className="text-[10.5px] text-muted-foreground/80 truncate">
                      Your local time: {fmtSlotTimeOnly(slot, BROWSER_TZ)}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* "Why these times?" — transparency panel listing the calendar
          events that knocked out working-hour candidate slots. Renders
          whenever the calendar load succeeded and at least one event
          blocked something (including the zero-slots case, which is
          when this is most useful). Collapsed by default to keep the
          scheduler compact. */}
      {!loadingBusy && !errorMsg && blockingEvents.length > 0 && (
        <div className="rounded-md border border-white/10 bg-white/[0.03] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowWhyPanel((v) => !v)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.05] transition-colors"
            aria-expanded={showWhyPanel}
          >
            <CalendarX className="h-3 w-3 text-amber-400/80 shrink-0" />
            <span className="text-[11px] font-medium text-foreground/85">
              Why these times?
            </span>
            <span className="text-[10.5px] text-muted-foreground/70 truncate">
              {blockingEvents.length} event{blockingEvents.length === 1 ? '' : 's'} blocking
              {totalCandidates > 0 ? ` ${Math.min(
                blockingEvents.reduce((acc, e) => acc + e.blockedSlotCount, 0),
                totalCandidates,
              )} of ${totalCandidates} slots` : ''}
            </span>
            <span className="ml-auto text-muted-foreground/70 shrink-0">
              {showWhyPanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </button>
          {showWhyPanel && (
            <ul className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
              {blockingEvents.slice(0, 12).map((ev, i) => (
                <li key={i} className="px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-foreground/85 truncate flex-1" title={ev.title}>
                      {ev.title}
                    </span>
                    <span className="text-muted-foreground/70 shrink-0">
                      blocks {ev.blockedSlotCount} slot{ev.blockedSlotCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-muted-foreground/75 mt-0.5 truncate">
                    {fmtSlot({ start: ev.start, end: ev.end }, timezone)}
                    {timezone !== BROWSER_TZ && (
                      <span className="text-muted-foreground/60">
                        {' '}· local: {fmtSlotTimeOnly({ start: ev.start, end: ev.end }, BROWSER_TZ)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
              {blockingEvents.length > 12 && (
                <li className="px-2.5 py-1.5 text-[10.5px] text-muted-foreground/70">
                  +{blockingEvents.length - 12} more event{blockingEvents.length - 12 === 1 ? '' : 's'} not shown
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Parties */}
      {!loadingBusy && !errorMsg && proposedSlots.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70">
            Who's attending from our side
          </div>
          <RadioGroup
            value={partiesMode}
            onValueChange={(v) => setPartiesMode(v as 'me' | 'me_plus')}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="me" id="parties-me" className="h-3.5 w-3.5" />
              <Label htmlFor="parties-me" className="text-[11.5px] font-normal cursor-pointer">
                Just me
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="me_plus" id="parties-plus" className="h-3.5 w-3.5" />
              <Label htmlFor="parties-plus" className="text-[11.5px] font-normal cursor-pointer">
                Me + teammates
              </Label>
            </div>
          </RadioGroup>
          {partiesMode === 'me_plus' && (
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 max-h-40 overflow-y-auto space-y-0.5">
              {teamMembers.filter((m) => m.id !== user?.id).length === 0 ? (
                <div className="px-1.5 py-1 text-[11px] text-muted-foreground">
                  No teammates available.
                </div>
              ) : (
                teamMembers
                  .filter((m) => m.id !== user?.id)
                  .map((m) => {
                    const checked = extraTeamMemberIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          'flex items-center gap-2 rounded-sm px-1.5 py-1 cursor-pointer text-[11.5px]',
                          'hover:bg-white/[0.06] transition-colors',
                          checked && 'bg-primary/10',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleExtraMember(m.id)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-foreground/85 truncate">
                          {m.display_name}
                          {m.email ? (
                            <span className="text-muted-foreground"> · {m.email}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
              )}
              {extraTeamMemberIds.size > 0 && (
                <div className="flex items-center justify-between pt-1 px-1">
                  <span className="text-[10px] text-muted-foreground/70">
                    {extraTeamMemberIds.size} teammate{extraTeamMemberIds.size === 1 ? '' : 's'} selected
                  </span>
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setExtraTeamMemberIds(new Set())}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!loadingBusy && !errorMsg && proposedSlots.length > 0 && (
        <>
        {/* Editable attendee chips — final invite list. The user can
            remove any default (recipient/you/teammate) and add ad-hoc
            guests by email before confirming. Whatever sits here is what
            Nylas receives in `confirmAndCreate`. */}
        {stage === 'confirm' && (
          <div className="rounded-md border border-white/10 bg-card/40 p-2 space-y-1.5">
            <div className="text-[10px] font-medium text-muted-foreground">
              Attendees ({finalAttendees.length})
            </div>
            {finalAttendees.length === 0 ? (
              <div className="text-[11px] text-amber-300/90">
                No attendees — add at least one before confirming.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {finalAttendees.map((a) => (
                  <span
                    key={a.key}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] max-w-full',
                      a.role === 'recipient' && 'border-primary/40 bg-primary/10 text-primary',
                      a.role === 'me' && 'border-white/15 bg-white/5 text-foreground/90',
                      a.role === 'teammate' && 'border-white/15 bg-white/5 text-foreground/90',
                      a.role === 'custom' && 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
                    )}
                    title={a.email}
                  >
                    <span className="truncate max-w-[180px]">
                      {a.name && a.name !== a.email ? `${a.name} · ${a.email}` : a.email}
                    </span>
                    {a.removable && (
                      <button
                        type="button"
                        onClick={() => removeAttendee(a.key)}
                        className="rounded-full p-0.5 hover:bg-white/10"
                        aria-label={`Remove ${a.email}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 pt-0.5">
              <Input
                value={newAttendeeEmail}
                onChange={(e) => setNewAttendeeEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomAttendee();
                  }
                }}
                placeholder="Add attendee email…"
                className="h-6 text-[11px] flex-1"
                type="email"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2"
                onClick={addCustomAttendee}
                disabled={!newAttendeeEmail.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          {stage === 'propose' ? (
            <>
              <Button
                size="sm"
                className="h-7 text-[11px] flex-1"
                onClick={insertProposal}
              >
                Insert proposal
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => {
                  // Pre-select the first slot for confirmation.
                  const firstChecked = proposedSlots.findIndex((_, i) => selectedSlotIdx.has(i));
                  setConfirmedIdx(firstChecked >= 0 ? firstChecked : 0);
                  setStage('confirm');
                }}
              >
                They confirmed →
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="h-7 text-[11px] flex-1 gap-1"
                onClick={confirmAndCreate}
                disabled={creating || confirmedIdx === null}
              >
                {creating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Video className="h-3 w-3" />
                )}
                Confirm & create event
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                onClick={() => setStage('propose')}
                disabled={creating}
              >
                Back
              </Button>
            </>
          )}
        </div>
        </>
      )}
    </div>
  );
}