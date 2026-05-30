import { describe, it, expect } from 'vitest';
import { asStringArray, formatActionItem, stripClaapTimestamps } from './claap';

describe('claap formatters', () => {
  it('formatActionItem renders {text, assignee, due}', () => {
    expect(
      formatActionItem({ text: 'Send NDA to Shimmy', assignee: 'James', due: '2026-06-01' }),
    ).toBe('- Send NDA to Shimmy (@James) — due 2026-06-01');
  });

  it('formatActionItem renders {content, owner, deadline}', () => {
    expect(
      formatActionItem({ content: 'Follow up', owner: 'Flora', deadline: 'next week' }),
    ).toBe('- Follow up (@Flora) — due next week');
  });

  it('formatActionItem accepts plain strings', () => {
    expect(formatActionItem('Pick a date')).toBe('- Pick a date');
  });

  it('formatActionItem returns null for unknown shapes', () => {
    expect(formatActionItem({ foo: 'bar' })).toBeNull();
    expect(formatActionItem(null)).toBeNull();
  });

  it('stripClaapTimestamps removes %[mm:ss]() and %[hh:mm:ss]() markers', () => {
    const raw = 'Shimmy joined %[00:43]() and discussed deals %[01:23:45]().';
    expect(stripClaapTimestamps(raw)).toBe('Shimmy joined and discussed deals .'.replace(/\s+\./g, '.'));
  });

  it('asStringArray normalizes mixed object+string entries and strips timestamps', () => {
    const out = asStringArray([
      { text: 'James to send NDA %[16:03]()' } as never,
      'Plain item %[01:02]()' as never,
      { foo: 'bar' } as never,
    ]);
    expect(out).toEqual(['James to send NDA', 'Plain item']);
  });
});