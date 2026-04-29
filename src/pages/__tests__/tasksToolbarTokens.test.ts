import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the /tasks toolbar restyle (items 8, 10–12).
 *
 * Locks in:
 *  - unified filter chip row: gap-1.5, items-center, flex-wrap
 *  - Add Task button no longer uses the inline gradient outlier
 *  - header row aligned on items-center (not items-end)
 *  - Save preset button promoted to h-7 (matches chip row centerline)
 *  - scope-tab counter pills use tabular-nums + min-w
 */
describe('Tasks.tsx toolbar contract', () => {
  const source = readFileSync(
    resolve(__dirname, '../Tasks.tsx'),
    'utf8',
  );

  it('filter chip row uses gap-1.5 + items-center + flex-wrap', () => {
    expect(source).toMatch(
      /flex items-center gap-1\.5 px-6 py-2\.5 border-y flex-wrap/,
    );
  });

  it('Add Task button no longer uses the inline blue gradient', () => {
    expect(source).not.toMatch(
      /linear-gradient\(180deg, rgba\(126,184,247,0\.22\)/,
    );
  });

  it('page header is centered on a single horizontal centerline', () => {
    expect(source).toMatch(
      /flex items-center justify-between px-6 pt-5 pb-3 min-w-0 gap-4 flex-nowrap/,
    );
  });

  it('Save preset button is h-7 (matches chip row)', () => {
    expect(source).toMatch(
      /flex items-center gap-1\.5 h-7 px-2\.5 text-\[11px\] font-medium rounded-md transition-colors hover:bg-\[rgba\(255,255,255,0\.04\)\]/,
    );
  });

  it('scope-tab count pills use tabular-nums and a min-width', () => {
    expect(source).toMatch(/tabular-nums min-w-\[20px\] text-center/);
  });
});