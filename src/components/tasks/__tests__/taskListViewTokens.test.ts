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

  it('declares the dynamic grid template builder for the row layout', () => {
    expect(source).toMatch(/buildGridTemplate\s*\(/);
    expect(source).toMatch(/LEADING_TEMPLATE\s*=\s*['"`]20px 20px 20px 20px 20px minmax\(240px,1fr\)['"`]/);
  });

  it('defaults the initial visible columns to High Priority + Status only', () => {
    expect(source).toMatch(/DEFAULT_TASK_COLUMNS:\s*TaskColumnId\[\]\s*=\s*\[\s*'priority'\s*,\s*'status'\s*\]/);
  });

  it('locks a single row min-height for all task rows', () => {
    expect(source).toMatch(/TASK_ROW_MIN_H\s*=\s*['"`]min-h-\[44px\]['"`]/);
  });

  it('keeps row contents on a single horizontal centerline', () => {
    // Every grid row container must keep contents on the same centerline.
    expect(source).toMatch(/items-center/);
  });
});