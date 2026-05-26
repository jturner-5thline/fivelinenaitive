import { describe, it, expect } from 'vitest';
import { matchDemoScript, normalizeDemoPrompt } from '../demoScripts';

describe('matchDemoScript', () => {
  const email = 'demo@5thline.co';
  const prompt = 'how much of their pipeline is fully committed?';

  it('matches the canonical prompt for the demo user', () => {
    const r = matchDemoScript({ email, prompt });
    expect(r?.reply).toContain('65%');
    expect(r?.delayMs).toBeGreaterThanOrEqual(1200);
    expect(r?.delayMs).toBeLessThanOrEqual(1800);
  });

  it('matches the variant without trailing punctuation', () => {
    expect(matchDemoScript({ email, prompt: 'How much of their pipeline is fully committed' })).not.toBeNull();
    expect(matchDemoScript({ email, prompt: '  How much of their pipeline is fully committed.  ' })).not.toBeNull();
  });

  it('returns null for non-demo users', () => {
    expect(matchDemoScript({ email: 'jturner@5thline.co', prompt })).toBeNull();
    expect(matchDemoScript({ email: null, prompt })).toBeNull();
  });

  it('returns null for non-matching prompts', () => {
    expect(matchDemoScript({ email, prompt: 'what deals need attention' })).toBeNull();
  });

  it('normalizes whitespace, case, and trailing punctuation', () => {
    expect(normalizeDemoPrompt('  Hello  World?? ')).toBe('hello world');
  });
});