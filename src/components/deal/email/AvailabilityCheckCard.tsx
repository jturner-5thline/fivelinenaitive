import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  CalendarCheck,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  Send,
  Star,
  HelpCircle,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import type { EmailThread } from './mockEmailData';
import { fetchFullEmailMessage } from './useFullEmailMessage';
import { logUsage } from '@/lib/usageLogger';
import * as chrono from 'chrono-node';

const PARSE_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ProposedSlot {
  start_iso: string;
  end_iso: string;
  source_timezone: string;
  label: string;
  quote?: string;
}

interface ReplySuggestion {
  label: string;
  body: string;
  slot_index?: number;
}

interface ParseResult {
  detected: boolean;
  sender_timezone: string | null;
  user_timezone: string;
  slots: ProposedSlot[];
  reply_suggestions: ReplySuggestion[];
  notes?: string;
}

interface BusyEvent {
  start: string;
  end: string;
  all_day: boolean;
  title?: string | null;
  htmlLink?: string | null;
  organizer?: boolean;
  recurring?: boolean;
  responseStatus?: 'accepted' | 'tentative' | 'declined' | 'needsAction' | null;
  busyStatus?: 'busy' | 'free' | 'tentative' | 'outOfOffice' | null;
}

type SlotStatus = 'available' | 'partially_available' | 'tight' | 'unavailable';

interface AttendeeStatus {
  name: string;
  email: string;
  status: 'available' | 'conflict' | 'unknown' | 'unverified';
  note: string;
}

interface SlotAnalysis {
  slot: ProposedSlot;
  status: SlotStatus;
  fitScore: number; // 0–100
  scoreBreakdown: {
    conflict: number;
    buffer: number;
    workingHours: number;
    timezone: number;
    history: number;
  };
  overlapping: BusyEvent[];
  bufferConflict: { event: BusyEvent; gapMin: number; side: 'before' | 'after' } | null;
  primaryConflict: BusyEvent | null;
  attendees: AttendeeStatus[];
  sourceLabel: 'verified_free' | 'proposed_by_sender' | 'unknown';
}

// ── Helpers ────────────────────────────────────────────────────────────────
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
const BUFFER_MINUTES = 30;
const WORKING_START_HR = 8;
const WORKING_END_HR = 18;

function tzFormat(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso));
  }
}

function tzAbbrev(tz: string, iso: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}

function getHourInTz(iso: string, tz: string): number {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(iso));
    return parseInt(s, 10);
  } catch {
    return new Date(iso).getHours();
  }
}

function getTzOffsetHours(tz: string, iso: string): number {
  // Crude offset estimate vs UTC
  try {
    const d = new Date(iso);
    const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    return (local.getTime() - utc.getTime()) / 3_600_000;
  } catch {
    return 0;
  }
}

function formatSlotDual(slot: ProposedSlot, userTz: string) {
  const day = tzFormat(slot.start_iso, userTz, { weekday: 'short', month: 'short', day: 'numeric' });
  const localStart = tzFormat(slot.start_iso, userTz, { hour: 'numeric', minute: '2-digit' });
  const localEnd = tzFormat(slot.end_iso, userTz, { hour: 'numeric', minute: '2-digit' });
  const localTz = tzAbbrev(userTz, slot.start_iso);
  const isSameTz = slot.source_timezone === userTz;
  if (isSameTz) {
    return { day, primary: `${localStart}–${localEnd} ${localTz}`, secondary: null as string | null };
  }
  const srcStart = tzFormat(slot.start_iso, slot.source_timezone, { hour: 'numeric', minute: '2-digit' });
  const srcEnd = tzFormat(slot.end_iso, slot.source_timezone, { hour: 'numeric', minute: '2-digit' });
  const srcTz = tzAbbrev(slot.source_timezone, slot.start_iso);
  return {
    day,
    primary: `${localStart}–${localEnd} ${localTz}`,
    secondary: `${srcStart}–${srcEnd} ${srcTz}`,
  };
}

