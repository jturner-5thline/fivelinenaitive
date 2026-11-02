import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fourYearStart, inWindow, parsePage, retryAt } from './policy.ts';
Deno.test('history starts exactly four calendar years ago', () => {
  assertEquals(fourYearStart(new Date('2026-11-02T01:29:00Z')), '2022-11-02T01:29:00.000Z');
});
Deno.test('history excludes recordings outside the fixed window', () => {
  assertEquals(inWindow('2022-11-01T00:00:00Z', '2022-11-02', '2026-11-02'), false);
  assertEquals(inWindow('2024-01-01T00:00:00Z', '2022-11-02', '2026-11-02'), true);
  assertEquals(inWindow(null, '2022-11-02', '2026-11-02'), false);
});
Deno.test('pagination supports provider response shapes and rejects invalid pages', () => {
  assertEquals(parsePage({ result: { recordings: [{ id: 'a' }], pagination: { nextCursor: 'b' } } }).cursor, 'b');
  assertEquals(parsePage({ recordings: [], pagination: {} }).cursor, null);
  assertThrows(() => parsePage({ error: 'unavailable' }));
});
Deno.test('retries are bounded and resume after failures', () => {
  assertEquals(retryAt(1, new Date('2026-11-02T00:00:00Z')), '2026-11-02T02:00:00.000Z');
  assertEquals(retryAt(20, new Date('2026-11-02T00:00:00Z')), '2026-11-03T00:00:00.000Z');
});