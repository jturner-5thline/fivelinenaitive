import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { nextRetryAt, suggestionIdFor } from './index.ts';

Deno.test('nextRetryAt grows exponentially and caps at the final bucket', () => {
  const t0 = new Date('2026-06-02T00:00:00Z');
  const t1 = nextRetryAt(1, t0).getTime() - t0.getTime();
  const t2 = nextRetryAt(2, t0).getTime() - t0.getTime();
  const t3 = nextRetryAt(3, t0).getTime() - t0.getTime();
  const t6 = nextRetryAt(6, t0).getTime() - t0.getTime();
  const t9 = nextRetryAt(9, t0).getTime() - t0.getTime();
  // strictly increasing in the first several buckets
  assertEquals(t1 < t2 && t2 < t3, true);
  // overflow attempts cap at the largest bucket
  assertEquals(t9, t6);
});

Deno.test('suggestionIdFor is stable for the same input (idempotency key)', () => {
  const a = suggestionIdFor('rec123', 'Send the term sheet to Bob', 0);
  const b = suggestionIdFor('rec123', 'Send the term sheet to Bob', 0);
  assertEquals(a, b);
});

Deno.test('suggestionIdFor differs by index so reordered items do not collide', () => {
  const a = suggestionIdFor('rec123', 'Send the term sheet to Bob', 0);
  const b = suggestionIdFor('rec123', 'Send the term sheet to Bob', 1);
  if (a === b) throw new Error('expected different ids for different indexes');
});