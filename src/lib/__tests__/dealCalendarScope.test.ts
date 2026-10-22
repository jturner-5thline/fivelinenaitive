import { describe, expect, it } from 'vitest';
import { calendarEventKey, calendarOwnerIds } from '../../../supabase/functions/deal-team-calendar-events/calendarScope';

describe('deal calendar scope', () => {
  it('includes every company member, not an email-domain allowlist', () => {
    expect(calendarOwnerIds([{ user_id: 'caller' }, { user_id: 'teammate' }, { user_id: 'teammate' }], 'caller')).toEqual(['caller', 'teammate']);
  });
  it('denies a caller outside the deal company', () => {
    expect(calendarOwnerIds([{ user_id: 'other-tenant' }], 'caller')).toEqual([]);
  });
  it('deduplicates shared events without collapsing recurring occurrences', () => {
    const a = calendarEventKey({ id: 'owner-a-id', ical_uid: 'shared' }, '2026-10-21T12:00:00Z');
    expect(calendarEventKey({ id: 'owner-b-id', ical_uid: 'shared' }, '2026-10-21T12:00:00Z')).toBe(a);
    expect(calendarEventKey({ ical_uid: 'shared' }, '2026-10-22T12:00:00Z')).not.toBe(a);
  });
});