/**
 * generateSlots — pure helper that takes a list of busy intervals plus
 * scheduling constraints and returns N candidate meeting slots.
 *
 * All times are handled as plain Date instances in the caller's local
 * runtime; callers are responsible for picking the right anchor day in
 * the user's chosen TZ.
 */
export interface BusyBlock {
  start: Date;
  end: Date;
}

export interface GenerateSlotsInput {
  /** Inclusive start of the search window (e.g. tomorrow 00:00). */
  windowStart: Date;
  /** How many business days to search. */
  businessDays: number;
  /** Working hours, e.g. "09:00" / "17:00" applied per local day. */
  workingHoursStart: string;
  workingHoursEnd: string;
  /** Meeting length in minutes. */
  durationMin: number;
  /** Min minutes of breathing room before & after each slot. */
  bufferMin: number;
  /** Skip candidates that touch another meeting (front or back). */
  avoidBackToBack: boolean;
  /** Drop candidates that would leave a free remainder < 60min. */
  focusFriendly: boolean;
  /** Already-busy intervals (Google Calendar freebusy). */
  busy: BusyBlock[];
  /** How many slots to return at most. */
  maxSlots: number;
}

export interface Slot { start: Date; end: Date }

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map((n) => parseInt(n, 10));
  return { h: isFinite(h) ? h : 9, m: isFinite(m) ? m : 0 };
}

function atHM(day: Date, hm: string): Date {
  const { h, m } = parseHM(hm);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

function isBusinessDay(d: Date): boolean {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const {
    windowStart, businessDays, workingHoursStart, workingHoursEnd,
    durationMin, bufferMin, avoidBackToBack, focusFriendly, busy, maxSlots,
  } = input;

  const sortedBusy = [...busy]
    .filter((b) => b.end > b.start)
    // Drop "all-day" / multi-day busy blocks (e.g. OOO, working-location,
    // tentative all-day events). Nylas free-busy returns these as a single
    // 24h+ block aligned to local midnight, which would otherwise nuke an
    // entire day of candidates even though the user is actually free for
    // meetings. A real meeting will never be >= 20h long.
    .filter((b) => b.end.getTime() - b.start.getTime() < 20 * 60 * 60_000)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const candidatesByDay: Slot[][] = [];
  let collected = 0;
  const cursor = new Date(windowStart);
  cursor.setHours(0, 0, 0, 0);

  while (collected < businessDays) {
    if (isBusinessDay(cursor)) {
      const dayStart = atHM(cursor, workingHoursStart);
      const dayEnd = atHM(cursor, workingHoursEnd);
      const todayCandidates: Slot[] = [];

      // Walk in 30-minute increments to keep alignment friendly and avoid
      // returning near-duplicate adjacent half-hour offsets.
      const stepMs = 30 * 60_000;
      const durMs = durationMin * 60_000;
      const bufMs = bufferMin * 60_000;

      for (
        let t = dayStart.getTime();
        t + durMs <= dayEnd.getTime();
        t += stepMs
      ) {
        const sStart = new Date(t);
        const sEnd = new Date(t + durMs);

        // Skip if it overlaps a busy block (with buffer if avoid back-to-back).
        const pad = avoidBackToBack ? bufMs : 0;
        const hits = sortedBusy.some((b) =>
          overlaps(
            new Date(sStart.getTime() - pad),
            new Date(sEnd.getTime() + pad),
            b.start,
            b.end,
          ),
        );
        if (hits) continue;

        if (focusFriendly) {
          // Find enclosing free block within working hours and ensure remainder >= 60min.
          const prevBusyEnd = sortedBusy
            .filter((b) => b.end <= sStart)
            .reduce<Date>((acc, b) => (b.end > acc ? b.end : acc), dayStart);
          const nextBusyStart = sortedBusy
            .filter((b) => b.start >= sEnd)
            .reduce<Date>((acc, b) => (b.start < acc ? b.start : acc), dayEnd);
          const beforeFree = sStart.getTime() - prevBusyEnd.getTime();
          const afterFree = nextBusyStart.getTime() - sEnd.getTime();
          // remainder = total free block minus this slot
          const totalFree = beforeFree + durMs + afterFree;
          if (totalFree - durMs < 60 * 60_000 && totalFree > durMs) continue;
        }

        // Skip slots in the past.
        if (sStart.getTime() < Date.now()) continue;

        todayCandidates.push({ start: sStart, end: sEnd });
      }

      candidatesByDay.push(todayCandidates);
      collected += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
    // Safety: don't loop forever
    if (cursor.getTime() - windowStart.getTime() > 60 * 24 * 60 * 60_000) break;
  }

  // Distribute picks across days AND across each day's open intervals so we
  // don't return "9 AM every day" when each day happens to have multiple
  // openings. Each day gets `perDay` evenly-spaced indices from its
  // candidate list, and consecutive days use staggered starting offsets so
  // the chosen times vary day-to-day instead of always landing at the
  // earliest opening.
  const numDays = candidatesByDay.length || 1;
  const perDay = Math.max(1, Math.ceil(maxSlots / numDays));
  const dayPicks: Slot[][] = candidatesByDay.map((day, dayIdx) => {
    if (day.length === 0) return [];
    if (day.length <= perDay) return day.slice();
    const out: Slot[] = [];
    const stride = day.length / perDay;
    // Rotate per-day starting offset so each day picks from a different
    // position within its candidate list. This prevents "9 AM every day"
    // when perDay === 1 (i.e. maxSlots === numDays), where every day
    // would otherwise land on index 0.
    const rotation = (dayIdx / numDays) * day.length;
    const seen = new Set<number>();
    for (let k = 0; k < perDay; k += 1) {
      const rawIdx = Math.floor(rotation + k * stride) % day.length;
      const idx = Math.min(day.length - 1, Math.max(0, rawIdx));
      if (seen.has(idx)) continue;
      seen.add(idx);
      out.push(day[idx]);
    }
    return out;
  });

  // Round-robin merge across days, preserving variety when we're slot-
  // constrained (e.g. maxSlots === numDays we still get different times).
  const picks: Slot[] = [];
  const usedKeys = new Set<number>();
  const pushPick = (s: Slot) => {
    const key = s.start.getTime();
    if (usedKeys.has(key)) return false;
    usedKeys.add(key);
    picks.push(s);
    return true;
  };
  let round = 0;
  while (picks.length < maxSlots) {
    let pickedThisRound = false;
    for (const day of dayPicks) {
      if (round < day.length && pushPick(day[round])) {
        pickedThisRound = true;
        if (picks.length >= maxSlots) break;
      }
    }
    if (!pickedThisRound) break;
    round += 1;
  }

  // Backfill: if many days were completely busy (or only a couple had any
  // openings), we'd otherwise return fewer than `maxSlots`. Pull additional
  // distinct, non-overlapping candidates from the full pool so the user
  // always sees up to N options when any availability exists.
  if (picks.length < maxSlots) {
    const minGapMs = Math.max(durationMin, 30) * 60_000;
    const flat = candidatesByDay
      .flat()
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    for (const cand of flat) {
      if (picks.length >= maxSlots) break;
      const t = cand.start.getTime();
      if (usedKeys.has(t)) continue;
      const tooClose = picks.some(
        (p) => Math.abs(p.start.getTime() - t) < minGapMs,
      );
      if (tooClose) continue;
      pushPick(cand);
    }
  }

  return picks.sort((a, b) => a.start.getTime() - b.start.getTime());
}