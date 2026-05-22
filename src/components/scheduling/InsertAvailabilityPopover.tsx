import { useState, useMemo, useCallback, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar as CalendarIcon, Clock, Loader2, Check, X, AlertTriangle, Users } from 'lucide-react';
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

interface Teammate {
  user_id: string;
  email: string | null;
  display_name: string | null;
  connected?: boolean;
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

  // Teammate overlay state
  const [teammateOptions, setTeammateOptions] = useState<Teammate[]>([]);
  const [selectedTeammates, setSelectedTeammates] = useState<Teammate[]>([]);
  const [teammateConnState, setTeammateConnState] = useState<Record<string, boolean>>({});
  const [teammateSearch, setTeammateSearch] = useState('');
  const [teammatePickerOpen, setTeammatePickerOpen] = useState(false);

  // Load org teammates (excluding the current user) once on first open
  useEffect(() => {
    if (!open || !user || teammateOptions.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, email, display_name')
        .neq('user_id', user.id)
        .order('display_name', { ascending: true })
        .limit(200);
      setTeammateOptions(((data || []) as Teammate[]).filter((t) => t.email));
    })();
  }, [open, user, teammateOptions.length]);

  const hasUnconnectedSelected = selectedTeammates.some(
    (t) => teammateConnState[t.user_id] === false,
  );

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

      // Overlay teammate busy blocks (intersection of free time)
      const connState: Record<string, boolean> = {};
      if (selectedTeammates.length > 0) {
        const { data: tmData, error: tmErr } = await supabase.functions.invoke(
          'teammates-availability',
          {
            body: {
              user_ids: selectedTeammates.map((t) => t.user_id),
              time_min: now.toISOString(),
              time_max: horizon.toISOString(),
            },
          },
        );
        if (tmErr) {
          console.warn('[InsertAvailability] teammate overlay failed:', tmErr.message);
        } else {
          const teammates = (tmData?.teammates || []) as Array<{
            user_id: string;
            connected: boolean;
            busy: { start: string; end: string }[];
          }>;
          for (const tm of teammates) {
            connState[tm.user_id] = tm.connected;
            if (tm.connected) {
              for (const b of tm.busy) {
                busy.push({ start: new Date(b.start), end: new Date(b.end) });
              }
            }
          }
        }
      }
      setTeammateConnState(connState);

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
      if (picked.length === 0) {
        setError(
          selectedTeammates.length > 0
            ? 'No mutual free slots in the selected window. Try widening hours or removing teammates.'
            : 'No free slots in the selected window.',
        );
      }
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
  }, [daysAhead, workHours, duration, buffer, maxPerDay, tz, selectedTeammates]);

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
    if (hasUnconnectedSelected) {
      toast.error('Remove teammates without a connected calendar before inserting.');
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

          {/* Teammate overlay picker */}
          <div className="space-y-1.5">
            <Label className="text-[11px] flex items-center gap-1">
              <Users className="h-3 w-3" />
              Find mutual time with teammates
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {selectedTeammates.map((t) => {
                const conn = teammateConnState[t.user_id];
                const isUnconnected = conn === false;
                return (
                  <span
                    key={t.user_id}
                    className={
                      'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ' +
                      (isUnconnected
                        ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-300'
                        : 'bg-primary/10 border-primary/30 text-foreground')
                    }
                    title={
                      isUnconnected
                        ? `${t.email} has not connected Google Calendar — ask them to connect in Settings → Integrations`
                        : t.email || ''
                    }
                  >
                    {isUnconnected && <AlertTriangle className="h-2.5 w-2.5" />}
                    {t.display_name || t.email}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTeammates((prev) => prev.filter((p) => p.user_id !== t.user_id))
                      }
                      className="hover:text-destructive"
                      aria-label={`Remove ${t.display_name || t.email}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
              <Popover open={teammatePickerOpen} onOpenChange={setTeammatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:bg-accent"
                  >
                    + Add teammate
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[260px] p-2" sideOffset={4}>
                  <Input
                    autoFocus
                    placeholder="Search by name or email…"
                    value={teammateSearch}
                    onChange={(e) => setTeammateSearch(e.target.value)}
                    className="h-7 text-xs mb-2"
                  />
                  <div className="max-h-[200px] overflow-y-auto">
                    {teammateOptions
                      .filter(
                        (t) =>
                          !selectedTeammates.some((s) => s.user_id === t.user_id) &&
                          (teammateSearch.trim() === '' ||
                            (t.display_name || '')
                              .toLowerCase()
                              .includes(teammateSearch.toLowerCase()) ||
                            (t.email || '')
                              .toLowerCase()
                              .includes(teammateSearch.toLowerCase())),
                      )
                      .slice(0, 30)
                      .map((t) => (
                        <button
                          key={t.user_id}
                          type="button"
                          onClick={() => {
                            setSelectedTeammates((prev) => [...prev, t]);
                            setTeammateSearch('');
                            setTeammatePickerOpen(false);
                          }}
                          className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent"
                        >
                          <div className="font-medium truncate">{t.display_name || t.email}</div>
                          {t.display_name && (
                            <div className="text-[10px] text-muted-foreground truncate">{t.email}</div>
                          )}
                        </button>
                      ))}
                    {teammateOptions.length === 0 && (
                      <div className="text-[11px] text-muted-foreground px-2 py-1">Loading…</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {hasUnconnectedSelected && (
              <div className="text-[10px] text-yellow-700 dark:text-yellow-300 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                One or more teammates haven't connected Google Calendar. Their availability is unknown
                — remove them or ask them to connect to compute mutual times.
              </div>
            )}
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
            disabled={selected.size === 0 || hasUnconnectedSelected}
          >
            Insert into email
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}