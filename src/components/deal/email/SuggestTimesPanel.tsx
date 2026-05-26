/**
 * SuggestTimesPanel — AI Assist inline card that lets the user generate
 * calendar-aware time-slot suggestions and inject them into the email
 * draft. Each inserted slot is a one-click confirm link that books the
 * meeting on the user's calendar via /schedule/confirm.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange, Loader2, RefreshCcw, Send, X, WifiOff, Info, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

function Segmented<T extends string | number>({
  values, current, onChange, format,
}: {
  values: T[];
  current: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="inline-flex w-full rounded-md bg-muted/30 p-0.5">
      {values.map((v) => {
        const selected = current === v;
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'flex-1 h-7 px-2 text-xs rounded-[5px] capitalize transition-colors',
              selected
                ? 'bg-primary/15 text-foreground font-medium'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground',
            )}
          >{format ? format(v) : String(v)}</button>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
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
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [inserted, setInserted] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [regenPulse, setRegenPulse] = useState(false);
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
    const result = generateSlots({
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
    // One-shot diagnostic so we can verify raw freebusy + final picks for
    // the "always 9 AM" availability bug.
    // eslint-disable-next-line no-console
    console.debug('[SuggestTimes] generate', {
      tz: userTz,
      windowStart: windowStart.toISOString(),
      businessDays: dWindow,
      hours: `${dWhStart}–${dWhEnd}`,
      durationMin: dDuration,
      bufferMin: dBuffer,
      busyCount: cachedBusy.length,
      busySample: cachedBusy.slice(0, 4).map((b) => ({
        start: b.start.toISOString(), end: b.end.toISOString(),
      })),
      picks: result.map((s) => s.start.toISOString()),
    });
    return result;
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

  const activeSlots = useMemo(
    () => slots.filter((_, i) => !removed.has(i)),
    [slots, removed],
  );

  // Reset edits when the underlying slot set changes shape.
  useEffect(() => {
    setRemoved(new Set());
  }, [slots.length, dDuration, dWindow]);

  const refresh = () => {
    setRegenPulse(true);
    qc.invalidateQueries({ queryKey: ['freebusy-self'] });
    window.setTimeout(() => setRegenPulse(false), 700);
  };

  const insert = async () => {
    if (activeSlots.length === 0) {
      toast.error('Select at least one slot to insert.');
      return;
    }
    setInserting(true);
    try {
      const payload = activeSlots.map((s) => ({ start: s.start, end: s.end }));
      const html = formatSlotsAsHtml(payload, {
        format, tz: userTz,
        recipientTz: showRecipientTz ? recipientTz : null,
      });
      const text = formatSlotsAsText(payload, {
        format, tz: userTz,
        recipientTz: showRecipientTz ? recipientTz : null,
      });
      onInsertDraft(html || text);
      setInserted(true);
      toast.success('Slots inserted into your draft.');
    } catch (e) {
      console.error('[SuggestTimes] insert failed', e);
      toast.error((e as Error).message || 'Could not insert slots');
    } finally {
      setInserting(false);
    }
  };

  if (inserted) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="text-sm text-foreground/85">
          Slots inserted into your draft.
        </div>
        <button
          type="button"
          onClick={() => setInserted(false)}
          className="text-xs text-primary hover:underline underline-offset-2"
        >
          Edit times
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col -m-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-violet-300" />
          <span className="text-sm font-medium text-foreground">Suggest times in email</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 hover:bg-white/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {/* Visible controls */}
        <div className="space-y-2">
          <Row label="Duration">
            <Segmented<Duration> values={[15, 30, 45, 60]} current={duration} onChange={setDuration}
              format={(v) => `${v}m`} />
          </Row>
          <Row label="Window">
            <Segmented<Window> values={[3, 5, 7, 14]} current={windowDays} onChange={setWindowDays}
              format={(v) => `${v}d`} />
          </Row>
          <Row label="Slots">
            <Segmented<SlotCount> values={[3, 5, 7]} current={slotCount} onChange={setSlotCount} />
          </Row>
          <Row label="Format">
            <Segmented<SlotFormat> values={['bulleted', 'inline', 'numbered']} current={format}
              onChange={setFormat} />
          </Row>
        </div>

        {/* Advanced */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="uppercase tracking-wide">Advanced</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')} />
          </button>
          {advancedOpen && (
            <div className="mt-2 space-y-2">
              <Row label="Buffer">
                <Segmented<Buffer> values={[0, 15, 30]} current={buffer} onChange={setBuffer}
                  format={(v) => `${v}m`} />
              </Row>
              <Row label="Hours">
                <div className="flex items-center gap-1.5 text-xs">
                  <Input type="time" value={whStart} onChange={(e) => setWhStart(e.target.value)}
                    className="h-7 w-[88px] text-xs" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={whEnd} onChange={(e) => setWhEnd(e.target.value)}
                    className="h-7 w-[88px] text-xs" />
                  <span className="ml-auto truncate text-muted-foreground">{userTz}</span>
                </div>
              </Row>
              <label className="flex items-center justify-between gap-2 text-sm text-foreground/85">
                <span>Avoid back-to-back</span>
                <Switch checked={avoidBackToBack} onCheckedChange={setAvoidBackToBack} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-foreground/85">
                <span className="inline-flex items-center gap-1.5">
                  Focus-time friendly
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Skip slots that fragment a free block &lt;60min.</TooltipContent>
                  </Tooltip>
                </span>
                <Switch checked={focusFriendly} onCheckedChange={setFocusFriendly} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-foreground/85">
                <span>Show recipient time zone</span>
                <Switch checked={showRecipientTz} onCheckedChange={setShowRecipientTz} />
              </label>
            </div>
          )}
        </div>

        {/* Status messages */}
        {!isOnline && isCached && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
            <WifiOff className="h-3 w-3" /> Cached availability — reconnect to refresh
          </div>
        )}
        {freebusyError && (
          <div className="text-xs text-rose-300">
            Couldn't reach calendar — showing best-effort slots.
          </div>
        )}

        {/* Slot list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
              Suggested
            </div>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              title="Refresh calendar availability"
            >
              <RefreshCcw className="h-3 w-3" /> Regenerate
            </button>
          </div>

          {/* Thin progress bar */}
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-muted/40">
            {(freebusyLoading || regenPulse) && (
              <div className="h-full w-1/3 animate-[shimmer_1s_linear_infinite] bg-primary/70"
                style={{ animation: 'shimmer 1.1s linear infinite' }} />
            )}
          </div>

          {slots.length === 0 ? (
            <div className="text-xs text-muted-foreground py-1">
              No open slots in this window — try widening the window or shortening duration.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {slots.map((s, i) => {
                const isRemoved = removed.has(i);
                const label = new Intl.DateTimeFormat('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: userTz,
                }).format(s.start);
                const end = new Intl.DateTimeFormat('en-US', {
                  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: userTz,
                }).format(s.end);
                return (
                  <li
                    key={i}
                    className={cn(
                      'group flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors',
                      'hover:bg-muted/50',
                      isRemoved && 'opacity-40 line-through',
                    )}
                  >
                    <span className="flex-1 truncate whitespace-nowrap text-foreground">
                      {label} – <span className="text-muted-foreground">{end}</span>
                    </span>
                    <button
                      type="button"
                      title={isRemoved ? 'Restore' : 'Remove'}
                      onClick={() => setRemoved((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground touch:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Pinned CTA */}
      <div className="border-t border-border/50 bg-card/95 backdrop-blur px-4 py-3">
        <Button
          variant="default"
          onClick={insert}
          disabled={inserting || activeSlots.length === 0}
          className="w-full h-9 gap-1.5"
        >
          {inserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Insert into draft
        </Button>
      </div>
    </div>
  );
}