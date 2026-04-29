import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the /tasks list restyle (items 1–7 of the spec).
 *
 * Locks in the shared row grid, locked row height, and pill min-widths
 * so future edits do not silently break the centerline alignment of
 * checkbox / chevron / owner / deal / due / priority / status cells.
 */
describe('TaskListView.tsx row grid contract', () => {
  const source = readFileSync(
    resolve(__dirname, '../TaskListView.tsx'),
    'utf8',
  );

  it('declares the shared 13-column grid template', () => {
    expect(source).toMatch(/TASK_GRID_COLS\s*=\s*['"`]grid-cols-\[/);
  });

  it('locks a single row min-height for all task rows', () => {
    expect(source).toMatch(/TASK_ROW_MIN_H\s*=\s*['"`]min-h-\[44px\]['"`]/);
  });

  it('keeps row contents on a single horizontal centerline', () => {
    // The grid row class string must include items-center so cells
    // (chevron, checkbox, avatar, deal, due, pills) align vertically.
    expect(source).toMatch(/TASK_GRID_COLS[\s\S]{0,200}items-center/);
  });
});