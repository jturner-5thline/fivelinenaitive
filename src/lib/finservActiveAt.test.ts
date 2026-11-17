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

import { finservSnapshotAt } from './finservActiveAt';
describe('finservSnapshotAt', () => {
  it('counts pre-May-2026 contract-start clients and their MRR at the period end', () => {
    const deals = [
      { id: 'x', company: 'A', stage: 'fs-closed-won', mrr: 7000, created_at: '2026-05-12T00:00:00Z', contract_start_date: '2023-08-01' },
      { id: 'y', company: 'B', stage: 'fs-churned', mrr: 800, created_at: '2026-05-12T00:00:00Z', contract_start_date: '2024-01-05', stage_entered_at: '2026-05-27T00:00:00Z' },
      { id: 'z', company: 'C', stage: 'fs-closed-won', mrr: 5000, created_at: '2026-07-01T00:00:00Z', contract_start_date: '2026-07-27' },
    ];
    const s = finservSnapshotAt(deals, new Map(), end(2026, 3, 31));
    expect(s.active_clients).toBe(2);
    expect(s.total_mrr).toBe(7800);
  });
  it('counts two engagements for the same client as one client with combined MRR', () => {
    const deals = [
      { id: 'a', company: 'WealthCentral, Inc.', stage: 'fs-closed-won', mrr: 2000, created_at: '2025-01-01T00:00:00Z' },
      { id: 'b', company: 'WealthCentral Bookkeeping', stage: 'fs-closed-won', mrr: 500, created_at: '2025-01-01T00:00:00Z' },
      { id: 'c', company: 'i-Genie', stage: 'fs-closed-won', mrr: 1000, created_at: '2025-01-01T00:00:00Z' },
      { id: 'd', company: 'I-Genie CFO Advisory Expansion', stage: 'fs-closed-won', mrr: 300, created_at: '2025-01-01T00:00:00Z' },
    ];
    const s = finservSnapshotAt(deals, new Map(), end(2026, 6, 30));
    expect(s.active_clients).toBe(2);
    expect(s.active_engagements).toBe(4);
    expect(s.clients.find((c) => c.id === 'a')?.mrr).toBe(2500);
  });
  it('stops counting a contract-start client after its contract end date', () => {
    const deal = { id: 'l', company: 'Laura Shin Media FinOps', stage: 'fs-churned', mrr: 800, created_at: '2026-05-12T00:00:00Z', contract_start_date: '2024-01-05', contract_end_date: '2026-01-16', stage_entered_at: '2026-05-27T00:00:00Z' };
    expect(finservSnapshotAt([deal], new Map(), end(2025, 12, 31)).active_clients).toBe(1);
    expect(finservSnapshotAt([deal], new Map(), end(2026, 2, 28)).active_clients).toBe(0);
  });
});
