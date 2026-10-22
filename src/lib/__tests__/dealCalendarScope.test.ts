import { describe, expect, it } from 'vitest';
import { calendarEventKey, calendarOwnerIds, collectCalendarResults } from '../../../supabase/functions/deal-team-calendar-events/calendarScope';

describe('deal calendar scope', () => {
  it('keeps successful meetings when a teammate times out', async () => {
    const result = await collectCalendarResults([Promise.resolve(['meeting']), Promise.reject(new DOMException('Signal timed out.', 'TimeoutError'))]);
    expect(result).toEqual({ events: ['meeting'], failedCalendars: 1, partial: true });
  });
  it('reports all calendars unavailable without rejecting the request', async () => {
    const result = await collectCalendarResults([Promise.reject(new Error('Provider offline'))]);
    expect(result).toEqual({ events: [], failedCalendars: 1, partial: true });
  });
  it('does not report partial data for healthy calendars', async () => {
    expect(await collectCalendarResults([Promise.resolve(['a']), Promise.resolve(['b'])])).toEqual({ events: ['a', 'b'], failedCalendars: 0, partial: false });
  });
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