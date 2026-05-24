import { describe, it, expect } from 'vitest';
import { sanitizeStatusSuggestion } from '../staleNoteSanitize';

describe('sanitizeStatusSuggestion', () => {
  it('strips "Topic:" prefix', () => {
    const r = sanitizeStatusSuggestion('Topic: Submitted to Advantage and Eastward.');
    expect(r.text.startsWith('Topic:')).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('strips leading bullets', () => {
    const r = sanitizeStatusSuggestion('- Awaiting Eastward reply.');
    expect(r.text.startsWith('-')).toBe(false);
  });

  it('strips signature blocks', () => {
    const r = sanitizeStatusSuggestion('Submitted to Advantage.\n\nBest,\nIan');
    expect(r.text).toBe('Submitted to Advantage.');
    expect(r.ok).toBe(true);
  });

  it('caps at two sentences', () => {
    const raw = 'One sentence here. Two sentences here. Three should be dropped.';
    const r = sanitizeStatusSuggestion(raw);
    expect(r.sentenceCount).toBeLessThanOrEqual(2);
    expect(r.text.includes('Three should be dropped')).toBe(false);
  });

  it('truncates over 280 chars at sentence boundary', () => {
    const long = 'A'.repeat(260) + '. ' + 'B'.repeat(260) + '.';
    const r = sanitizeStatusSuggestion(long);
    expect(r.text.length).toBeLessThanOrEqual(280);
  });

  it('rejects empty input', () => {
    expect(sanitizeStatusSuggestion('').ok).toBe(false);
  });

  it('produces a single line (no newlines)', () => {
    const r = sanitizeStatusSuggestion('Line one.\nLine two.');
    expect(r.text.includes('\n')).toBe(false);
  });
});