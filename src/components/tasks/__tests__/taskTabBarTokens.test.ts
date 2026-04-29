import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guard for the TaskTabBar alignment restyle (item 9).
 *
 * Pins: 28px (h-7) tab buttons, count-badge min-width + tabular-nums,
 * h-7 "+" trigger, and removal of the `ml-[-4px]` negative-margin hack.
 */
describe('TaskTabBar.tsx alignment contract', () => {
  const source = readFileSync(
    resolve(__dirname, '../TaskTabBar.tsx'),
    'utf8',
  );

  it('uses h-7 for tab buttons (single centerline with chip row)', () => {
    expect(source).toMatch(/h-7 text-\[11px\] font-medium rounded-md/);
  });

  it('count badge has fixed min-width and tabular-nums', () => {
    expect(source).toMatch(/min-w-\[20px\][\s\S]{0,80}tabular-nums/);
  });

  it('does not use the legacy negative-margin overlap on the kebab', () => {
    expect(source).not.toMatch(/ml-\[-4px\]/);
  });

  it('"+" create-tab button is a square h-7 control', () => {
    expect(source).toMatch(/h-7 w-7[\s\S]{0,80}rounded-md/);
  });
});