import { describe, it, expect } from 'vitest';
import {
  agendaPersistSchema,
  isSeedContent,
  previousPeriodKey,
} from '../AgendaEditor';

const SEED = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Presentation' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Looking Forward' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'New Items' }] },
    { type: 'paragraph' },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Prep' }] },
    { type: 'paragraph' },
  ],
};

describe('agendaPersistSchema', () => {
  it('accepts valid month keys', () => {
    const r = agendaPersistSchema.safeParse({ period_type: 'month', period_key: '2026-04', content_json: {} });
    expect(r.success).toBe(true);
  });
  it('accepts valid quarter keys', () => {
    const r = agendaPersistSchema.safeParse({ period_type: 'quarter', period_key: '2026-Q2', content_json: {} });
    expect(r.success).toBe(true);
  });
  it('rejects malformed month keys', () => {
    for (const k of ['2026-4', '2026-13', '26-04', '2026-00', 'foo']) {
      const r = agendaPersistSchema.safeParse({ period_type: 'month', period_key: k, content_json: {} });
      expect(r.success).toBe(false);
    }
  });
  it('rejects malformed quarter keys', () => {
    for (const k of ['2026-Q5', '2026-Q0', '2026-q1', '2026-04']) {
      const r = agendaPersistSchema.safeParse({ period_type: 'quarter', period_key: k, content_json: {} });
      expect(r.success).toBe(false);
    }
  });
  it('rejects period_type/period_key mismatches', () => {
    const r = agendaPersistSchema.safeParse({ period_type: 'quarter', period_key: '2026-04', content_json: {} });
    expect(r.success).toBe(false);
  });
});

describe('isSeedContent', () => {
  it('returns true for the seeded 4-heading doc', () => {
    expect(isSeedContent(SEED)).toBe(true);
  });
  it('returns false when a paragraph has user text', () => {
    const dirty = JSON.parse(JSON.stringify(SEED));
    dirty.content[1] = { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] };
    expect(isSeedContent(dirty)).toBe(false);
  });
  it('returns false when headings differ', () => {
    const altered = JSON.parse(JSON.stringify(SEED));
    altered.content[0].content[0].text = 'Different';
    expect(isSeedContent(altered)).toBe(false);
  });
  it('treats empty / malformed doc as seed', () => {
    expect(isSeedContent(null)).toBe(true);
    expect(isSeedContent({})).toBe(true);
  });
});

describe('previousPeriodKey', () => {
  it('subtracts a month', () => {
    expect(previousPeriodKey('month', '2026-04')).toBe('2026-03');
  });
  it('handles January → previous December (year rollover)', () => {
    expect(previousPeriodKey('month', '2026-01')).toBe('2025-12');
  });
  it('subtracts a quarter', () => {
    expect(previousPeriodKey('quarter', '2026-Q2')).toBe('2026-Q1');
  });
  it('handles Q1 → previous Q4 (year rollover)', () => {
    expect(previousPeriodKey('quarter', '2026-Q1')).toBe('2025-Q4');
  });
  it('returns null for malformed input', () => {
    expect(previousPeriodKey('month', 'foo')).toBeNull();
    expect(previousPeriodKey('quarter', '2026-13')).toBeNull();
  });
});