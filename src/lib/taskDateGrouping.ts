/**
 * Timezone-aware due-date helpers for the Tasks suite.
 *
 * `due_date` in the database is a calendar date (DATE column) but at the API
 * boundary it can arrive as either:
 *   - "YYYY-MM-DD"
 *   - a full ISO timestamp like "2026-04-28T00:00:00+00:00"
 *
 * All grouping/labelling must happen in the *viewer's local timezone* — a task
 * "due today" should mean today on the user's wall clock, not UTC. These
 * helpers normalise both representations to a local calendar-date string and
 * provide consistent boundary checks (overdue / today / tomorrow / this week /
 * upcoming) that all share the same `today` reference per render.
 */

/** Returns the local YYYY-MM-DD for a given Date (wall-clock, not UTC). */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalise a stored due_date value to a local YYYY-MM-DD calendar string.
 * Returns null when the value is missing or unparseable.
 */
export function normalizeDueDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Pure date string already – use as-is, no timezone shift.
  const dateOnlyMatch = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (dateOnlyMatch && value.length === 10) return dateOnlyMatch[1];
  // Full ISO timestamp – take the calendar day in the viewer's local TZ.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    // Last-resort fallback: take the leading YYYY-MM-DD if present.
    return dateOnlyMatch ? dateOnlyMatch[1] : null;
  }
  return toLocalDateStr(parsed);
}

export type DueBucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'upcoming'
  | 'no_date';

export interface DueBoundaries {
  /** Local YYYY-MM-DD for today. */
  today: string;
  /** Local YYYY-MM-DD for tomorrow. */
  tomorrow: string;
  /**
   * Local YYYY-MM-DD for the *last* day still considered "this week".
   * Inclusive. Defaults to a rolling 7-day window starting today.
   */
  weekEnd: string;
}

/** Build a single set of date boundaries for the current render. */
export function buildDueBoundaries(now: Date = new Date()): DueBoundaries {
  const today = toLocalDateStr(now);
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const weekEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  return {
    today,
    tomorrow: toLocalDateStr(tomorrowDate),
    weekEnd: toLocalDateStr(weekEndDate),
  };
}

/**
 * Bucket a due_date string against shared boundaries. All comparisons are
 * lexicographic on YYYY-MM-DD strings, which is correct and timezone-safe
 * because each input has already been normalised to the viewer's local day.
 */
export function bucketDueDate(
  dueDate: string | null | undefined,
  boundaries: DueBoundaries,
): DueBucket {
  const due = normalizeDueDate(dueDate);
  if (!due) return 'no_date';
  if (due < boundaries.today) return 'overdue';
  if (due === boundaries.today) return 'today';
  if (due === boundaries.tomorrow) return 'tomorrow';
  if (due <= boundaries.weekEnd) return 'this_week';
  return 'upcoming';
}

export function isOverdue(dueDate: string | null | undefined, status: string, boundaries: DueBoundaries): boolean {
  if (status === 'complete') return false;
  const due = normalizeDueDate(dueDate);
  return !!due && due < boundaries.today;
}

export function isDueToday(dueDate: string | null | undefined, boundaries: DueBoundaries): boolean {
  return normalizeDueDate(dueDate) === boundaries.today;
}

/** Whole-day difference (positive = future, negative = past). */
export function daysFromToday(dueDate: string | null | undefined, boundaries: DueBoundaries): number | null {
  const due = normalizeDueDate(dueDate);
  if (!due) return null;
  const [y1, m1, d1] = boundaries.today.split('-').map(Number);
  const [y2, m2, d2] = due.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}
