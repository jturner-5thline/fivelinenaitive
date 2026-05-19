import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CalendarClock, Loader2, AlertTriangle, Check, CalendarX, X } from 'lucide-react';
import { toast } from 'sonner';
import type { OpenAvailabilityRequest, OpenAvailabilityScope, OpenAvailabilityFormality } from './scheduleIntent';

/**
 * OpenAvailabilityCard
 * --------------------
 * Auto-surfaces in the AI Assist sidebar when an inbound email asks about
 * availability in *open-ended* terms (Scenario 3) — e.g. "are you free
 * this week?", "let me know what works". Distinct from
 * AvailabilityCheckCard (Scenario 2) which handles specific time
 * proposals.
 *
 * Flow:
 *   1. Show prompt: "They're asking about your availability — want me
 *      to pull open times?" with a Generate Times button.
 *   2. On click: read James's Google Calendar over a scope-derived
 *      horizon (today / tomorrow / 3 / 5 business days).
 *   3. Compute 30-min+ free windows during 8am–6pm ET.
 *   4. Return up to 6 candidate slot chips; user picks 2-3.
 *   5. Generate a natural-language reply paragraph (tone matched to
 *      sender formality) and insert into the composer.
 *   6. Never creates calendar events — that happens only after the
 *      recipient confirms.
 */

const ET_TZ = 'America/New_York';
const WORK_START_HOUR = 8; // 8am ET
const WORK_END_HOUR = 18; // 6pm ET
const MIN_SLOT_MIN = 30;
const MAX_CHIPS = 6;

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
  request: OpenAvailabilityRequest;
  onInsertDraft: (body: string) => void;
  onDismiss: () => void;
}

function scopeToBusinessDays(scope: OpenAvailabilityScope): number {
  switch (scope) {
    case 'today':
    case 'tomorrow':
      return 1;
    case 'this_week':
      return 3;
    case 'soon':
      return 5;
    case 'default':
    default:
      return 3;
  }
}

function scopeLabel(scope: OpenAvailabilityScope): string {
  switch (scope) {
    case 'today': return 'later today';
    case 'tomorrow': return 'tomorrow';
    case 'this_week': return 'this week';
    case 'soon': return 'over the next few business days';
    default: return 'this week';
  }
}

/** Build wall-clock anchored slots inside the work window in ET. */
function zonedDateToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const utcGuess = new Date(Date.UTC(y, m - 1, d, h, min, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(utcGuess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || '0');
  const asTz = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return new Date(utcGuess.getTime() - (asTz - utcGuess.getTime()));
}

/**
 * Walk forward business days from "today in ET" and emit half-hour
 * windows during working hours. For `today` / `tomorrow` scope we only
 * emit that single day. We anchor on 30-min boundaries.
 */
function buildCandidateWindows(scope: OpenAvailabilityScope, businessDays: number): Slot[] {
  const slots: Slot[] = [];
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: ET_TZ }));
  const startOffset = scope === 'tomorrow' ? 1 : 0;
  let emitted = 0;
  let dayOffset = startOffset;
  // Allow skipping weekends; bail after a sane number of calendar days.
  while (emitted < businessDays && dayOffset < startOffset + 14) {
    const day = new Date(nowInTz);
    day.setDate(day.getDate() + dayOffset);
    dayOffset += 1;
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    emitted += 1;
    const y = day.getFullYear();
    const m = day.getMonth() + 1;
    const d = day.getDate();
    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h += 1) {
      for (const min of [0, 30]) {
        const start = zonedDateToUtc(y, m, d, h, min, ET_TZ);
        const end = new Date(start.getTime() + MIN_SLOT_MIN * 60_000);
        // For "today" / "this afternoon", drop any window that's already
        // started.
        if (scope === 'today' && start.getTime() <= Date.now()) continue;
        slots.push({ start, end });
      }
    }
  }
  return slots;
}

