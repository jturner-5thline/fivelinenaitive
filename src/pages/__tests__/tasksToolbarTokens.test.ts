import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the /tasks Asana-style refresh.
 *
 * Locks in:
 *  - unified filter chip row preserved
 *  - header row aligned on items-center (not items-end)
 *  - filter pill counters use tabular-nums + min-w
 *  - secondary scope-tab row + custom view-tab bar were removed
 */
describe('Tasks.tsx toolbar contract', () => {
  const source = readFileSync(
    resolve(__dirname, '../Tasks.tsx'),
    'utf8',
  );

  it('filter row uses gap-1.5 + items-center + flex-wrap', () => {
    expect(source).toMatch(
      /flex items-center gap-1\.5 px-6 py-2\.5 border-y flex-wrap/,
    );
  });

  it('page header is centered on a single horizontal centerline', () => {
    expect(source).toMatch(
      /flex items-center justify-between px-6 pt-5 pb-3 min-w-0 gap-4 flex-nowrap/,
    );
  });

  it('count pills use tabular-nums and a min-width', () => {
    expect(source).toMatch(/tabular-nums min-w-\[20px\] text-center/);
  });

  it('removes the redundant scope-tab row (My / Deal / Personal / Completed)', () => {
    expect(source).not.toMatch(/Scope tabs row/);
  });

  it('removes the custom TaskTabBar usage', () => {
    expect(source).not.toMatch(/<TaskTabBar/);
  });
});