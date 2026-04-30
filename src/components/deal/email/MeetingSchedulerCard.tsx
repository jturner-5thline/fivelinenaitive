import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CalendarClock, Video, Check, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
}

interface Props {
  /** Recipient email pulled from the latest message — added as attendee. */
  recipientEmail?: string;
  recipientName?: string;
  /** Subject line used for the calendar event title. */
  threadSubject?: string;
  /** Matched deal name, woven into the meeting title when available. */
  dealName?: string;
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
  onInsert,
  onClose,
}: Props) {
  const { user } = useAuth();
  const teamMembers = useTeamMembers();

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
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<Set<number>>(new Set([0, 1, 2]));

  const [partiesMode, setPartiesMode] = useState<'me' | 'me_plus'>('me');
  // Multi-select: any number of 5th Line teammates can be added as
  // attendees alongside the current user. Stored as a Set of profile IDs
  // so toggling is O(1) and the order matches the team list.
  const [extraTeamMemberIds, setExtraTeamMemberIds] = useState<Set<string>>(new Set());

  const [stage, setStage] = useState<'propose' | 'confirm'>('propose');
  const [confirmedIdx, setConfirmedIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

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
        }));
        const candidates = buildCandidateSlots(now, timezone);
        const free = filterFreeSlots(candidates, events);
        const picked = pickThreeSpread(free);
        setProposedSlots(picked);
        setSelectedSlotIdx(new Set(picked.map((_, i) => i)));
      } catch (e: any) {
        console.error('[MeetingScheduler] free/busy load failed', e);
        setErrorMsg(e?.message || 'Could not read calendar. Reconnect your account in Settings.');
      } finally {
        if (!cancelled) setLoadingBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-run whenever the user changes timezone — slot wall-clock anchors
    // shift, so the proposed list must rebuild to match what the recipient
    // will actually see in the email.
  }, [timezone]);

  const handleTimezoneChange = useCallback((next: string) => {
    setTimezone(next);
    try { localStorage.setItem(TZ_PREF_KEY, next); } catch { /* ignore */ }
  }, []);

  const toggleSlot = (i: number) => {
    setSelectedSlotIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const extraMembers: TeamMember[] = useMemo(
    () => teamMembers.filter((m) => extraTeamMemberIds.has(m.id)),
    [teamMembers, extraTeamMemberIds],
  );

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
    if (!recipientEmail) {
      toast.error('No recipient email available on this thread.');
      return;
    }
    setCreating(true);
    try {
      const attendees: { email: string; name?: string }[] = [
        { email: recipientEmail, name: recipientName },
      ];
      if (partiesMode === 'me_plus' && extraMembers.length > 0) {
        for (const m of extraMembers) {
          if (m.email) attendees.push({ email: m.email, name: m.display_name });
        }
      }
      const summary = dealName
        ? `${dealName} — Intro call`
        : threadSubject
          ? `Re: ${threadSubject}`
          : 'Intro call';
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
  }, [confirmedIdx, proposedSlots, recipientEmail, recipientName, partiesMode, extraMembers, dealName, threadSubject, timezone, onInsert, onClose]);

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
                <span className="text-foreground/85">{fmtSlot(slot, timezone)}</span>
              </label>
            );
          })}
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
      )}
    </div>
  );
}