function dayKey(iso: string, tz: string) {
  return tzFormat(iso, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ── chrono-node fallback parser ────────────────────────────────────────────
// Extracts explicit datetime proposals from inbound text when the server
// parser misses them. Normalizes to user timezone; default duration 30min.
function extractSlotsWithChrono(text: string, userTz: string, refDate: Date): ProposedSlot[] {
  if (!text || !text.trim()) return [];
  const results = chrono.parse(text, refDate, { forwardDate: true });
  const slots: ProposedSlot[] = [];
  for (const r of results) {
    const start = r.start?.date();
    if (!start) continue;
    // Skip date-only references with no explicit time component.
    const hasTime = r.start.isCertain('hour') || r.start.isCertain('minute');
    if (!hasTime) continue;
    const end = r.end?.date() || new Date(start.getTime() + 30 * 60_000);
    if (end.getTime() <= start.getTime()) continue;
    slots.push({
      start_iso: start.toISOString(),
      end_iso: end.toISOString(),
      source_timezone: userTz,
      label: r.text,
      quote: r.text,
    });
  }
  // Dedupe by start time
  const seen = new Set<string>();
  return slots.filter((s) => {
    if (seen.has(s.start_iso)) return false;
    seen.add(s.start_iso);
    return true;
  });
}

// Find up to N free 30-min slots adjacent to a proposed slot, within
// working hours (9–17 in userTz), avoiding busy events.
function findAdjacentFreeSlots(
  proposed: ProposedSlot,
  events: BusyEvent[],
  userTz: string,
  count = 3,
): ProposedSlot[] {
  const proposedStart = new Date(proposed.start_iso).getTime();
  const duration = Math.max(30 * 60_000, new Date(proposed.end_iso).getTime() - proposedStart);
  const stepMs = 30 * 60_000;
  const searchRadiusMs = 8 * 3600_000;
  const candidates: number[] = [];
  for (let off = stepMs; off <= searchRadiusMs; off += stepMs) {
    candidates.push(proposedStart - off, proposedStart + off);
  }
  const isFree = (startMs: number) => {
    const endMs = startMs + duration;
    const hr = getHourInTz(new Date(startMs).toISOString(), userTz);
    if (hr < 9 || hr >= 17) return false;
    for (const ev of events) {
      if (ev.all_day) continue;
      const evS = new Date(ev.start).getTime();
      const evE = new Date(ev.end).getTime();
      if (Number.isNaN(evS) || Number.isNaN(evE)) continue;
      if (evS < endMs && evE > startMs) return false;
    }
    return true;
  };
  const out: ProposedSlot[] = [];
  for (const ms of candidates) {
    if (ms < Date.now()) continue;
    if (!isFree(ms)) continue;
    out.push({
      start_iso: new Date(ms).toISOString(),
      end_iso: new Date(ms + duration).toISOString(),
      source_timezone: userTz,
      label: 'Adjacent open slot',
    });
    if (out.length >= count) break;
  }
  return out;
}

// ── Scoring + classification ───────────────────────────────────────────────
function analyzeSlot(
  slot: ProposedSlot,
  events: BusyEvent[],
  userTz: string,
  attendeesFromThread: { name: string; email: string }[],
): SlotAnalysis {
  const startMs = new Date(slot.start_iso).getTime();
  const endMs = new Date(slot.end_iso).getTime();
  const totalMin = Math.max(1, (endMs - startMs) / 60_000);
  const bufferMs = BUFFER_MINUTES * 60_000;

  const overlapping: BusyEvent[] = [];
  let bufferConflict: SlotAnalysis['bufferConflict'] = null;
  let bufferGapMin = Infinity;
  let occupiedMin = 0;

  for (const ev of events) {
    if (ev.all_day) continue;
    const evStart = new Date(ev.start).getTime();
    const evEnd = new Date(ev.end).getTime();
    if (Number.isNaN(evStart) || Number.isNaN(evEnd)) continue;
    if (evStart < endMs && evEnd > startMs) {
      overlapping.push(ev);
      const overlapStart = Math.max(evStart, startMs);
      const overlapEnd = Math.min(evEnd, endMs);
      occupiedMin += Math.max(0, (overlapEnd - overlapStart) / 60_000);
      continue;
    }
    if (evEnd <= startMs && startMs - evEnd < bufferMs) {
      const gap = (startMs - evEnd) / 60_000;
      if (gap < bufferGapMin) {
        bufferGapMin = gap;
        bufferConflict = { event: ev, gapMin: gap, side: 'before' };
      }
    } else if (evStart >= endMs && evStart - endMs < bufferMs) {
      const gap = (evStart - endMs) / 60_000;
      if (gap < bufferGapMin) {
        bufferGapMin = gap;
        bufferConflict = { event: ev, gapMin: gap, side: 'after' };
      }
    }
  }

  const occupiedRatio = Math.min(1, occupiedMin / totalMin);
  const primaryConflict = overlapping.find((e) => e.busyStatus !== 'free' && e.busyStatus !== 'tentative')
    || overlapping[0]
    || null;

  // Sub-scores 0–100
  const conflictScore = Math.round((1 - occupiedRatio) * 100);
  const bufferScore = bufferConflict ? Math.round((Math.min(bufferConflict.gapMin, BUFFER_MINUTES) / BUFFER_MINUTES) * 100) : 100;
  const hr = getHourInTz(slot.start_iso, userTz);
  const workingHoursScore = hr >= WORKING_START_HR && hr < WORKING_END_HR ? 100 : (hr >= 7 && hr < 20 ? 60 : 20);
  const tzGap = Math.abs(getTzOffsetHours(userTz, slot.start_iso) - getTzOffsetHours(slot.source_timezone, slot.start_iso));
  const timezoneScore = tzGap === 0 ? 100 : tzGap <= 3 ? 80 : tzGap <= 6 ? 50 : 20;
  const historyScore = 70; // neutral baseline; no historical accept data wired in

  const composite = Math.round(
    conflictScore * 0.5
      + bufferScore * 0.15
      + workingHoursScore * 0.15
      + timezoneScore * 0.10
      + historyScore * 0.10,
  );

  // 4-tier status
  let status: SlotStatus;
  if (occupiedRatio >= 0.5 && (primaryConflict?.busyStatus ?? 'busy') === 'busy') {
    status = 'unavailable';
  } else if (occupiedRatio > 0) {
    status = 'partially_available';
  } else if ((bufferConflict && bufferConflict.gapMin < BUFFER_MINUTES) || tzGap >= 6) {
    status = 'tight';
  } else {
    status = 'available';
  }

  // Attendees: we can only verify the current user's calendar. Everyone else
  // on the thread is "unverified — proposed by sender".
  const attendees: AttendeeStatus[] = [
    {
      name: 'You',
      email: 'me',
      status: status === 'available' ? 'available' : status === 'unavailable' ? 'conflict' : 'unknown',
      note: status === 'available'
        ? 'Free on your calendar'
        : primaryConflict
          ? `Conflict: ${primaryConflict.title || 'Busy'}`
          : bufferConflict
            ? `Only ${Math.round(bufferConflict.gapMin)} min buffer ${bufferConflict.side} ${bufferConflict.event.title || 'a meeting'}`
            : 'Open with caveats',
    },
    ...attendeesFromThread.slice(0, 4).map((a) => ({
      name: a.name || a.email,
      email: a.email,
      status: 'unverified' as const,
      note: 'No calendar access — proposed by sender (email parse)',
    })),
  ];

  const sourceLabel: SlotAnalysis['sourceLabel'] =
    status === 'available' ? 'verified_free' : 'proposed_by_sender';

  return {
    slot,
    status,
    fitScore: composite,
    scoreBreakdown: {
      conflict: conflictScore,
      buffer: bufferScore,
      workingHours: workingHoursScore,
      timezone: timezoneScore,
      history: historyScore,
    },
    overlapping,
    bufferConflict,
    primaryConflict,
    attendees,
    sourceLabel,
  };
}

// ── Status visual meta ─────────────────────────────────────────────────────
const STATUS_META: Record<SlotStatus, { label: string; chip: string; dot: string; icon: typeof CheckCircle2 }> = {
  available: {
    label: 'Available',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
    icon: CheckCircle2,
  },
  partially_available: {
    label: 'Partial',
    chip: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    dot: 'bg-yellow-400',
    icon: CircleDashed,
  },
  tight: {
    label: 'Tight',
    chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    dot: 'bg-orange-400',
    icon: Clock,
  },
  unavailable: {
    label: 'Unavailable',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
    icon: XCircle,
  },
};

const ATTENDEE_DOT: Record<AttendeeStatus['status'], string> = {
  available: 'bg-emerald-400',
  conflict: 'bg-rose-400',
  unknown: 'bg-yellow-400',
  unverified: 'bg-muted-foreground/40',
};

// ── Mini timeline strip (4-hour window) ────────────────────────────────────
function MiniTimeline({
  slot,
  events,
  bufferConflict,
}: {
  slot: ProposedSlot;
  events: BusyEvent[];
  bufferConflict: SlotAnalysis['bufferConflict'];
}) {
  const slotStart = new Date(slot.start_iso).getTime();
  const slotEnd = new Date(slot.end_iso).getTime();
  const center = (slotStart + slotEnd) / 2;
  const windowMs = 4 * 3600_000;
  const winStart = center - windowMs / 2;
  const winEnd = center + windowMs / 2;
  const pct = (ms: number) => ((ms - winStart) / (winEnd - winStart)) * 100;

  const visibleEvents = events.filter((e) => {
    if (e.all_day) return false;
    const s = new Date(e.start).getTime();
    const en = new Date(e.end).getTime();
    return en > winStart && s < winEnd;
  });

  return (
    <div className="relative mt-2 h-6 w-full overflow-hidden rounded border border-white/[0.06] bg-white/[0.03]">
      {/* hour ticks */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 h-full w-px bg-white/[0.04]"
          style={{ left: `${(i / 4) * 100}%` }}
        />
      ))}
      {/* existing events */}
      {visibleEvents.map((e, i) => {
        const s = Math.max(new Date(e.start).getTime(), winStart);
        const en = Math.min(new Date(e.end).getTime(), winEnd);
        const left = pct(s);
        const width = Math.max(1, pct(en) - left);
        const opacity = e.busyStatus === 'tentative' ? 0.35 : e.busyStatus === 'free' ? 0.2 : 0.6;
        return (
          <div
            key={i}
            title={e.title || 'Busy'}
            className="absolute top-0 h-full rounded-sm bg-rose-500"
            style={{ left: `${left}%`, width: `${width}%`, opacity }}
          />
        );
      })}
      {/* buffer stripe */}
      {bufferConflict && (
        <div
          className="absolute top-0 h-full bg-[repeating-linear-gradient(45deg,_rgba(245,158,11,0.5)_0_4px,_transparent_4px_8px)]"
          style={
            bufferConflict.side === 'before'
              ? { left: `${pct(slotStart - bufferConflict.gapMin * 60_000)}%`, width: `${pct(slotStart) - pct(slotStart - bufferConflict.gapMin * 60_000)}%` }
              : { left: `${pct(slotEnd)}%`, width: `${pct(slotEnd + bufferConflict.gapMin * 60_000) - pct(slotEnd)}%` }
          }
        />
      )}
      {/* proposed slot outline */}
      <div
        className="absolute top-0.5 h-[calc(100%-4px)] rounded-sm border-2 border-sky-400/90"
        style={{ left: `${pct(slotStart)}%`, width: `${pct(slotEnd) - pct(slotStart)}%` }}
      />
    </div>
  );
}

