/** Calendar owners must belong to the deal's tenant, regardless of email domain. */
export function calendarOwnerIds(members: Array<{ user_id: string }>, callerId: string): string[] {
  const ids = [...new Set(members.map((member) => member.user_id))];
  return ids.includes(callerId) ? ids : [];
}

/** Preserve recurring occurrences while collapsing copies across calendars. */
export function calendarEventKey(event: { id?: string; ical_uid?: string; title?: string }, start: string): string {
  return `${event.ical_uid || event.id || event.title || ''}:${start}`;
}