/** Merge contiguous free 30-min windows into longer free blocks. */
function mergeFree(windows: Slot[], busy: BusyEvent[]): Slot[] {
  const busyRanges = busy
    .filter((b) => !b.all_day && b.start && b.end)
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
  const free: Slot[] = [];
  for (const w of windows) {
    const s = w.start.getTime();
    const e = w.end.getTime();
    const conflict = busyRanges.some((b) => s < b.e && e > b.s);
    if (!conflict) free.push(w);
  }
  // Merge adjacent.
  const merged: Slot[] = [];
  for (const f of free) {
    const last = merged[merged.length - 1];
    if (last && last.end.getTime() === f.start.getTime()) {
      last.end = f.end;
    } else {
      merged.push({ start: f.start, end: f.end });
    }
  }
  // Filter to >= 30 min (already guaranteed) and cap each block to 60 min so
  // chips are meaningful single slot offers, not multi-hour windows.
  const trimmed: Slot[] = [];
  for (const b of merged) {
    const lenMs = b.end.getTime() - b.start.getTime();
    if (lenMs < MIN_SLOT_MIN * 60_000) continue;
    trimmed.push({ start: b.start, end: new Date(b.start.getTime() + Math.min(lenMs, 30 * 60_000)) });
  }
  return trimmed;
}

/** Pick a spread of up to MAX_CHIPS, prefer different days + mid-morning. */
function pickSpread(free: Slot[], max: number): Slot[] {
  if (free.length <= max) return free.slice(0, max);
  const byDay = new Map<string, Slot[]>();
  for (const s of free) {
    const k = s.start.toLocaleDateString('en-US', { timeZone: ET_TZ });
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  const out: Slot[] = [];
  // Pass 1: one per day (preferring ~10am).
  for (const dayList of byDay.values()) {
    if (out.length >= max) break;
    const pref = dayList.reduce((best, cur) => {
      const hb = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ET_TZ, hour: '2-digit', hour12: false }).format(best.start));
      const hc = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ET_TZ, hour: '2-digit', hour12: false }).format(cur.start));
      return Math.abs(hc - 10) < Math.abs(hb - 10) ? cur : best;
    });
    out.push(pref);
  }
  // Pass 2: fill remaining capacity, prefer afternoons (~14h) on already-used days.
  for (const dayList of byDay.values()) {
    if (out.length >= max) break;
    for (const s of dayList) {
      if (out.includes(s)) continue;
      out.push(s);
      if (out.length >= max) break;
    }
  }
  return out.slice(0, max);
}

function fmtChip(s: Slot): string {
  const day = s.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: ET_TZ });
  const start = s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET_TZ });
  return `${day} · ${start} ET`;
}

/** Friendlier inline label used inside the conversational paragraph. */
function fmtSentenceTime(s: Slot, scope: OpenAvailabilityScope, idx: number, all: Slot[]): string {
  const start = s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET_TZ }).replace(':00', '');
  // For single-day scopes we drop the date prefix on every entry.
  if (scope === 'today' || scope === 'tomorrow') {
    return start;
  }
  // Multi-day: include day name on each slot, but only repeat the day if it
  // differs from the previous slot (so "Tue 10am or 2:30pm or Wed 3pm" reads
  // naturally).
  const prev = idx > 0 ? all[idx - 1] : null;
  const sameDay = prev && prev.start.toLocaleDateString('en-US', { timeZone: ET_TZ }) === s.start.toLocaleDateString('en-US', { timeZone: ET_TZ });
  if (sameDay) return start;
  const day = s.start.toLocaleDateString('en-US', { weekday: 'long', timeZone: ET_TZ });
  return `${day} at ${start}`;
}

function joinNatural(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
}

function buildDraft(picked: Slot[], scope: OpenAvailabilityScope, formality: OpenAvailabilityFormality): string {
  const tokens = picked.map((s, i) => fmtSentenceTime(s, scope, i, picked));
  const joined = joinNatural(tokens);
  const tzNote = ' ET';
  if (formality === 'formal') {
    if (scope === 'today') {
      return `I have a few openings later today — ${joined}${tzNote}. Please let me know which works best and I'll send a calendar invite.`;
    }
    if (scope === 'tomorrow') {
      return `Tomorrow I have ${joined}${tzNote} available. Happy to send an invite once you confirm a time.`;
    }
    return `I have some availability ${scopeLabel(scope)} — ${joined}${tzNote}. Let me know which works best and I'll send an invite.`;
  }
  // casual
  if (scope === 'today') {
    return `I'm free later today at ${joined}${tzNote} if that works — happy to jump on a quick call.`;
  }
  if (scope === 'tomorrow') {
    return `Tomorrow I have ${joined}${tzNote} open — let me know which is easier.`;
  }
  return `I have some time ${scopeLabel(scope)} at ${joined}${tzNote} — does any of that work for you?`;
}

