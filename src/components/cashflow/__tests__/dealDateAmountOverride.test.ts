import { describe, it, expect } from 'vitest';
import { applyDealDateAmountOverride } from '../useDealCashflowOverrides';

const retainer = {
  amount: 10000,
  start_date: '2026-11-18',
  end_date: '2026-11-18',
  frequency_config: { one_time_date: '2026-11-18' },
};

describe('applyDealDateAmountOverride', () => {
  it('moves a pipeline retainer to the manually chosen date', () => {
    const r = applyDealDateAmountOverride(retainer, { override_date: '2026-12-02', override_amount: null });
    expect(r.start_date).toBe('2026-12-02');
    expect(r.frequency_config.one_time_date).toBe('2026-12-02');
    expect(r.amount).toBe(10000);
  });
  it('uses the manually chosen amount', () => {
    expect(applyDealDateAmountOverride(retainer, { override_amount: 7500 }).amount).toBe(7500);
  });
  it('keeps the pipeline values when no override exists', () => {
    expect(applyDealDateAmountOverride(retainer, undefined)).toEqual(retainer);
  });
});
