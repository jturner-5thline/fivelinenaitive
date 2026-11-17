import { describe, it, expect } from 'vitest';
import { isFinServActiveClientAt, countsTowardFinServMrrAt } from './finservActiveAt';

const end = (y: number, m: number, d: number) => new Date(y, m - 1, d, 23, 59, 59);

describe('FinServ active client rule', () => {
  it('counts a deal whose contract started before a pre-May-2026 period end even if imported later', () => {
    const deal = { id: 'a', stage: 'fs-closed-won', created_at: '2026-06-01T00:00:00Z', contract_start_date: '2025-03-15' };
    expect(isFinServActiveClientAt(deal, [], end(2025, 3, 31))).toBe(true);
    expect(isFinServActiveClientAt(deal, [], end(2025, 2, 28))).toBe(false);
    expect(countsTowardFinServMrrAt(deal, [], end(2025, 3, 31))).toBe(true);
  });
  it('excludes a deal that exited Active Client before the period end', () => {
    const deal = { id: 'b', stage: 'fs-churned', created_at: '2024-01-01T00:00:00Z', contract_start_date: '2024-02-01' };
    const hist = [
      { to_stage: 'fs-closed-won', changed_at: '2024-02-01T12:00:00Z' },
      { to_stage: 'fs-churned', changed_at: '2025-06-10T12:00:00Z' },
    ];
    expect(isFinServActiveClientAt(deal, hist, end(2025, 5, 31))).toBe(true);
    expect(isFinServActiveClientAt(deal, hist, end(2025, 6, 30))).toBe(false);
  });
  it('does not apply the contract start rule from May 2026 onward', () => {
    const deal = { id: 'c', stage: 'fs-onboarding', created_at: '2024-01-01T00:00:00Z', contract_start_date: '2025-01-01' };
    expect(isFinServActiveClientAt(deal, [], end(2026, 4, 30))).toBe(true);
    expect(isFinServActiveClientAt(deal, [], end(2026, 5, 31))).toBe(false);
  });
});