type Stage = 'prompt' | 'loading' | 'pick' | 'empty' | 'error';

export function OpenAvailabilityCard({ request, onInsertDraft, onDismiss }: Props) {
  const [stage, setStage] = useState<Stage>('prompt');
  const [error, setError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [scope, setScope] = useState<OpenAvailabilityScope>(request.scope);
  const businessDays = useMemo(() => scopeToBusinessDays(scope), [scope]);

  const fetchSlots = useCallback(async (overrideScope?: OpenAvailabilityScope) => {
    const effectiveScope = overrideScope ?? scope;
    const days = scopeToBusinessDays(effectiveScope);
    setScope(effectiveScope);
    setStage('loading');
    setError(null);
    try {
      const now = new Date();
      // Add 2 calendar weeks horizon to absorb weekend skips for "soon".
      const horizon = new Date(now.getTime() + (days + 9) * 24 * 60 * 60 * 1000);
      const { data, error: invokeErr } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'list',
          time_min: now.toISOString(),
          time_max: horizon.toISOString(),
          max_results: 250,
          timezone: ET_TZ,
        },
      });
      if (invokeErr) throw invokeErr;
      const busy: BusyEvent[] = (data?.events || []).map((e: any) => ({
        start: e.start, end: e.end, all_day: !!e.all_day,
      }));
      const windows = buildCandidateWindows(effectiveScope, days);
      const free = mergeFree(windows, busy);
      if (free.length === 0) {
        setSlots([]);
        setStage('empty');
        return;
      }
      const picked = pickSpread(free, MAX_CHIPS);
      setSlots(picked);
      // Default-select up to 3 — the spec recommends offering 2–3.
      setSelectedIdx(new Set(picked.slice(0, Math.min(3, picked.length)).map((_, i) => i)));
      setStage('pick');
    } catch (e: any) {
      console.error('[OpenAvailability] calendar load failed', e);
      setError(e?.message || 'Could not read calendar.');
      setStage('error');
    }
  }, [scope]);

  const toggle = (i: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const insert = () => {
    const picked = slots.filter((_, i) => selectedIdx.has(i));
    if (picked.length === 0) {
      toast.error('Pick at least one time to offer.');
      return;
    }
    const draft = buildDraft(picked, scope, request.formality);
    onInsertDraft(draft);
    toast.success('Inserted into reply.');
    onDismiss();
  };

  return (
    <div className="mx-3 mb-2 rounded-md border border-primary/30 bg-primary/[0.06] p-3">
      <div className="flex items-start gap-2.5">
        <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground leading-snug">
            They're asking about your availability — want me to pull open times?
          </div>
          {stage === 'prompt' && (
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" className="h-7 text-[11px] px-2.5" onClick={() => fetchSlots()}>
                Generate Times
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Scanning {scopeLabel(scope)}
              </span>
            </div>
          )}
          {stage === 'loading' && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading your calendar…
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          )}
          {stage === 'error' && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="h-3 w-3 mt-0.5" />
                <span>{error || 'Calendar read failed.'}</span>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => fetchSlots()}>
                Try again
              </Button>
            </div>
          )}
          {stage === 'empty' && (
            <div className="mt-2 space-y-2">
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <CalendarX className="h-3 w-3 mt-0.5" />
                <span>Your calendar is fully booked {scopeLabel(scope)}.</span>
              </div>
              {scope !== 'soon' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => fetchSlots('soon')}
                >
                  Expand to next 5 business days
                </Button>
              )}
            </div>
          )}
          {stage === 'pick' && (
            <div className="mt-2 space-y-2">
              <div className="text-[10.5px] text-muted-foreground">
                Pick 2–3 to offer. We'll insert a short paragraph into your reply.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s, i) => {
                  const on = selectedIdx.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors',
                        on
                          ? 'border-primary/60 bg-primary/15 text-foreground'
                          : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:text-foreground hover:border-white/[0.18]',
                      )}
                    >
                      {on && <Check className="h-3 w-3 text-primary" />}
                      {fmtChip(s)}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="h-7 text-[11px] px-2.5" onClick={insert}>
                  Insert reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] px-2 text-muted-foreground"
                  onClick={() => fetchSlots(scope)}
                >
                  Refresh
                </Button>
              </div>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}