// ── Full-day expand view (6am–8pm) ─────────────────────────────────────────
function FullDayStrip({
  slot,
  events,
  userTz,
}: {
  slot: ProposedSlot;
  events: BusyEvent[];
  userTz: string;
}) {
  const slotDay = dayKey(slot.start_iso, userTz);
  // Build day window 6am–8pm in user TZ
  const dayDate = new Date(slot.start_iso);
  const dayStartLocal = new Date(
    `${tzFormat(slot.start_iso, userTz, { year: 'numeric' })}-${tzFormat(slot.start_iso, userTz, { month: '2-digit' })}-${tzFormat(slot.start_iso, userTz, { day: '2-digit' })}T06:00:00`,
  );
  const winStart = dayStartLocal.getTime();
  const winEnd = winStart + 14 * 3600_000;
  const pct = (ms: number) => ((ms - winStart) / (winEnd - winStart)) * 100;

  const dayEvents = events.filter((e) => {
    if (e.all_day) return false;
    return dayKey(e.start, userTz) === slotDay;
  });

  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-[9px] text-muted-foreground">
        <span>6am</span><span>10am</span><span>2pm</span><span>6pm</span><span>8pm</span>
      </div>
      <div className="relative h-7 w-full overflow-hidden rounded border border-white/[0.06] bg-white/[0.03]">
        {dayEvents.map((e, i) => {
          const s = Math.max(new Date(e.start).getTime(), winStart);
          const en = Math.min(new Date(e.end).getTime(), winEnd);
          if (en <= s) return null;
          return (
            <div
              key={i}
              title={`${e.title || 'Busy'} · ${tzFormat(e.start, userTz, { hour: 'numeric', minute: '2-digit' })}`}
              className="absolute top-0.5 h-[calc(100%-4px)] rounded-sm bg-rose-500/55"
              style={{ left: `${Math.max(0, pct(s))}%`, width: `${Math.min(100, pct(en) - pct(s))}%` }}
            />
          );
        })}
        <div
          className="absolute top-0 h-full rounded-sm border-2 border-sky-400"
          style={{
            left: `${Math.max(0, pct(new Date(slot.start_iso).getTime()))}%`,
            width: `${Math.max(1, pct(new Date(slot.end_iso).getTime()) - pct(new Date(slot.start_iso).getTime()))}%`,
          }}
        />
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Full day · {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ── Source label ───────────────────────────────────────────────────────────
function SourceLabel({ analysis }: { analysis: SlotAnalysis }) {
  if (analysis.sourceLabel === 'verified_free') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/90">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified free (Google Calendar)
      </span>
    );
  }
  if (analysis.sourceLabel === 'proposed_by_sender') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <HelpCircle className="h-2.5 w-2.5" /> Proposed by sender (email)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <HelpCircle className="h-2.5 w-2.5" /> Unknown availability
    </span>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  thread: EmailThread;
  onInsertDraft: (body: string) => void;
  /**
   * When true, the card renders nothing if the parser determines the
   * thread contains no specific proposed times. Used by AiAssistSidebar's
   * auto-surface placement so we don't render a "no times detected"
   * placeholder for every inbound email.
   */
  hideWhenEmpty?: boolean;
}

