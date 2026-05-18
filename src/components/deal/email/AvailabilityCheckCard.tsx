import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  CalendarCheck,
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CircleDashed,
} from 'lucide-react';
import { toast } from 'sonner';
import type { EmailThread } from './mockEmailData';
import { fetchFullEmailMessage } from './useFullEmailMessage';

/**
 * AvailabilityCheckCard
 * ---------------------
 * Lives inside AiAssistSidebar. Detects scheduling proposals in the open
 * thread (any email body, not just the latest snippet), normalizes them to
 * UTC + the user's local timezone, then checks the user's connected Google
 * Calendar (via the same `calendar-events` Nylas function the meeting
 * scheduler uses) for conflicts. Renders one row per proposed slot with a
 * status chip + reason, plus one-click suggested reply bodies that can be
 * pushed into the AI Assist draft module — never auto-sent.
 */

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
}

type SlotStatus = 'available' | 'conflicted' | 'partial' | 'buffer_risk';

interface SlotAvailability {
  slot: ProposedSlot;
  status: SlotStatus;
  reason: string;
  overlapping: BusyEvent[];
  /** Rank score — higher is better. */
  fitScore: number;
}

const BUFFER_MINUTES = 15;
const BROWSER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

function tzFormat(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(
      new Date(iso),
    );
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

function formatSlotDual(slot: ProposedSlot, userTz: string) {
  const day = tzFormat(slot.start_iso, userTz, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const localStart = tzFormat(slot.start_iso, userTz, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const localEnd = tzFormat(slot.end_iso, userTz, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const localTz = tzAbbrev(userTz, slot.start_iso);
  const isSameTz = slot.source_timezone === userTz;
  if (isSameTz) {
    return {
      day,
      primary: `${localStart}–${localEnd} ${localTz}`,
      secondary: null as string | null,
    };
  }
  const srcStart = tzFormat(slot.start_iso, slot.source_timezone, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const srcEnd = tzFormat(slot.end_iso, slot.source_timezone, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const srcTz = tzAbbrev(slot.source_timezone, slot.start_iso);
  return {
    day,
    primary: `${localStart}–${localEnd} ${localTz}`,
    secondary: `${srcStart}–${srcEnd} ${srcTz}`,
  };
}

function classifySlot(slot: ProposedSlot, events: BusyEvent[]): SlotAvailability {
  const startMs = new Date(slot.start_iso).getTime();
  const endMs = new Date(slot.end_iso).getTime();
  const bufferMs = BUFFER_MINUTES * 60_000;

  const overlapping: BusyEvent[] = [];
  let bufferConflict: BusyEvent | null = null;
  let bufferGapMin = Infinity;

  for (const ev of events) {
    if (ev.all_day) continue;
    const evStart = new Date(ev.start).getTime();
    const evEnd = new Date(ev.end).getTime();
    if (Number.isNaN(evStart) || Number.isNaN(evEnd)) continue;
    // Direct overlap
    if (evStart < endMs && evEnd > startMs) {
      overlapping.push(ev);
      continue;
    }
    // Buffer-zone collision (within BUFFER_MINUTES before/after)
    if (evEnd <= startMs && startMs - evEnd < bufferMs) {
      const gap = (startMs - evEnd) / 60_000;
      if (gap < bufferGapMin) {
        bufferGapMin = gap;
        bufferConflict = ev;
      }
    } else if (evStart >= endMs && evStart - endMs < bufferMs) {
      const gap = (evStart - endMs) / 60_000;
      if (gap < bufferGapMin) {
        bufferGapMin = gap;
        bufferConflict = ev;
      }
    }
  }

  if (overlapping.length > 0) {
    // Check if the slot is at least PARTIALLY free (only first or last half
    // overlaps but a free 30-min window remains inside).
    const totalMin = (endMs - startMs) / 60_000;
    const occupiedMin = overlapping.reduce((sum, ev) => {
      const evStart = new Date(ev.start).getTime();
      const evEnd = new Date(ev.end).getTime();
      const overlapStart = Math.max(evStart, startMs);
      const overlapEnd = Math.min(evEnd, endMs);
      return sum + Math.max(0, (overlapEnd - overlapStart) / 60_000);
    }, 0);
    const titles = overlapping
      .map((e) => e.title || 'Busy')
      .slice(0, 2)
      .join(', ');
    if (totalMin - occupiedMin >= 30) {
      return {
        slot,
        status: 'partial',
        reason: `Partial overlap with ${titles}`,
        overlapping,
        fitScore: 50 - occupiedMin,
      };
    }
    return {
      slot,
      status: 'conflicted',
      reason: `Overlaps ${titles}`,
      overlapping,
      fitScore: 0,
    };
  }

  if (bufferConflict) {
    return {
      slot,
      status: 'buffer_risk',
      reason: `${bufferConflict.title || 'A meeting'} ${
        new Date(bufferConflict.end).getTime() <= startMs ? 'ends' : 'starts'
      } ${Math.round(bufferGapMin)} min ${
        new Date(bufferConflict.end).getTime() <= startMs ? 'before' : 'after'
      }`,
      overlapping: [],
      fitScore: 70,
    };
  }

  return {
    slot,
    status: 'available',
    reason: 'Free on your calendar',
    overlapping: [],
    fitScore: 100,
  };
}

const STATUS_META: Record<
  SlotStatus,
  { label: string; chip: string; icon: typeof CheckCircle2 }
> = {
  available: {
    label: 'Available',
    chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: CheckCircle2,
  },
  partial: {
    label: 'Partially available',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    icon: CircleDashed,
  },
  buffer_risk: {
    label: 'Tight turnaround',
    chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    icon: Clock,
  },
  conflicted: {
    label: 'Conflicted',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    icon: XCircle,
  },
};

interface Props {
  thread: EmailThread;
  onInsertDraft: (body: string) => void;
}

export function AvailabilityCheckCard({ thread, onInsertDraft }: Props) {
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [busyEvents, setBusyEvents] = useState<BusyEvent[] | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const lastThreadIdRef = useRef<string | null>(null);

  // Build the full thread text — oldest first — pulling body_text/body_html
  // where already hydrated, snippet otherwise, and lazily fetching the
  // freshest message body if it's not yet loaded.
  const buildThreadText = async (): Promise<string> => {
    const ordered = [...thread.emails].sort(
      (a, b) =>
        new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
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
      // If this is the latest message and we have no real body yet, try to
      // hydrate it from gmail-messages — the user opened the thread to act
      // on the most recent proposal.
      if (
        !m.body_text &&
        !m.body_html &&
        m.id === thread.latestEmail.id &&
        m.id &&
        !m.id.startsWith('mock-')
      ) {
        try {
          const full = await fetchFullEmailMessage(m.id);
          body =
            full.body_text ||
            (full.body_html
              ? full.body_html
                  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
              : body);
        } catch {
          /* ignore hydration failures */
        }
      }
      parts.push(
        `--- From: ${m.from_name} <${m.from_email}> on ${m.received_at} ---\n${body}`,
      );
    }
    return parts.join('\n\n').slice(0, 22000);
  };

  const runAnalysis = async () => {
    setError(null);
    setManualMode(false);
    setLoadingParse(true);
    try {
      const threadText = await buildThreadText();
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'parse-email-scheduling-proposals',
        {
          body: {
            thread_text: threadText,
            subject: thread.subject,
            user_timezone: BROWSER_TZ,
            now_iso: new Date().toISOString(),
          },
        },
      );
      if (invokeErr) throw invokeErr;
      const result = data as ParseResult;
      setParseResult(result);

      if (result.detected && result.slots.length > 0) {
        setLoadingCalendar(true);
        const startMs = Math.min(
          ...result.slots.map((s) => new Date(s.start_iso).getTime()),
        );
        const endMs = Math.max(
          ...result.slots.map((s) => new Date(s.end_iso).getTime()),
        );
        const timeMin = new Date(startMs - 4 * 3600_000).toISOString();
        const timeMax = new Date(endMs + 4 * 3600_000).toISOString();
        try {
          const { data: calData, error: calErr } =
            await supabase.functions.invoke('calendar-events', {
              body: {
                action: 'list',
                time_min: timeMin,
                time_max: timeMax,
                max_results: 200,
                timezone: BROWSER_TZ,
              },
            });
          if (calErr) throw calErr;
          const events: BusyEvent[] = (calData?.events || []).map((e: any) => ({
            start: e.start,
            end: e.end,
            all_day: !!e.all_day,
            title: e.title || e.summary || e.subject || null,
          }));
          setBusyEvents(events);
        } catch (calErr: any) {
          console.warn('[AvailabilityCheck] calendar read failed', calErr);
          setBusyEvents([]); // safe fallback: treat as no known conflicts
          setError(
            'Could not read your calendar. Showing proposed slots without conflict data.',
          );
        } finally {
          setLoadingCalendar(false);
        }
      } else {
        setBusyEvents([]);
      }
    } catch (e: any) {
      console.error('[AvailabilityCheck] parse failed', e);
      setError(e?.message || 'Failed to analyze thread');
      setParseResult(null);
    } finally {
      setLoadingParse(false);
    }
  };

  // Auto-run once per thread open.
  useEffect(() => {
    if (lastThreadIdRef.current === thread.threadId) return;
    lastThreadIdRef.current = thread.threadId;
    setParseResult(null);
    setBusyEvents(null);
    setError(null);
    setManualMode(false);
    void runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId]);

  const availability = useMemo<SlotAvailability[] | null>(() => {
    if (!parseResult || !parseResult.detected || busyEvents == null) return null;
    const out = parseResult.slots.map((s) => classifySlot(s, busyEvents));
    // Rank by fitScore desc — best fits float to top of the list, but we
    // preserve original order in the rendered list and instead annotate the
    // top entry with a "Best fit" badge via the index map below.
    return out;
  }, [parseResult, busyEvents]);

  const bestFitIndex = useMemo(() => {
    if (!availability) return -1;
    let bestIdx = -1;
    let bestScore = -1;
    availability.forEach((a, i) => {
      if (a.fitScore > bestScore) {
        bestScore = a.fitScore;
        bestIdx = i;
      }
    });
    return bestScore > 0 ? bestIdx : -1;
  }, [availability]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loadingParse) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <Header />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  // No scheduling intent found OR user invoked manual mode.
  if (!parseResult || !parseResult.detected) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <Header />
        <p className="mt-2 text-[12px] text-muted-foreground">
          {parseResult?.notes ||
            'No specific times detected in this thread. You can still check your calendar manually.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={runAnalysis}
          >
            <RefreshCw className="h-3 w-3" /> Re-analyze
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('naitive:ai-assist:open-scheduler'),
              );
              toast.info('Opening meeting scheduler');
            }}
          >
            <CalendarCheck className="h-3 w-3" /> Check availability
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-[11px] text-rose-300">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <Header rightSlot={
        <button
          type="button"
          onClick={runAnalysis}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label="Re-analyze"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      } />
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
      <ul className="mt-2 space-y-1.5">
        {(availability ?? parseResult.slots.map((slot) => ({
          slot,
          status: 'available' as SlotStatus,
          reason: 'Checking your calendar…',
          overlapping: [] as BusyEvent[],
          fitScore: 0,
        }))).map((entry, i) => {
          const meta = STATUS_META[entry.status];
          const Icon = meta.icon;
          const fmt = formatSlotDual(entry.slot, parseResult.user_timezone);
          const isBest = bestFitIndex === i;
          return (
            <li
              key={`${entry.slot.start_iso}-${i}`}
              className="rounded-md border border-white/[0.05] bg-card/40 p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                    <span>{fmt.day}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{fmt.primary}</span>
                    {isBest && (
                      <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0 text-[9px] uppercase tracking-wide text-primary">
                        Best fit
                      </span>
                    )}
                  </div>
                  {fmt.secondary && (
                    <div className="text-[10px] text-muted-foreground">
                      Sender: {fmt.secondary}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {entry.reason}
                  </div>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]',
                    meta.chip,
                  )}
                >
                  <Icon className="h-2.5 w-2.5" />
                  {meta.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {parseResult.reply_suggestions.length > 0 && (
        <div className="mt-3 border-t border-white/[0.05] pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Suggested replies
          </div>
          <div className="flex flex-col gap-1.5">
            {parseResult.reply_suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onInsertDraft(s.body);
                  toast.success(
                    'Draft inserted — review before sending',
                  );
                }}
                className="group rounded-md border border-white/[0.06] bg-white/[0.02] p-2 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-[11px] font-medium text-foreground">
                  {s.label}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground group-hover:text-foreground/80">
                  {s.body}
                </div>
                <div className="mt-1 text-[10px] font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  Use this response →
                </div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Drafts are inserted into the reply composer. Nothing is sent until you confirm.
          </p>
        </div>
      )}
    </div>
  );
}

function Header({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" />
        <span className="text-[12px] font-semibold text-foreground">
          Availability Check
        </span>
      </div>
      {rightSlot}
    </div>
  );
}