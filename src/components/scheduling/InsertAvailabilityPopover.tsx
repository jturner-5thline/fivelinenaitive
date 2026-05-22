import { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar as CalendarIcon, Clock, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  /** Insert formatted HTML block at end of body. */
  onInsert: (html: string) => void;
  /** Optional recipient + deal context to persist with the proposed slots. */
  recipientEmail?: string | null;
  dealId?: string | null;
}

interface Slot {
  start: Date;
  end: Date;
  key: string;
}

const DURATIONS = [15, 30, 45, 60, 90];
const BUFFERS = [0, 5, 10, 15];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getUserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function tzAbbrev(tz: string, date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value || 'ET';
  } catch {
    return 'ET';
  }
}

function formatSlotLine(slot: Slot, tz: string): string {
  const fmtDay = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
  });
  const fmtTime = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const day = fmtDay.format(slot.start);
  const t1 = fmtTime.format(slot.start).replace(' ', '');
  const t2 = fmtTime.format(slot.end).replace(' ', '');
  const abbr = tzAbbrev(tz, slot.start);
  return `${day} — ${t1}–${t2} ${abbr}`;
}

/** Build candidate weekday slots for the next N business days based on settings. */
function buildCandidates(opts: {
  daysAhead: number;
  startHour: number;
  endHour: number;
  durationMin: number;
  bufferMin: number;
}): Slot[] {
  const { daysAhead, startHour, endHour, durationMin, bufferMin } = opts;
  const out: Slot[] = [];
  const now = new Date();
  const stepMs = (durationMin + bufferMin) * 60 * 1000;
  let added = 0;
  let dayOffset = 0;
  while (added < daysAhead && dayOffset < 60) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    dayOffset += 1;
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    added += 1;
    const dayStart = new Date(day);
    dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(endHour, 0, 0, 0);
    let cursor = dayStart.getTime();
    // Skip slots in the past
    const minStart = Math.max(cursor, now.getTime() + 15 * 60 * 1000);
    cursor = Math.max(cursor, Math.ceil(minStart / (30 * 60 * 1000)) * (30 * 60 * 1000));
    while (cursor + durationMin * 60 * 1000 <= dayEnd.getTime()) {
      const s = new Date(cursor);
      const e = new Date(cursor + durationMin * 60 * 1000);
      out.push({ start: s, end: e, key: `${s.toISOString()}_${e.toISOString()}` });
      cursor += stepMs;
    }
  }
  return out;
}

function filterBusy(candidates: Slot[], busy: { start: Date; end: Date }[], bufferMin: number): Slot[] {
  const bufMs = bufferMin * 60 * 1000;
  return candidates.filter(
    (c) =>
      !busy.some(
        (b) =>
          c.start.getTime() < b.end.getTime() + bufMs &&
          c.end.getTime() + bufMs > b.start.getTime(),
      ),
  );
}

