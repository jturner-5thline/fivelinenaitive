import { describe, it, expect } from 'vitest';
import {
  buildFinanceWeeklyBalance,
  composeCombinedScheduledItems,
  pickForwardWeeks,
} from '../financeWeeklyBalance';
import type { ScheduledCashFlow } from '../scheduledCashFlows';

/**
 * Parity contract: /insights "12-Week Cashflow Forecast" MUST read the same
 * weekly ENDING CASH values as Finance > Cash Flow. Both surfaces consume
 * `buildFinanceWeeklyBalance` and `pickForwardWeeks` from the shared source.
 * If anyone reintroduces a parallel transform, this test fails.
 */
describe('Finance ↔ Insights weekly balance parity', () => {
  const baseScheduled: ScheduledCashFlow[] = [
    {
      id: 's1',
      company_id: 'co',
      account: 'Operating',
      category: 'Retainers',
      amount: 12_500,
      frequency_type: 'one_time',
      frequency_config: { one_time_date: '2027-01-15' },
      flow_type: 'cash_in',
      start_date: '2027-01-15',
      end_date: '2027-01-15',
      notes: 'Test retainer',
    } as ScheduledCashFlow,
    {
      id: 's2',
      company_id: 'co',
      account: 'Operating',
      category: 'Payroll',
      amount: 40_000,
      frequency_type: 'one_time',
      frequency_config: { one_time_date: '2027-02-05' },
      flow_type: 'cash_out',
      start_date: '2027-02-05',
      end_date: '2027-02-05',
      notes: 'Test payroll',
    } as ScheduledCashFlow,
  ];

  it('returns identical ENDING CASH for the same inputs (idempotence)', () => {
    const a = buildFinanceWeeklyBalance({
      combinedScheduledItems: baseScheduled,
      weeklyOverrides: {},
    });
    const b = buildFinanceWeeklyBalance({
      combinedScheduledItems: baseScheduled,
      weeklyOverrides: {},
    });
    expect(Object.keys(a.weeklyWithScheduled).sort()).toEqual(
      Object.keys(b.weeklyWithScheduled).sort(),
    );
    for (const k of Object.keys(a.weeklyWithScheduled)) {
      expect((a.weeklyWithScheduled[k] as any)['ENDING CASH']).toBe(
        (b.weeklyWithScheduled[k] as any)['ENDING CASH'],
      );
    }
  });

  it('Insights forward-week slice equals Finance weeklyWithScheduled lookup', () => {
    const result = buildFinanceWeeklyBalance({
      combinedScheduledItems: baseScheduled,
      weeklyOverrides: {},
    });
    // Use a fixed anchor so the test is deterministic across CI clocks.
    const todayISO = '2027-01-04';
    const insightsView = pickForwardWeeks(result, 12, todayISO);
    expect(insightsView).toHaveLength(12);
    for (const w of insightsView) {
      const financeEntry: any = result.weeklyWithScheduled[w.weekKey];
      expect(financeEntry, `Insights week ${w.weekKey} missing from Finance grid`).toBeDefined();
      expect(w.endingCash).toBe(
        Math.round(Number(financeEntry['ENDING CASH']) || 0),
      );
      // Same week-ending date, same ordering — no separate week definition.
      const financeWE =
        typeof financeEntry.week_ending === 'string' ? financeEntry.week_ending : w.weekKey;
      expect(w.weekEnding).toBe(financeWE);
    }
  });

  it('composeCombinedScheduledItems preserves source ordering (QB → projected → manual → cash-in)', () => {
    const qb = [{ id: 'qb1' } as ScheduledCashFlow];
    const projected = [{ id: 'p1' } as ScheduledCashFlow];
    const manual = [{ id: 'm1' } as ScheduledCashFlow];
    const cashIn = [
      { id: 'c1', deal_name: 'Acme', fee_type: 'retainer', amount: 10, target_date: '2027-01-15', deal_id: null },
    ] as any[];
    const composed = composeCombinedScheduledItems({
      qbDerivedItems: qb,
      dealProjectedItems: projected,
      scheduledItems: manual,
      cashInDbItems: cashIn,
      companyId: 'co',
    });
    expect(composed.map((e) => e.id)).toEqual(['qb1', 'p1', 'm1', 'cashin:c1']);
  });
});