import { calendarEventKey, calendarOwnerIds } from './calendarScope.ts';

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