function pickPerDay(slots: Slot[], maxPerDay: number, tz: string): Slot[] {
  const byDay = new Map<string, Slot[]>();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const s of slots) {
    const key = fmt.format(s.start);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const out: Slot[] = [];
  for (const [, arr] of byDay) {
    // spread across the day: pick evenly
    if (arr.length <= maxPerDay) out.push(...arr);
    else {
      const step = arr.length / maxPerDay;
      for (let i = 0; i < maxPerDay; i++) out.push(arr[Math.floor(i * step)]);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function InsertAvailabilityPopover({ onInsert, recipientEmail, dealId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [daysAhead, setDaysAhead] = useState(7);
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState(4);
  const [workHours, setWorkHours] = useState<[number, number]>([9, 18]);
  const [tz, setTz] = useState(getUserTz());
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Slot[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCandidates(null);
    setSelected(new Set());
    try {
      const now = new Date();
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + Math.max(daysAhead * 2, 14));
      const { data, error: fnErr } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'list',
          calendar_id: 'primary',
          time_min: now.toISOString(),
          time_max: horizon.toISOString(),
          max_results: 200,
        },
      });
      if (fnErr) throw fnErr;
      const events = (data?.events || []) as Array<{ start: string; end: string; all_day?: boolean }>;
      const busy = events
        .filter((e) => e.start && e.end && !e.all_day)
        .map((e) => ({ start: new Date(e.start), end: new Date(e.end) }));
      const all = buildCandidates({
        daysAhead,
        startHour: workHours[0],
        endHour: workHours[1],
        durationMin: duration,
        bufferMin: buffer,
      });
      const free = filterBusy(all, busy, buffer);
      const picked = pickPerDay(free, maxPerDay, tz);
      setCandidates(picked);
      if (picked.length === 0) setError('No free slots in the selected window.');
    } catch (e: any) {
      const msg = e?.message || 'Could not load calendar availability.';
      setError(
        msg.toLowerCase().includes('not connected')
          ? 'Connect Google Calendar in Settings → Integrations to use Insert Availability.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [daysAhead, workHours, duration, buffer, maxPerDay, tz]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const insert = async () => {
    if (!candidates || selected.size === 0) {
      toast.error('Pick at least one slot.');
      return;
    }
    const chosen = candidates.filter((c) => selected.has(c.key));
    const itemsHtml = chosen
      .map((s) => `<li>${escapeHtml(formatSlotLine(s, tz))}</li>`)
      .join('');
    const block =
      `<p>Here are a few times that work for me:</p>` +
      `<ul>${itemsHtml}</ul>` +
      `<p>Let me know what works and I'll send a calendar invite.</p>`;
    onInsert(block);

    // Persist as draft holds (best-effort, non-blocking)
    if (user) {
      const rows = chosen.map((s) => ({
        user_id: user.id,
        recipient_email: recipientEmail || null,
        deal_id: dealId || null,
        slot_start: s.start.toISOString(),
        slot_end: s.end.toISOString(),
        timezone: tz,
        status: 'proposed',
      }));
      const { error: insErr } = await supabase.from('naitive_proposed_slots').insert(rows);
      if (insErr) console.warn('[InsertAvailability] persist failed:', insErr.message);
    }

    toast.success(`Inserted ${chosen.length} time${chosen.length === 1 ? '' : 's'} into the message`);
    setOpen(false);
    setCandidates(null);
    setSelected(new Set());
  };

  const grouped = useMemo(() => {
    if (!candidates) return [];
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' });
    const map = new Map<string, Slot[]>();
    for (const s of candidates) {
      const k = fmt.format(s.start);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries());
  }, [candidates, tz]);

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }),
    [tz],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setCandidates(null);
          setSelected(new Set());
          setError(null);
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              aria-label="Insert availability"
            >
              <CalendarIcon className="h-3 w-3" />
              <Clock className="h-3 w-3 -ml-1" />
              Insert availability
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Propose meeting times from your calendar
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[420px] p-0 max-h-[560px] overflow-hidden flex flex-col"
      >
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-semibold">Insert availability</div>
          <div className="text-[11px] text-muted-foreground">
            Free slots pulled from your Google Calendar
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px]">Days ahead (weekdays)</Label>
              <Input
                type="number"
                min={1}
                max={21}
                value={daysAhead}
                onChange={(e) => setDaysAhead(Math.max(1, Math.min(21, Number(e.target.value) || 7)))}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px]">Duration</Label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Buffer between</Label>
              <select
                value={buffer}
                onChange={(e) => setBuffer(Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {BUFFERS.map((d) => (
                  <option key={d} value={d}>{d === 0 ? 'None' : `${d} min`}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Max slots / day</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(Math.max(1, Math.min(12, Number(e.target.value) || 4)))}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">
              Working hours: {workHours[0]}:00 – {workHours[1]}:00
            </Label>
            <div className="pt-2">
              <Slider
                min={6}
                max={22}
                step={1}
                value={workHours}
                onValueChange={(v) => setWorkHours([v[0], Math.max(v[1], v[0] + 1)] as [number, number])}
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">Timezone</Label>
            <Input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={loadAvailability}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            {candidates ? 'Recompute slots' : 'Find free slots'}
          </Button>

          {error && (
            <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {candidates && candidates.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground">
                {candidates.length} free slot{candidates.length === 1 ? '' : 's'} found — pick the ones to propose.
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {grouped.map(([day, slots]) => (
                  <div key={day}>
                    <div className="text-[10px] font-medium uppercase text-muted-foreground mb-1">{day}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map((s) => {
                        const isSel = selected.has(s.key);
                        return (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => toggle(s.key)}
                            className={
                              'text-[11px] px-2 py-1 rounded border transition-colors ' +
                              (isSel
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background border-border hover:bg-accent')
                            }
                          >
                            {isSel && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                            {timeFmt.format(s.start).replace(' ', '')}–{timeFmt.format(s.end).replace(' ', '')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 border-t flex items-center justify-between bg-muted/30">
          <div className="text-[11px] text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : 'Pick at least one slot'}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={insert}
            disabled={selected.size === 0}
          >
            Insert into email
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}