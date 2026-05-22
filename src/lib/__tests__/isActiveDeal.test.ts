import { describe, it, expect } from 'vitest';
import { isActiveDeal } from '@/lib/deals';

const d = (stage: string, status = 'on-track') => ({ stage, status } as any);

describe('isActiveDeal', () => {
  it('includes active pipeline stages', () => {
    for (const s of [
      'initial-review', 'lenders-in-review', 'term-sheet', 'in-due-diligence',
      'final-credit-items', 'write-up-pending', 'Indication of Interest',
      'active', 'fs-qualified', 'fs-scoping', 'agreement-pending',
    ]) {
      expect(isActiveDeal(d(s))).toBe(true);
    }
  });

  it('excludes every variant Niki flagged', () => {
    const excluded = [
      'closed-won', 'Closed won', 'closed-lost', 'Closed lost',
      'Closed Out / Not a Fit', 'on-hold', 'On Hold',
      'Deal/Diligence Paused/On Hold', 'Client Paused Deal',
      'Do Not Contact / Dead Deal', 'Unqualified', 'dormant',
      'fs-churned', 'fs-closed-won', 'fs-closed-lost',
    ];
    for (const s of excluded) expect(isActiveDeal(d(s))).toBe(false);
  });

  it('excludes archived/closed-lost/on-hold status regardless of stage', () => {
    expect(isActiveDeal(d('initial-review', 'archived'))).toBe(false);
    expect(isActiveDeal(d('initial-review', 'on-hold'))).toBe(false);
    expect(isActiveDeal(d('initial-review', 'closed-lost'))).toBe(false);
  });

  it('treats Blount Capital "Passed" as inactive', () => {
    expect(isActiveDeal(d('passed'))).toBe(false);
    expect(isActiveDeal(d('Passed'))).toBe(false);
  });

  it('treats Blount Capital "Prospect - Unqualified" as active (intake stage)', () => {
    expect(isActiveDeal(d('prospect-unqualified'))).toBe(true);
    expect(isActiveDeal(d('Prospect - Unqualified'))).toBe(true);
    expect(isActiveDeal(d('prospect-qualified-intake'))).toBe(true);
  });
});