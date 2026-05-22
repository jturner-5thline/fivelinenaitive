import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Calendar as CalendarIcon, Check, Loader2, RefreshCw, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const DURATIONS = [15, 30, 45, 60, 90];
const BUFFERS = [0, 5, 10, 15];
const ET_TZ = 'America/New_York';

type ConferencingProvider = 'google_meet' | 'zoom' | 'teams' | 'phone' | 'none';

interface Attendee { email: string; name?: string | null; }

interface Slot { start: Date; end: Date; key: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title for the new meeting. */
  defaultTitle?: string;
  /** Recipient attendees seeded into the invite. */
  attendees?: Attendee[];
  /** Optional context for downstream persistence. */
  dealId?: string | null;
  meetingId?: string | null;
  /** Called after a successful Gcal create. */
  onScheduled?: (eventId: string | null) => void;
}

function buildCandidates(opts: {
  daysAhead: number; startHour: number; endHour: number; durationMin: number; bufferMin: number;
}): Slot[] {
  const { daysAhead, startHour, endHour, durationMin, bufferMin } = opts;
  const out: Slot[] = [];
  const now = new Date();
  const step = (durationMin + bufferMin) * 60_000;
  let added = 0, dayOffset = 0;
  while (added < daysAhead && dayOffset < 60) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    dayOffset += 1;
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    added += 1;
    const dayStart = new Date(day); dayStart.setHours(startHour, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(endHour, 0, 0, 0);
    const minStart = Math.max(dayStart.getTime(), now.getTime() + 15 * 60_000);
    let cursor = Math.ceil(minStart / (30 * 60_000)) * (30 * 60_000);
    while (cursor + durationMin * 60_000 <= dayEnd.getTime()) {
      const s = new Date(cursor);
      const e = new Date(cursor + durationMin * 60_000);
      out.push({ start: s, end: e, key: `${s.toISOString()}_${e.toISOString()}` });
      cursor += step;
    }
  }
  return out;
}

function filterBusy(c: Slot[], busy: { start: Date; end: Date }[], bufMin: number): Slot[] {
  const buf = bufMin * 60_000;
  return c.filter((x) => !busy.some((b) =>
    x.start.getTime() < b.end.getTime() + buf && x.end.getTime() + buf > b.start.getTime(),
  ));
}

