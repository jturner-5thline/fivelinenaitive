/**
 * Central time-window helper for the Daily Briefing.
 * Computes the window from 5:00 PM ET the prior calendar day to "now" (for in-app)
 * or to 7:00 AM ET "today" (for the scheduled email).
 *
 * Handles DST correctly by using Intl to resolve the current ET offset.
 */

function getETOffsetMs(): number {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etStr);
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return etDate.getTime() - utcMs;
}

/** Convert a UTC Date to ET-local Date object (for display/comparison) */
export function toET(utc: Date): Date {
  return new Date(utc.getTime() + getETOffsetMs() + utc.getTimezoneOffset() * 60_000);
}

/** Get "now" in ET */
export function nowET(): Date {
  return toET(new Date());
}

/**
 * Build the briefing window as UTC ISO strings suitable for DB queries.
 *
 * @param mode
 *  - 'interactive': start = yesterday 5 PM ET, end = now
 *  - 'email':       start = yesterday 5 PM ET, end = today 7 AM ET
 */
export function getDailyBriefingWindow(mode: 'interactive' | 'email' = 'interactive'): {
  startISO: string;
  endISO: string;
  label: string;
} {
  const offsetMs = getETOffsetMs();
  const now = new Date();
  const etNow = toET(now);

  // Yesterday's date in ET
  const yesterdayET = new Date(etNow);
  yesterdayET.setDate(yesterdayET.getDate() - 1);

  // 5 PM ET yesterday → UTC
  const startET = new Date(
    yesterdayET.getFullYear(),
    yesterdayET.getMonth(),
    yesterdayET.getDate(),
    17, 0, 0, 0,
  );
  // Convert ET-local back to UTC: subtract the offset
  const startUTC = new Date(startET.getTime() - offsetMs - startET.getTimezoneOffset() * 60_000);

  let endUTC: Date;
  if (mode === 'email') {
    // 7 AM ET today → UTC
    const endET = new Date(
      etNow.getFullYear(),
      etNow.getMonth(),
      etNow.getDate(),
      7, 0, 0, 0,
    );
    endUTC = new Date(endET.getTime() - offsetMs - endET.getTimezoneOffset() * 60_000);
  } else {
    endUTC = now;
  }

  return {
    startISO: startUTC.toISOString(),
    endISO: endUTC.toISOString(),
    label: `Since 5 PM ET yesterday`,
  };
}
