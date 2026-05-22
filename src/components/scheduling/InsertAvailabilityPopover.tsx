import { useState, useMemo, useCallback, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar as CalendarIcon, Clock, Loader2, Check, X, AlertTriangle, Users, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Link as RouterLink } from 'react-router-dom';
import { useFreeSlots, formatSlotLineET, ET_TZ, type Slot } from '@/hooks/useFreeSlots';

interface Props {
  /** Insert formatted HTML block at end of body. */
  onInsert: (html: string) => void;
  /** Optional recipient context to persist with the proposed slots (back-compat single). */
  recipientEmail?: string | null;
  /** Optional full list of recipient emails. */
  recipientEmails?: string[] | null;
  dealId?: string | null;
  meetingId?: string | null;
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

// formatSlotLineET imported from useFreeSlots
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

export function InsertAvailabilityPopover({ onInsert, recipientEmail, recipientEmails, dealId, meetingId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [daysAhead, setDaysAhead] = useState(7);
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState(4);
  const [workHours, setWorkHours] = useState<[number, number]>([9, 18]);
  const [tz, setTz] = useState(getUserTz());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inserting, setInserting] = useState(false);

  // Teammate overlay state
  const [teammateOptions, setTeammateOptions] = useState<Teammate[]>([]);
  const [selectedTeammates, setSelectedTeammates] = useState<Teammate[]>([]);
  const [teammateSearch, setTeammateSearch] = useState('');
  const [teammatePickerOpen, setTeammatePickerOpen] = useState(false);

  // Shared free-slots fetch (mirrors FindATimeDialog code path)
  const teammateIds = useMemo(() => selectedTeammates.map((t) => t.user_id), [selectedTeammates]);
  const {
    loading,
    error,
    candidates: rawCandidates,
    gcalConnected,
    teammateConnState,
    load,
    reset: resetFreeSlots,
  } = useFreeSlots({
    enabled: open,
    daysAhead,
    duration,
    buffer,
    startHour: workHours[0],
    endHour: workHours[1],
    teammateIds,
    tz,
    logPrefix: '[InsertAvailability]',
  });

  // Apply per-day cap on top of free slots returned by the hook.
  const candidates = useMemo<Slot[] | null>(() => {
    if (!rawCandidates) return null;
    return pickPerDay(rawCandidates, maxPerDay, tz);
  }, [rawCandidates, maxPerDay, tz]);

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
    setSelected(new Set());
    await load();
  }, [load]);

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
    setInserting(true);
    try {
      const chosen = candidates.filter((c) => selected.has(c.key));
      // Persist FIRST so the popover stays open if the write fails
      if (user) {
        const emails = (recipientEmails && recipientEmails.length > 0)
          ? recipientEmails
          : (recipientEmail ? [recipientEmail] : null);
        const rows = chosen.map((s) => ({
          user_id: user.id,
          recipient_email: emails?.[0] || null,
          recipient_emails: emails,
          deal_id: dealId || null,
          meeting_id: meetingId || null,
          slot_start: s.start.toISOString(),
          slot_end: s.end.toISOString(),
          timezone: ET_TZ,
          status: 'proposed',
        }));
        const { error: insErr } = await supabase.from('naitive_proposed_slots').insert(rows);
        if (insErr) {
          console.error('[InsertAvailability] persist failed:', insErr.message);
          toast.error('Could not save proposed slots: ' + insErr.message);
          return;
        }
      }
      const itemsHtml = chosen
        .map((s) => `<li>${escapeHtml(formatSlotLineET(s))}</li>`)
        .join('');
      const block =
        `<p>Here are a few times that work for me (all times Eastern):</p>` +
        `<ul>${itemsHtml}</ul>` +
        `<p>Let me know what works and I'll send a calendar invite.</p>`;
      onInsert(block);
      toast.success(`${chosen.length} slot${chosen.length === 1 ? '' : 's'} inserted and held until accepted`);
      setOpen(false);
      setCandidates(null);
      setSelected(new Set());
    } finally {
      setInserting(false);
    }
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-semibold">Insert availability</div>
          <div className="text-[11px] text-muted-foreground">
            Free slots pulled from your Google Calendar
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 overflow-y-auto">
          {gcalConnected === false && (
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-700 dark:text-yellow-300 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  Connect your Google Calendar in <strong>Settings → Integrations</strong> to pull your busy times.
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1"
                asChild
              >
                <RouterLink to="/settings/integrations" onClick={(e) => e.stopPropagation()}>
                  <LinkIcon className="h-3 w-3" /> Connect now
                </RouterLink>
              </Button>
            </div>
          )}

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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              loadAvailability();
            }}
            disabled={loading || gcalConnected === false}
          >
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            {candidates ? 'Recompute slots' : 'Find free slots'}
          </Button>

          {loading && (
            <div className="space-y-1.5" aria-label="Loading free slots">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive space-y-1.5">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>{error}</div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 text-[11px] gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  loadAvailability();
                }}
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            </div>
          )}

          {!loading && !error && candidates && candidates.length === 0 && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              No mutually free slots in this window. Try widening the date range or working hours.
            </div>
          )}

          {!loading && candidates && candidates.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Free slots ({candidates.length})
              </div>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {grouped.map(([day, slots]) => (
                  <div key={day}>
                    <div className="sticky top-0 z-10 bg-popover text-[10px] font-medium uppercase text-muted-foreground mb-1 py-0.5">{day}</div>
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
            {selected.size > 0 ? `${selected.size} slot${selected.size === 1 ? '' : 's'} selected` : 'Pick at least one slot'}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); insert(); }}
            disabled={selected.size === 0 || hasUnconnectedSelected || inserting}
          >
            {inserting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Insert into email
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}