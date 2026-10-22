/** Calendar owners must belong to the deal's tenant, regardless of email domain. */
export function calendarOwnerIds(members: Array<{ user_id: string }>, callerId: string): string[] {
  const ids = [...new Set(members.map((member) => member.user_id))];
  return ids.includes(callerId) ? ids : [];
}

/** Preserve recurring occurrences while collapsing copies across calendars. */
export function calendarEventKey(event: { id?: string; ical_uid?: string; title?: string }, start: string): string {
  return `${event.ical_uid || event.id || event.title || ''}:${start}`;
}

/** A provider failure must not discard successful teammates' results. */
export async function collectCalendarResults<T>(reads: Array<Promise<T[]>>) {
  const results = await Promise.allSettled(reads);
  const events: T[] = [];
  let failedCalendars = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') events.push(...result.value);
    else failedCalendars += 1;
  }
  return { events, failedCalendars, partial: failedCalendars > 0 };
}