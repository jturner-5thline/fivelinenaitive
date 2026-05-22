import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const ET_TZ = 'America/New_York';

export interface Slot { start: Date; end: Date; key: string }

export interface UseFreeSlotsOptions {
  enabled: boolean;
  daysAhead: number;
  duration: number;
  buffer: number;
  startHour: number;
  endHour: number;
  /** Teammate user_ids to overlay busy from (optional). */
  teammateIds?: string[];
  /** Group slot list by day in this tz. Defaults to ET. */
  tz?: string;
  logPrefix?: string;
}

export function buildCandidates(opts: {
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

/** Shared hook powering Insert Availability popover + Find-a-time dialog. */
export function useFreeSlots(opts: UseFreeSlotsOptions) {
  const { enabled, daysAhead, duration, buffer, startHour, endHour, teammateIds, tz = ET_TZ, logPrefix = '[FreeSlots]' } = opts;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Slot[] | null>(null);
  const [gcalChecked, setGcalChecked] = useState(false);
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [teammateConnState, setTeammateConnState] = useState<Record<string, boolean>>({});

  // Gcal probe
  useEffect(() => {
    if (!enabled || gcalChecked) return;
    let cancel = false;
    (async () => {
      try {
        const now = new Date();
        const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
        const { data, error: e } = await supabase.functions.invoke('calendar-events', {
          body: { action: 'list', calendar_id: 'primary', time_min: now.toISOString(), time_max: horizon.toISOString(), max_results: 1 },
        });
        if (cancel) return;
        if (e || data?.error) {
          console.error(`${logPrefix} gcal probe failed:`, e?.message || data?.error);
          setGcalConnected(false);
        } else setGcalConnected(true);
      } catch (err: any) {
        if (!cancel) setGcalConnected(false);
        console.error(`${logPrefix} gcal probe threw:`, err?.message || err);
      } finally {
        if (!cancel) setGcalChecked(true);
      }
    })();
    return () => { cancel = true; };
  }, [enabled, gcalChecked, logPrefix]);

  const reset = useCallback(() => {
    setCandidates(null);
    setError(null);
    setGcalChecked(false);
    setGcalConnected(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const now = new Date();
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + Math.max(daysAhead * 2, 14));
      const { data, error: fnErr } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'list', calendar_id: 'primary',
          time_min: now.toISOString(), time_max: horizon.toISOString(), max_results: 200,
        },
      });
      if (fnErr) { console.error(`${logPrefix} calendar-events failed:`, fnErr.message || fnErr); throw fnErr; }
      if (data?.error) { console.error(`${logPrefix} calendar-events payload error:`, data.error); throw new Error(data.error); }
      const events = (data?.events || []) as Array<{ start: string; end: string; all_day?: boolean }>;
      const busy = events
        .filter((e) => e.start && e.end && !e.all_day)
        .map((e) => ({ start: new Date(e.start), end: new Date(e.end) }));

      const connState: Record<string, boolean> = {};
      if (teammateIds && teammateIds.length > 0) {
        const { data: tmData, error: tmErr } = await supabase.functions.invoke('teammates-availability', {
          body: { user_ids: teammateIds, time_min: now.toISOString(), time_max: horizon.toISOString() },
        });
        if (tmErr) {
          console.error(`${logPrefix} teammate overlay failed:`, tmErr.message);
        } else {
          const tms = (tmData?.teammates || []) as Array<{ user_id: string; connected: boolean; busy: { start: string; end: string }[] }>;
          for (const tm of tms) {
            connState[tm.user_id] = tm.connected;
            if (tm.connected) for (const b of tm.busy) busy.push({ start: new Date(b.start), end: new Date(b.end) });
          }
        }
      }
      setTeammateConnState(connState);

      const all = buildCandidates({ daysAhead, startHour, endHour, durationMin: duration, bufferMin: buffer });
      const free = filterBusy(all, busy, buffer);
      setCandidates(free);
      if (free.length === 0) console.warn(`${logPrefix} zero free slots for window`);
    } catch (e: any) {
      const msg = e?.message || 'Could not load calendar availability.';
      console.error(`${logPrefix} load failed:`, msg);
      const lower = msg.toLowerCase();
      if (lower.includes('not connected') || lower.includes('token') || lower.includes('unauthorized')) {
        setGcalConnected(false);
        setError('Connect Google Calendar in Settings → Integrations to use this feature.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [daysAhead, duration, buffer, startHour, endHour, teammateIds, logPrefix]);

  const grouped = useMemo<[string, Slot[]][]>(() => {
    if (!candidates) return [];
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' });
    const m = new Map<string, Slot[]>();
    for (const s of candidates) {
      const k = fmt.format(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return Array.from(m.entries());
  }, [candidates, tz]);

  return { loading, error, candidates, grouped, gcalConnected, teammateConnState, load, reset };
}

export function formatSlotLineET(s: Slot): string {
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