function fmtET(s: Slot): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: ET_TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(s.start);
  const t1 = new Intl.DateTimeFormat('en-US', { timeZone: ET_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(s.start);
  const t2 = new Intl.DateTimeFormat('en-US', { timeZone: ET_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(s.end);
  const m1 = t1.match(/^(.+?)\s(AM|PM)$/i);
  const m2 = t2.match(/^(.+?)\s(AM|PM)$/i);
  const compact = m1 && m2 && m1[2] === m2[2]
    ? `${m1[1]}–${m2[1]} ${m2[2]}`
    : `${t1.replace(' ', '')}–${t2.replace(' ', '')}`;
  return `${day} — ${compact} ET`;
}

export function FindATimeDialog({ open, onOpenChange, defaultTitle, attendees, dealId, meetingId, onScheduled }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState(defaultTitle || 'Follow-up meeting');
  const [description, setDescription] = useState('');
  const [daysAhead, setDaysAhead] = useState(7);
  const [duration, setDuration] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [workHours, setWorkHours] = useState<[number, number]>([9, 18]);
  const [conferencing, setConferencing] = useState<ConferencingProvider>('google_meet');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Slot[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [gcalChecked, setGcalChecked] = useState(false);

  // Zoom availability check (light): look for a row in user_integrations
  const [zoomConnected, setZoomConnected] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || 'Follow-up meeting');
      setSelectedKey(null);
      setCandidates(null);
      setError(null);
      setGcalChecked(false);
      setGcalConnected(null);
    }
  }, [open, defaultTitle]);

  useEffect(() => {
    if (!open || gcalChecked) return;
    let cancel = false;
    (async () => {
      try {
        const now = new Date();
        const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
        const { data, error: e } = await supabase.functions.invoke('calendar-events', {
          body: { action: 'list', calendar_id: 'primary', time_min: now.toISOString(), time_max: horizon.toISOString(), max_results: 1 },
        });
        if (cancel) return;
        if (e || data?.error) { setGcalConnected(false); console.error('[FindATime] gcal probe failed:', e?.message || data?.error); }
        else setGcalConnected(true);
      } catch (err: any) {
        if (!cancel) setGcalConnected(false);
        console.error('[FindATime] gcal probe threw:', err?.message || err);
      } finally {
        if (!cancel) setGcalChecked(true);
      }
    })();
    return () => { cancel = true; };
  }, [open, gcalChecked]);

  // Best-effort zoom check via user_integrations row (table may not exist yet)
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      try {
        const { data, error: e } = await (supabase as any)
          .from('user_integrations')
          .select('provider')
          .eq('user_id', user.id)
          .eq('provider', 'zoom')
          .maybeSingle();
        if (!e && data) setZoomConnected(true);
      } catch { /* table may not exist yet */ }
    })();
  }, [open, user]);

  const loadAvailability = async () => {
    setLoading(true); setError(null); setCandidates(null); setSelectedKey(null);
    try {
      const now = new Date();
      const horizon = new Date(now); horizon.setDate(horizon.getDate() + Math.max(daysAhead * 2, 14));
      const { data, error: e } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'list', calendar_id: 'primary', time_min: now.toISOString(), time_max: horizon.toISOString(), max_results: 200 },
      });
      if (e) { console.error('[FindATime] calendar-events failed:', e.message); throw e; }
      if (data?.error) { console.error('[FindATime] calendar-events error:', data.error); throw new Error(data.error); }
      const events = (data?.events || []) as Array<{ start: string; end: string; all_day?: boolean }>;
      const busy = events.filter((x) => x.start && x.end && !x.all_day).map((x) => ({ start: new Date(x.start), end: new Date(x.end) }));
      const all = buildCandidates({ daysAhead, startHour: workHours[0], endHour: workHours[1], durationMin: duration, bufferMin: buffer });
      const free = filterBusy(all, busy, buffer).slice(0, 60);
      setCandidates(free);
    } catch (err: any) {
      const msg = err?.message || 'Could not load availability';
      console.error('[FindATime] loadAvailability:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    if (!candidates) return [] as [string, Slot[]][];
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: ET_TZ, weekday: 'long', month: 'short', day: 'numeric' });
    const m = new Map<string, Slot[]>();
    for (const s of candidates) {
      const k = fmt.format(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return Array.from(m.entries());
  }, [candidates]);

  const timeFmt = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone: ET_TZ, hour: 'numeric', minute: '2-digit', hour12: true }), []);

  const sendInvite = async () => {
    if (!candidates || !selectedKey) { toast.error('Pick a time first.'); return; }
    const slot = candidates.find((c) => c.key === selectedKey);
    if (!slot) return;
    setSending(true);
    try {
      let descWithConf = description;
      if (conferencing === 'zoom' && !zoomConnected) {
        toast.error('Connect Zoom in Settings → Integrations first.');
        setSending(false);
        return;
      }
      let zoomMeta: { join_url?: string; meeting_id?: string; passcode?: string } | null = null;
      if (conferencing === 'zoom' && zoomConnected) {
        try {
          const { data, error: zErr } = await supabase.functions.invoke('zoom-create-meeting', {
            body: { topic: title, start_iso: slot.start.toISOString(), duration_min: duration },
          });
          if (zErr || data?.error) throw new Error(zErr?.message || data?.error || 'Zoom create failed');
          zoomMeta = data;
          descWithConf = `Join Zoom: ${data.join_url}\nMeeting ID: ${data.meeting_id}${data.passcode ? `\nPasscode: ${data.passcode}` : ''}\n\n${description}`;
        } catch (err: any) {
          console.error('[FindATime] zoom create failed:', err?.message);
          toast.error('Zoom meeting creation failed — sending invite without Zoom link.');
        }
      }
      const { data, error: e } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'create',
          calendar_id: 'primary',
          event_data: {
            summary: title,
            description: descWithConf,
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
            attendees: (attendees || []).filter((a) => a.email),
            add_meet_link: conferencing === 'google_meet',
          },
          timezone: ET_TZ,
        },
      });
      if (e) { console.error('[FindATime] create failed:', e.message); throw e; }
      if (data?.error) { console.error('[FindATime] create error payload:', data.error); throw new Error(data.error); }

      // Persist as a booked slot
      if (user) {
        await supabase.from('naitive_proposed_slots').insert({
          user_id: user.id,
          recipient_email: attendees?.[0]?.email || null,
          recipient_emails: (attendees || []).map((a) => a.email).filter(Boolean),
          deal_id: dealId || null,
          meeting_id: meetingId || null,
          slot_start: slot.start.toISOString(),
          slot_end: slot.end.toISOString(),
          timezone: ET_TZ,
          status: 'booked',
          conferencing_provider: conferencing === 'none' ? null : conferencing,
          conferencing_meeting_id: zoomMeta?.meeting_id || null,
        });
      }

      toast.success(`Invite sent for ${fmtET(slot)}`);
      onScheduled?.(data?.event?.id || null);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Could not send invite: ' + (err?.message || 'unknown error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" /> Find a time
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick from your free slots and send the calendar invite directly. {(attendees?.length || 0) > 0 ? `${attendees!.length} attendee${attendees!.length === 1 ? '' : 's'}.` : 'No attendees seeded.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 overflow-hidden">
          {/* LEFT — controls + meta */}
          <div className="border-r p-5 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs">Meeting title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Days ahead (weekdays)</Label>
                <Input type="number" min={1} max={21} value={daysAhead}
                  onChange={(e) => setDaysAhead(Math.max(1, Math.min(21, Number(e.target.value) || 7)))}
                  className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[11px]">Duration</Label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                  {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Buffer between</Label>
                <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                  {BUFFERS.map((b) => <option key={b} value={b}>{b === 0 ? 'None' : `${b} min`}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[11px]">Conferencing</Label>
                <select
                  value={conferencing}
                  onChange={(e) => setConferencing(e.target.value as ConferencingProvider)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="google_meet">Google Meet</option>
                  <option value="zoom" disabled={!zoomConnected}>
                    Zoom{!zoomConnected ? ' (connect in Settings)' : ''}
                  </option>
                  <option value="teams" disabled>Microsoft Teams (coming soon)</option>
                  <option value="phone">Phone</option>
                  <option value="none">None / In-person</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Working hours: {workHours[0]}:00–{workHours[1]}:00 ET</Label>
              <div className="pt-2">
                <Slider min={6} max={22} step={1} value={workHours}
                  onValueChange={(v) => setWorkHours([v[0], Math.max(v[1], v[0] + 1)] as [number, number])} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-xs" />
            </div>
            {gcalConnected === false && (
              <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-700 dark:text-yellow-300 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Connect Google Calendar in Settings → Integrations to find free slots.
              </div>
            )}
            <Button type="button" size="sm" className="w-full h-9 text-xs" disabled={loading || gcalConnected === false} onClick={loadAvailability}>
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {candidates ? 'Recompute slots' : 'Find free slots'}
            </Button>
          </div>

          {/* RIGHT — slot list */}
          <div className="p-5 overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Free slots</div>
            {loading && (
              <div className="space-y-1.5">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            )}
            {!loading && error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive space-y-1.5">
                <div className="flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5" /><div>{error}</div></div>
                <Button type="button" size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={loadAvailability}>
                  <RefreshCw className="h-3 w-3" /> Retry
                </Button>
              </div>
            )}
            {!loading && !error && candidates && candidates.length === 0 && (
              <div className="text-[11px] text-muted-foreground">No mutually free slots in this window. Try widening the date range or working hours.</div>
            )}
            {!loading && candidates && candidates.length > 0 && (
              <div className="space-y-3">
                {grouped.map(([day, slots]) => (
                  <div key={day}>
                    <div className="text-[10px] font-medium uppercase text-muted-foreground mb-1">{day}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map((s) => {
                        const sel = selectedKey === s.key;
                        return (
                          <button
                            key={s.key} type="button" onClick={() => setSelectedKey(s.key)}
                            className={'text-[11px] px-2 py-1 rounded border transition-colors ' +
                              (sel ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-accent')}
                          >
                            {sel && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                            {timeFmt.format(s.start).replace(' ', '')}–{timeFmt.format(s.end).replace(' ', '')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && !candidates && !error && (
              <div className="text-[11px] text-muted-foreground">Click "Find free slots" to see available times.</div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/30 sm:justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Video className="h-3 w-3" />
            {selectedKey && candidates ? fmtET(candidates.find((c) => c.key === selectedKey)!) : 'No time selected'}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
            <Button type="button" onClick={sendInvite} disabled={!selectedKey || sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Send invite
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