type FilterKey = 'all' | 'available' | 'partially_available' | 'tight' | 'unavailable';

const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'All',
  available: 'Available',
  partially_available: 'Partial',
  tight: 'Tight',
  unavailable: 'Unavailable',
};

export function AvailabilityCheckCard({ thread, onInsertDraft, hideWhenEmpty = false }: Props) {
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [busyEvents, setBusyEvents] = useState<BusyEvent[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set(['available', 'partially_available']));
  const [rangeDays, setRangeDays] = useState<number>(14);
  const lastThreadIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Extract attendees from thread participants
  const threadAttendees = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; email: string }[] = [];
    for (const m of thread.emails) {
      const email = (m.from_email || '').toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ name: m.from_name || email, email });
    }
    return out;
  }, [thread]);

  const buildThreadText = async (): Promise<string> => {
    const ordered = [...thread.emails].sort(
      (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
    );
    const parts: string[] = [];
    for (const m of ordered) {
      let body =
        m.body_text ||
        (m.body_html
          ? m.body_html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : '') ||
        m.body_preview ||
        m.snippet ||
        '';
      if (!m.body_text && !m.body_html && m.id === thread.latestEmail.id && m.id && !m.id.startsWith('mock-')) {
        try {
          const full = await fetchFullEmailMessage(m.id);
          body = full.body_text || (full.body_html
            ? full.body_html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
            : body);
        } catch { /* ignore */ }
      }
      parts.push(`--- From: ${m.from_name} <${m.from_email}> on ${m.received_at} ---\n${body}`);
    }
    return parts.join('\n\n').slice(0, 22000);
  };

  const runAnalysis = useCallback(async () => {
    setError(null);
    setLoadingParse(true);
    const startedAt = Date.now();
    try {
      const threadText = await buildThreadText();
      const { data, error: invokeErr } = await withTimeout(
        supabase.functions.invoke('parse-email-scheduling-proposals', {
          body: { thread_text: threadText, subject: thread.subject, user_timezone: BROWSER_TZ, now_iso: new Date().toISOString() },
        }),
        PARSE_TIMEOUT_MS,
        'Scheduling parser',
      );
      if (invokeErr) throw invokeErr;
      const result = data as ParseResult;
      if (!result) throw new Error('Empty response from scheduling parser');
      setParseResult(result);

      if (result.detected && result.slots.length > 0) {
        setLoadingCalendar(true);
        const startMs = Math.min(...result.slots.map((s) => new Date(s.start_iso).getTime()));
        const endMs = Math.max(...result.slots.map((s) => new Date(s.end_iso).getTime()));
        // pull a wider window so the full-day expand view has events for the day
        const timeMin = new Date(startMs - 12 * 3600_000).toISOString();
        const timeMax = new Date(endMs + 12 * 3600_000).toISOString();
        try {
          const { data: calData, error: calErr } = await withTimeout(
            supabase.functions.invoke('calendar-events', {
              body: { action: 'list', time_min: timeMin, time_max: timeMax, max_results: 200, timezone: BROWSER_TZ },
            }),
            PARSE_TIMEOUT_MS,
            'Calendar read',
          );
          if (calErr) throw calErr;
          const events: BusyEvent[] = (calData?.events || []).map((e: any) => ({
            start: e.start,
            end: e.end,
            all_day: !!e.all_day,
            title: e.title || e.summary || e.subject || null,
            htmlLink: e.htmlLink || e.html_link || null,
            organizer: !!e.organizer,
            recurring: !!e.recurring || !!e.recurrence,
            responseStatus: e.responseStatus || e.response_status || null,
            busyStatus: e.busyStatus || e.transparency || (e.free_busy === 'free' ? 'free' : 'busy'),
          }));
          setBusyEvents(events);
        } catch (calErr: any) {
          console.warn('[AvailabilityCheck] calendar read failed', calErr);
          setBusyEvents([]);
          setError('Could not read your calendar. Showing proposed slots without conflict data.');
          logUsage({
            feature_type: 'AI_CHAT',
            feature_subtype: 'availability_check_calendar_error',
            metadata: { thread_id: thread.threadId, error: calErr?.message || String(calErr) },
          });
        } finally {
          setLoadingCalendar(false);
        }
      } else {
        setBusyEvents([]);
      }
      logUsage({
        feature_type: 'AI_CHAT',
        feature_subtype: 'availability_check_success',
        duration_ms: Date.now() - startedAt,
        metadata: { thread_id: thread.threadId, detected: !!result?.detected, slot_count: result?.slots?.length ?? 0 },
      });
    } catch (e: any) {
      console.error('[AvailabilityCheck] parse failed', e);
      setError(e?.message || 'Failed to analyze thread');
      setParseResult(null);
      logUsage({
        feature_type: 'AI_CHAT',
        feature_subtype: 'availability_check_error',
        duration_ms: Date.now() - startedAt,
        metadata: { thread_id: thread.threadId, error: e?.message || String(e) },
      });
    } finally {
      setLoadingParse(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId]);

  useEffect(() => {
    if (lastThreadIdRef.current === thread.threadId) return;
    lastThreadIdRef.current = thread.threadId;
    setParseResult(null);
    setBusyEvents(null);
    setError(null);
    setExpandedIdx(null);
    setFocusedIdx(0);
    void runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId]);

  // Build analyses + ranked order
  const userTz = parseResult?.user_timezone || BROWSER_TZ;
  const ranked = useMemo<{ analysis: SlotAnalysis; originalIndex: number }[] | null>(() => {
    if (!parseResult || !parseResult.detected || busyEvents == null) return null;
    const analyses = parseResult.slots.map((s, i) => ({
      analysis: analyzeSlot(s, busyEvents, userTz, threadAttendees),
      originalIndex: i,
    }));
    // Range filter
    const nowMs = Date.now();
    const horizonMs = nowMs + rangeDays * 86_400_000;
    const inRange = analyses.filter((a) => {
      const s = new Date(a.analysis.slot.start_iso).getTime();
      return s >= nowMs - 3600_000 && s <= horizonMs;
    });
    const final = inRange.length > 0 ? inRange : analyses;
    return [...final].sort((a, b) => b.analysis.fitScore - a.analysis.fitScore);
  }, [parseResult, busyEvents, userTz, threadAttendees, rangeDays]);

  const visible = useMemo(() => {
    if (!ranked) return null;
    // Only surface clean, user-friendly options. Internal "tight" / "unavailable"
    // (conflict) buckets are hidden from the scheduling UI entirely.
    return ranked.filter(
      (r) => r.analysis.status === 'available' || r.analysis.status === 'partially_available',
    );
  }, [ranked]);

  // Keyboard nav
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !visible || visible.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'j') {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(visible.length - 1, i + 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setExpandedIdx(focusedIdx);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setExpandedIdx(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const slot = visible[focusedIdx]?.analysis.slot;
        if (slot && parseResult) {
          const suggestion = parseResult.reply_suggestions[0];
          if (suggestion) {
            onInsertDraft(suggestion.body);
            toast.success('Draft inserted — review before sending');
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, focusedIdx, onInsertDraft, parseResult]);

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (key === 'all') {
        return new Set<FilterKey>(['all']);
      }
      next.delete('all');
      if (next.has(key)) next.delete(key); else next.add(key);
      if (next.size === 0) next.add('all');
      return next;
    });
  };

  const proposeShift = (idx: number) => {
    const entry = visible?.[idx];
    if (!entry || !parseResult) return;
    const orig = entry.analysis.slot;
    const shifted: ProposedSlot = {
      ...orig,
      start_iso: new Date(new Date(orig.start_iso).getTime() + 3600_000).toISOString(),
      end_iso: new Date(new Date(orig.end_iso).getTime() + 3600_000).toISOString(),
      label: `${orig.label} (+1h)`,
    };
    const fmt = formatSlotDual(shifted, userTz);
    const body = `Would ${fmt.day} at ${fmt.primary} work instead?`;
    onInsertDraft(body);
    toast.success('Counter-proposal drafted');
  };

  const proposeAnyway = (idx: number) => {
    const entry = visible?.[idx];
    if (!entry) return;
    const fmt = formatSlotDual(entry.analysis.slot, userTz);
    const body = `Let's plan on ${fmt.day} at ${fmt.primary}. I'll make it work.`;
    onInsertDraft(body);
    toast.success('Draft inserted');
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loadingParse) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <Header />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (error && !parseResult) {
    if (hideWhenEmpty) return null;
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
        <Header />
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
        <div className="mt-2">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={runAnalysis}>
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!parseResult || !parseResult.detected) {
    if (hideWhenEmpty) return null;
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <Header />
        <p className="mt-2 text-[12px] text-muted-foreground">
          {parseResult?.notes || 'No specific times detected in this thread. You can still check your calendar manually.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={runAnalysis}>
            <RefreshCw className="h-3 w-3" /> Re-analyze
          </Button>
        </div>
        {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      </div>
    );
  }

  const topScore = ranked && ranked.length > 0 ? ranked[0].analysis.fitScore : -1;

  return (
    <div ref={containerRef} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3" tabIndex={-1}>
      <Header
        rightSlot={
          <button
            type="button"
            onClick={runAnalysis}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label="Re-analyze"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        }
      />

      {/* Toolbar */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Sort:</span>
        <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-foreground">
          Best fit <ChevronDown className="h-2.5 w-2.5" />
        </span>
        <span className="mx-1 h-3 w-px bg-white/[0.08]" />
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(parseInt(e.target.value, 10))}
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-foreground focus:outline-none"
        >
          <option value={7}>Next 7 days</option>
          <option value={14}>Next 2 weeks</option>
          <option value={30}>Next 30 days</option>
          <option value={90}>Next 90 days</option>
        </select>
      </div>

      {loadingCalendar && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Reading your calendar…
        </div>
      )}
      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Slot list */}
      <ul className="mt-2 space-y-1.5">
        {(visible ?? []).length === 0 && (
          <li className="rounded-md border border-dashed border-white/[0.08] p-3 text-[11px] text-muted-foreground">
            No slots match the current filters.
          </li>
        )}
        {(visible ?? []).map((entry, i) => {
          const a = entry.analysis;
          const meta = STATUS_META[a.status];
          const fmt = formatSlotDual(a.slot, userTz);
          const isBest = a.fitScore === topScore && i === 0;
          const isExpanded = expandedIdx === i;
          const isFocused = focusedIdx === i;
          return (
            <li
              key={`${a.slot.start_iso}-${entry.originalIndex}`}
              className={cn(
                'rounded-md border bg-card/40 p-2 transition',
                isFocused ? 'border-primary/40 ring-1 ring-primary/20' : 'border-white/[0.05]',
              )}
              onMouseEnter={() => setFocusedIdx(i)}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                  aria-expanded={isExpanded}
                >
                  {isExpanded
                    ? <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-foreground">
                      <span>{fmt.day}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{fmt.primary}</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Score {a.fitScore}
                      </span>
                      {isBest && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          <Star className="h-2.5 w-2.5 fill-amber-300" /> Best fit
                        </span>
                      )}
                    </div>
                    {fmt.secondary && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">Sender: {fmt.secondary}</div>
                    )}
                  </div>
                </button>
              </div>

              {/* Mini timeline */}
              <MiniTimeline slot={a.slot} events={busyEvents || []} bufferConflict={a.bufferConflict} />

              {/* Attendee row */}
              <div className="mt-1.5 flex items-center gap-1">
                {a.attendees.map((att, ai) => (
                  <span
                    key={ai}
                    title={`${att.name} — ${att.note}`}
                    className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', ATTENDEE_DOT[att.status])} />
                    <span className="max-w-[80px] truncate">{att.name}</span>
                  </span>
                ))}
              </div>

              {/* Source label + inline actions */}
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
                <SourceLabel analysis={a} />
                <div className="flex flex-wrap gap-1">
                  {a.primaryConflict?.htmlLink && (
                    <a
                      href={a.primaryConflict.htmlLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-2.5 w-2.5" /> View in calendar
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => proposeShift(i)}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.02] px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <ArrowRight className="h-2.5 w-2.5" /> Propose +1hr
                  </button>
                  <button
                    type="button"
                    onClick={() => proposeAnyway(i)}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 text-[10px] text-primary hover:bg-primary/15"
                  >
                    <Send className="h-2.5 w-2.5" /> Propose anyway
                  </button>
                </div>
              </div>

              {/* Expanded full-day view */}
              {isExpanded && (
                <FullDayStrip slot={a.slot} events={busyEvents || []} userTz={userTz} />
              )}
            </li>
          );
        })}
      </ul>

      {parseResult.reply_suggestions.length > 0 && (
        <div className="mt-3 border-t border-white/[0.05] pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Suggested replies</div>
          <div className="flex flex-col gap-1.5">
            {parseResult.reply_suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onInsertDraft(s.body);
                  toast.success('Draft inserted — review before sending');
                }}
                className="group rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-[11px] font-medium text-foreground">{s.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground group-hover:text-foreground/80">{s.body}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Drafts insert into the reply composer. Nothing is sent until you confirm. Keyboard: Enter accept · →/← expand · J/K navigate.
          </p>
        </div>
      )}
    </div>
  );
}

function Header({ rightSlot }: { rightSlot?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12px] font-semibold text-foreground">Availability Check</span>
      </div>
      {rightSlot}
    </div>
  );
}
