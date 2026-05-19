import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { detectSchedulingIntent } from './scheduleIntent';

/**
 * ComposerScheduleChip
 * --------------------
 * Non-blocking inline chip rendered above the rich-text editor toolbar.
 * Watches the draft body with an 800ms debounce; when scheduling intent
 * is detected (and the body doesn't already contain proposed time slots)
 * it surfaces a "Suggest times from your calendar" affordance.
 *
 * On Insert, calls the same `calendar-events` edge function used by the
 * Schedule-a-meeting panel, finds the top 3 free 30-min slots inside
 * 9am–5pm ET over the next 5 business days, and appends a formatted
 * bullet list to the draft body.
 *
 * Dismissals persist per draft (threadId) in sessionStorage so the chip
 * does not reappear once the user dismisses it for that draft.
 */

const DEBOUNCE_MS = 800;
const ET_TZ = 'America/New_York';
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17; // 5pm ET
const SLOT_MIN = 30;
const BUSINESS_DAYS = 5;
const TOP_N = 3;
const DISMISS_KEY = (threadId: string) => `naitive:composer-schedule-chip:dismissed:${threadId}`;

interface Slot { start: Date; end: Date }
interface BusyEvent { start: string; end: string; all_day: boolean }

interface Props {
  threadId: string;
  body: string;
  onInsert: (html: string) => void;
}

// Body already references concrete time(s) — don't nag.
const BODY_HAS_TIME_RE =
  /\b(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?\b[^.\n]{0,40}?\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon)\b/i;
const BODY_BULLET_TIMES_RE = /(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)[^<\n]{0,40}){2,}/i;

function bodyAlreadyHasTimeSlots(body: string): boolean {
  if (!body) return false;
  const text = body.replace(/<[^>]+>/g, ' ');
  return BODY_HAS_TIME_RE.test(text) || BODY_BULLET_TIMES_RE.test(text);
}

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

function buildCandidateWindows(): Slot[] {
  const slots: Slot[] = [];
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: ET_TZ }));
  let emitted = 0;
  let dayOffset = 0;
  while (emitted < BUSINESS_DAYS && dayOffset < 14) {
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
        const end = new Date(start.getTime() + SLOT_MIN * 60_000);
        if (start.getTime() <= Date.now() + 15 * 60_000) continue;
        slots.push({ start, end });
      }
    }
  }
  return slots;
}

function filterFree(windows: Slot[], busy: BusyEvent[]): Slot[] {
  const ranges = busy
    .filter((b) => !b.all_day && b.start && b.end)
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
  return windows.filter((w) => {
    const s = w.start.getTime();
    const e = w.end.getTime();
    return !ranges.some((b) => s < b.e && e > b.s);
  });
}

function pickTopN(free: Slot[], n: number): Slot[] {
  // Prefer one slot per distinct day around mid-morning (~10am ET).
  const byDay = new Map<string, Slot[]>();
  for (const s of free) {
    const k = s.start.toLocaleDateString('en-US', { timeZone: ET_TZ });
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  const out: Slot[] = [];
  for (const day of byDay.values()) {
    if (out.length >= n) break;
    const best = day.reduce((acc, cur) => {
      const hAcc = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ET_TZ, hour: '2-digit', hour12: false }).format(acc.start));
      const hCur = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ET_TZ, hour: '2-digit', hour12: false }).format(cur.start));
      return Math.abs(hCur - 10) < Math.abs(hAcc - 10) ? cur : acc;
    });
    out.push(best);
  }
  return out.slice(0, n);
}

function fmtSlotLine(s: Slot): string {
  const day = s.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: ET_TZ });
  const start = s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET_TZ });
  const end = s.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET_TZ });
  return `${day} · ${start}–${end} ET`;
}

function buildHtml(slots: Slot[]): string {
  const items = slots.map((s) => `<li>${fmtSlotLine(s)}</li>`).join('');
  return `<p>Here are a few times that work on my end (Eastern Time):</p><ul>${items}</ul>`;
}

export function ComposerScheduleChip({ threadId, body, onInsert }: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissed = useMemo(() => {
    try { return sessionStorage.getItem(DISMISS_KEY(threadId)) === '1'; } catch { return false; }
  }, [threadId]);
  const [localDismissed, setLocalDismissed] = useState(dismissed);

  useEffect(() => {
    setLocalDismissed(dismissed);
  }, [dismissed, threadId]);

  useEffect(() => {
    if (localDismissed) { setVisible(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const hasIntent = detectSchedulingIntent(body);
      const hasTimes = bodyAlreadyHasTimeSlots(body);
      setVisible(hasIntent && !hasTimes);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [body, localDismissed]);

  const handleDismiss = useCallback(() => {
    try { sessionStorage.setItem(DISMISS_KEY(threadId), '1'); } catch {}
    setLocalDismissed(true);
    setVisible(false);
  }, [threadId]);

  const handleInsert = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + (BUSINESS_DAYS + 9) * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'list',
          time_min: now.toISOString(),
          time_max: horizon.toISOString(),
          max_results: 250,
          timezone: ET_TZ,
        },
      });
      if (error) throw error;
      const busy: BusyEvent[] = (data?.events || []).map((e: any) => ({
        start: e.start, end: e.end, all_day: !!e.all_day,
      }));
      const free = filterFree(buildCandidateWindows(), busy);
      const picked = pickTopN(free, TOP_N);
      if (picked.length === 0) {
        toast.error('No open slots found in the next 5 business days.');
        return;
      }
      onInsert(buildHtml(picked));
      handleDismiss();
      toast.success(`Inserted ${picked.length} suggested time${picked.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      console.error('[ComposerScheduleChip] calendar read failed', e);
      toast.error(e?.message || 'Could not read your calendar.');
    } finally {
      setLoading(false);
    }
  }, [onInsert, handleDismiss]);

  if (!visible || localDismissed) return null;

  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--outlook-blue))]/30 bg-[hsl(var(--outlook-blue))]/10 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <CalendarClock className="h-3.5 w-3.5 text-[hsl(var(--outlook-blue))] flex-shrink-0" />
        <span className="truncate">📅 Suggest times from your calendar</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/15"
          onClick={handleInsert}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Insert'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}