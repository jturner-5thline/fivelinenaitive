import { calendarEventKey, calendarOwnerIds, collectCalendarResults } from './calendarScope.ts';

Deno.test('provider timeouts return partial meetings rather than a rejected request', async () => {
  const result = await collectCalendarResults([Promise.resolve(['real-meeting']), Promise.reject(new DOMException('Signal timed out.', 'TimeoutError'))]);
  if (result.events.join() !== 'real-meeting' || result.failedCalendars !== 1 || !result.partial) throw new Error('Lost successful meetings');
});

Deno.test('calendar scope includes company teammates and rejects outsiders', () => {
  const members = [{ user_id: 'caller' }, { user_id: 'teammate' }];
  if (calendarOwnerIds(members, 'caller').length !== 2) throw new Error('Missing teammate');
  if (calendarOwnerIds(members, 'outsider').length !== 0) throw new Error('Tenant leak');
});

Deno.test('shared recurring meeting occurrences remain distinct', () => {
  const event = { ical_uid: 'same-invite' };
  if (calendarEventKey(event, '2026-10-21') === calendarEventKey(event, '2026-10-22')) {
    throw new Error('Collapsed recurring events');
  }
});