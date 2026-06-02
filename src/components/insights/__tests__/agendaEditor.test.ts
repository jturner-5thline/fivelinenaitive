import { describe, it, expect } from 'vitest';
import {
  agendaPersistSchema,
  isSeedContent,
  previousPeriodKey,
  SEED_SUBTITLE,
} from '../AgendaEditor';

const headingNode = (text: string) => ({
  type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }],
});
const subtitleNode = () => ({
  type: 'paragraph',
  content: [{
    type: 'text',
    marks: [
      { type: 'italic' },
      { type: 'textStyle', attrs: { fontSize: '13px', color: 'rgba(200,225,255,0.55)' } },
    ],
    text: SEED_SUBTITLE,
  }],
});
const SECTIONS = ['Presentation', 'Looking Forward', 'New Items', 'Prep'];
const SEED = {
  type: 'doc',
  content: SECTIONS.flatMap((s) => [headingNode(s), subtitleNode(), { type: 'paragraph' }]),
};
const LEGACY_SEED = {
  type: 'doc',
  content: SECTIONS.flatMap((s) => [headingNode(s), { type: 'paragraph' }]),
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
  it('seed subtitle text is the exact required string', () => {
    expect(SEED_SUBTITLE).toBe('(5-Minute Overview + Discussion & Q&A) - 12 Minutes Total Max');
    const subs = SEED.content.filter((n: any) =>
      n.type === 'paragraph' && n.content?.[0]?.text === SEED_SUBTITLE);
    expect(subs.length).toBe(4);
  });
  it('still treats the legacy headings-only seed as seed', () => {
    expect(isSeedContent(LEGACY_SEED)).toBe(true);
  });
  it('returns false when a paragraph has user text', () => {
    const dirty = JSON.parse(JSON.stringify(SEED));
    dirty.content[2] = { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] };
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