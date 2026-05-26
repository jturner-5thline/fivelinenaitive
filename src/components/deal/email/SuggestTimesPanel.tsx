/**
 * SuggestTimesPanel — AI Assist inline card that lets the user generate
 * calendar-aware time-slot suggestions and inject them into the email
 * draft. Each inserted slot is a one-click confirm link that books the
 * meeting on the user's calendar via /schedule/confirm.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Loader2, RefreshCcw, Send, X, Minus, Plus, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useUserCalendarPrefs, DEFAULT_WORKING_HOURS } from '@/hooks/useUserCalendarPrefs';
import { generateSlots, type Slot } from '@/lib/calendar/generateSlots';
import { formatSlotsAsHtml, formatSlotsAsText, type SlotFormat } from '@/lib/calendar/formatSlots';
import { useFreeBusyCache, defaultPrewarmWindow } from '@/hooks/useFreeBusyCache';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  threadId: string;
  subject?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  dealId?: string | null;
  onInsertDraft: (body: string) => void;
  onClose: () => void;
}

type Duration = 15 | 30 | 45 | 60;
type Window = 3 | 5 | 7 | 14;
type SlotCount = 3 | 5 | 7;
type Buffer = 0 | 15 | 30;

function pickSegment<T extends number>(values: T[], current: T, onChange: (v: T) => void, suffix = 'm') {
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'h-6 px-2 text-[11px] rounded-[5px] transition-colors',
            current === v ? 'bg-white/15 text-foreground' : 'text-foreground/70 hover:text-foreground',
          )}
        >{v}{suffix}</button>
      ))}
    </div>
  );
}

export function SuggestTimesPanel({
  threadId, subject, recipientEmail, recipientName, dealId,
  onInsertDraft, onClose,
}: Props) {
  const { tz: userTz, workingHours } = useUserCalendarPrefs();

  // Pull a sensible default working window from Mon hours.
  const defaultStart = (workingHours?.mon ?? DEFAULT_WORKING_HOURS.mon!).start;
  const defaultEnd = (workingHours?.mon ?? DEFAULT_WORKING_HOURS.mon!).end;

  const [duration, setDuration] = useState<Duration>(30);
  const [windowDays, setWindowDays] = useState<Window>(5);
  const [whStart, setWhStart] = useState(defaultStart);
  const [whEnd, setWhEnd] = useState(defaultEnd);
  const [slotCount, setSlotCount] = useState<SlotCount>(5);
  const [buffer, setBuffer] = useState<Buffer>(15);
  const [avoidBackToBack, setAvoidBackToBack] = useState(true);
  const [focusFriendly, setFocusFriendly] = useState(false);
  const [format, setFormat] = useState<SlotFormat>('bulleted');
  const [showRecipientTz, setShowRecipientTz] = useState(false);
  const recipientTz: string | null = null; // not yet inferred from signature

  const [inserting, setInserting] = useState(false);
  const [nudges, setNudges] = useState<Record<number, number>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [inserted, setInserted] = useState(false);
  const mountedAt = useRef<number>(performance.now());
  const firstSlotLogged = useRef(false);
  const qc = useQueryClient();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Pre-warm 14-day freebusy window (also used as the cached source).
  const { startISO: prewarmStartISO, endISO: prewarmEndISO } = useMemo(
    () => defaultPrewarmWindow(),
    [],
  );
  const { busy: cachedBusy, isLoading: freebusyLoading, isCached, error: freebusyError } =
    useFreeBusyCache(prewarmStartISO, prewarmEndISO);

  useEffect(() => {
    setWhStart(defaultStart);
    setWhEnd(defaultEnd);
  }, [defaultStart, defaultEnd]);

  // Debounce slot-shaping inputs by 100ms so dragging segment controls
  // doesn't run the generator on every keystroke.
  const dDuration = useDebouncedValue(duration, 100);
  const dWindow = useDebouncedValue(windowDays, 100);
  const dWhStart = useDebouncedValue(whStart, 100);
  const dWhEnd = useDebouncedValue(whEnd, 100);
  const dSlotCount = useDebouncedValue(slotCount, 100);
  const dBuffer = useDebouncedValue(buffer, 100);
  const dAvoid = useDebouncedValue(avoidBackToBack, 100);
  const dFocus = useDebouncedValue(focusFriendly, 100);

  // Pure-JS slot generation — derived state. Format changes never reach
  // this memo, so switching Bulleted/Inline/Numbered won't re-flicker
  // the chip list.
  const slots = useMemo<Slot[]>(() => {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + 1);
    windowStart.setHours(0, 0, 0, 0);
    return generateSlots({
      windowStart,
      businessDays: dWindow,
      workingHoursStart: dWhStart,
      workingHoursEnd: dWhEnd,
      durationMin: dDuration,
      bufferMin: dBuffer,
      avoidBackToBack: dAvoid,
      focusFriendly: dFocus,
      busy: cachedBusy,
      maxSlots: dSlotCount,
    });
  }, [cachedBusy, dDuration, dWindow, dWhStart, dWhEnd, dSlotCount, dBuffer, dAvoid, dFocus]);

  // Telemetry: log time-to-first-slot once per mount.
  useEffect(() => {
    if (!firstSlotLogged.current && slots.length > 0) {
      firstSlotLogged.current = true;
      const ms = performance.now() - mountedAt.current;
      // eslint-disable-next-line no-console
      console.log(`[SuggestTimes] first slots rendered in ${ms.toFixed(0)}ms (cached=${isCached})`);
    }
  }, [slots.length, isCached]);

  // Apply per-slot nudges and removals on top of the derived list.
  const adjustedSlots = useMemo(() => {
    return slots.map((s, i) => {
      const delta = (nudges[i] ?? 0) * 60_000;
      if (delta === 0) return s;
      return { start: new Date(s.start.getTime() + delta), end: new Date(s.end.getTime() + delta) };
    });
  }, [slots, nudges]);
  const activeSlots = useMemo(
    () => adjustedSlots.filter((_, i) => !removed.has(i)),
    [adjustedSlots, removed],
  );

  // Reset edits when the underlying slot set changes shape.
  useEffect(() => {
    setRemoved(new Set());
    setNudges({});
  }, [slots.length, dDuration, dWindow]);

  const nudge = (index: number, deltaMin: number) => {
    setNudges((prev) => ({ ...prev, [index]: (prev[index] ?? 0) + deltaMin }));
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['freebusy-self'] });
  };

  const insert = async () => {
    if (activeSlots.length === 0) {
      toast.error('Select at least one slot to insert.');
      return;
    }
    setInserting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-proposed-slots', {
        body: {
          thread_id: threadId,
          recipient_email: recipientEmail || null,
          recipient_name: recipientName || null,
          subject: subject || null,
          deal_id: dealId || null,
          timezone: userTz,
          duration_minutes: duration,
          slots: activeSlots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const created = (data?.slots ?? []) as Array<{ token: string; slot_start: string; slot_end: string }>;
      const origin = window.location.origin;
      const withUrls = created.map((c) => ({
        start: new Date(c.slot_start),
        end: new Date(c.slot_end),
        url: `${origin}/schedule/confirm?token=${encodeURIComponent(c.token)}`,
      }));

      const html = formatSlotsAsHtml(withUrls, {
        format, tz: userTz,
        recipientTz: showRecipientTz ? recipientTz : null,
      });
      const text = formatSlotsAsText(withUrls, {
        format, tz: userTz,
        recipientTz: showRecipientTz ? recipientTz : null,
      });

      // Composer expects a string body. If it already contains markup it
      // will render as HTML, otherwise as plain text. We send HTML so the
      // confirm links are clickable.
      onInsertDraft(html || text);
      setInserted(true);
      toast.success('Slots inserted into your draft.');
    } catch (e) {
      console.error('[SuggestTimes] insert failed', e);
      toast.error((e as Error).message || 'Could not save proposed slots');
    } finally {
      setInserting(false);
    }
  };

  if (inserted) {
    return (
      <div className="rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-3 flex items-center justify-between gap-3">
        <div className="text-[12px] text-foreground/85">
          Slots inserted into your draft.
        </div>
        <button
          type="button"
          onClick={() => setInserted(false)}
          className="text-[11.5px] text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline"
        >
          Edit times
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-violet-300" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-200/90">
            Suggest times in email
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-foreground/50 hover:text-foreground/80"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
        <div className="space-y-1">
          <Label className="text-[10.5px] text-foreground/65 uppercase tracking-wide">Duration</Label>
          {pickSegment<Duration>([15, 30, 45, 60], duration, setDuration)}
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] text-foreground/65 uppercase tracking-wide">Window</Label>
          {pickSegment<Window>([3, 5, 7, 14], windowDays, setWindowDays, 'd')}
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] text-foreground/65 uppercase tracking-wide">Slots</Label>
          {pickSegment<SlotCount>([3, 5, 7], slotCount, setSlotCount, '')}
        </div>
        <div className="space-y-1">
          <Label className="text-[10.5px] text-foreground/65 uppercase tracking-wide">Buffer</Label>
          {pickSegment<Buffer>([0, 15, 30], buffer, setBuffer)}
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-[10.5px] text-foreground/65 uppercase tracking-wide">Working hours</Label>
          <div className="flex items-center gap-1.5">
            <Input type="time" value={whStart} onChange={(e) => setWhStart(e.target.value)} className="h-7 w-24 text-[11.5px]" />
            <span className="text-[10.5px] text-foreground/55">to</span>
            <Input type="time" value={whEnd} onChange={(e) => setWhEnd(e.target.value)} className="h-7 w-24 text-[11.5px]" />
            <span className="ml-auto text-[10.5px] text-foreground/55">{userTz}</span>
          </div>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-[11px] text-foreground/80">
          <Switch checked={avoidBackToBack} onCheckedChange={setAvoidBackToBack} />
          <span>Avoid back-to-back</span>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-[11px] text-foreground/80">
          <Switch checked={focusFriendly} onCheckedChange={setFocusFriendly} />
          <span>Focus-time friendly (skip slots that fragment a free block &lt;60min)</span>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-[11px] text-foreground/80">
          <Switch checked={showRecipientTz} onCheckedChange={setShowRecipientTz} />
          <span>Show recipient time zone too</span>
        </label>
        <div className="col-span-2 flex items-center gap-2">
          <Label className="text-[10.5px] text-foreground/65 uppercase tracking-wide">Format</Label>
          <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
            {(['bulleted', 'inline', 'numbered'] as SlotFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={cn(
                  'h-6 px-2 text-[11px] rounded-[5px] capitalize transition-colors',
                  format === f ? 'bg-white/15 text-foreground' : 'text-foreground/70 hover:text-foreground',
                )}
              >{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={insert}
          disabled={inserting || activeSlots.length === 0}
          className="h-7 text-[11.5px] gap-1"
        >
          {inserting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Insert into draft
        </Button>
        <button
          type="button"
          onClick={refresh}
          className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-foreground/60 hover:text-foreground"
          title="Refresh calendar availability"
        >
          <RefreshCcw className="h-3 w-3" /> Regenerate
        </button>
      </div>

      {/* Status pills */}
      {freebusyLoading && !isCached && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] text-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" /> Fetching calendar…
        </div>
      )}
      {!isOnline && isCached && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-200">
          <WifiOff className="h-3 w-3" /> Cached availability — reconnect to refresh
        </div>
      )}
      {freebusyError && (
        <div className="text-[10.5px] text-rose-300">Couldn't reach calendar — showing best-effort slots.</div>
      )}

      {/* Slot chips: skeletons while cold, then real chips */}
      {slots.length === 0 && freebusyLoading && !isCached ? (
        <div className="space-y-1.5">
          {Array.from({ length: slotCount }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full bg-white/5" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <div className="text-[11px] text-foreground/60">
          No open slots match your constraints. Try widening the window or working hours.
        </div>
      ) : (
        <div className="space-y-1.5">
          {adjustedSlots.map((s, i) => {
            const isRemoved = removed.has(i);
            const label = new Intl.DateTimeFormat('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit', hour12: true, timeZone: userTz,
            }).format(s.start);
            const end = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric', minute: '2-digit', hour12: true, timeZone: userTz,
            }).format(s.end);
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11.5px]',
                  isRemoved && 'opacity-40 line-through',
                )}
              >
                <span className="flex-1 truncate">{label} – {end}</span>
                <button type="button" title="-15min"
                        onClick={() => nudge(i, -15)}
                        className="text-foreground/60 hover:text-foreground"><Minus className="h-3 w-3" /></button>
                <button type="button" title="+15min"
                        onClick={() => nudge(i, 15)}
                        className="text-foreground/60 hover:text-foreground"><Plus className="h-3 w-3" /></button>
                <button type="button" title={isRemoved ? 'Restore' : 'Remove'}
                        onClick={() => setRemoved((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        })}
                        className="text-foreground/60 hover:text-foreground"><X className="h-3 w-3" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}