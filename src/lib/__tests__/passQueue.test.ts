import { describe, it, expect } from 'vitest';
import { passQueueView } from '../passQueue';

const row = (o: any) => ({ id: o.id, gmail_message_id: o.m, sender_email: o.s, deal_lender_id: o.dl ?? null, is_pass: o.p ?? true, status: 'pending', created_at: o.t ?? '2026-05-19', lender_name: o.n });
const rows = [
  row({ id: '1', m: 'a', s: 'michael@matterhorncp.com', n: 'Michael Puskar', t: '2026-05-19T01' }),
  row({ id: '2', m: 'a', s: 'michael@matterhorncp.com', dl: 'x', n: 'Matterhorn', t: '2026-05-19T02' }),
  row({ id: '3', m: 'b', s: 'nheikali@5thline.co', dl: 'y', n: 'Montage Capital' }),
  row({ id: '4', m: 'c', s: 'jturner@5thline.co', n: 'James' }),
  row({ id: '5', m: 'd', s: 'notifications@asana.com', n: 'Asana' }),
  row({ id: '6', m: 'e', s: 'ian@eastwardcp.com', p: false, n: 'Eastward' }),
];

describe('pass queue view', () => {
  it('shows likely lender-side passes once per message, preferring the matched lender', () => {
    const v = passQueueView(rows, false);
    expect(v.map((r) => r.id).sort()).toEqual(['2', '3']);
    expect(v.find((r) => r.id === '2')!.duplicate_count).toBe(2);
  });
  it('show all returns every row', () => {
    expect(passQueueView(rows, true)).toHaveLength(6);
  });
});
