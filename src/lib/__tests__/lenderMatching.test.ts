import { describe, it, expect } from 'vitest';
import { matchIncomingLender, scoreCandidate, countFieldConflicts } from '@/lib/lenderMatching';

describe('lenderMatching', () => {
  it('flags exact normalized name as exact_duplicate', () => {
    const res = matchIncomingLender(
      { name: 'Acme Capital LLC', email: 'x@acme.com' },
      [{ id: '1', name: 'Acme Capital', email: 'y@acme.com' }],
    );
    expect(res.confidence).toBe('exact_duplicate');
    expect(res.suggestedAction).toBe('merge');
    expect(res.topCandidate?.lender_id).toBe('1');
  });

  it('falls back to possible_match on fuzzy name + shared domain', () => {
    const res = matchIncomingLender(
      { name: 'Bain Cap Credit Co', email: 'a@bain.com' },
      [{ id: '2', name: 'Bain Capital Credit Inc', email: 'b@bain.com' }],
    );
    expect(['likely_duplicate', 'possible_match']).toContain(res.confidence);
    expect(res.topCandidate?.reasons.length).toBeGreaterThan(0);
  });

  it('returns none when no candidates match', () => {
    const res = matchIncomingLender({ name: 'Zeta Co' }, [{ id: '3', name: 'Omega Partners' }]);
    expect(res.confidence).toBe('none');
    expect(res.suggestedAction).toBe('add');
  });

  it('counts only populated/differing field conflicts', () => {
    const n = countFieldConflicts(
      { name: 'A', email: 'x@y.com', phone: '' },
      { name: 'B', email: 'x@y.com', phone: '123' },
      ['name', 'email', 'phone'],
    );
    expect(n).toBe(1);
  });

  it('alias overlap drives the score above name', () => {
    const r = scoreCandidate(
      { name: 'New Name Inc', aliases: ['Old Brand'] },
      { id: 'x', name: 'Completely Different', aliases: ['Old Brand'] },
    );
    expect(r.score).toBeGreaterThanOrEqual(0.9);
  });
});