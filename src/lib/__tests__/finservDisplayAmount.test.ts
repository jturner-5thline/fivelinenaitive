import { describe, it, expect } from 'vitest';
import { finservDisplayAmount } from '../finservValue';
describe('finservDisplayAmount', () => {
  it('shows one-time total for fixed-fee deal with no MRR (SupportPay $30K)', () => {
    expect(finservDisplayAmount({ mrr: null, oneTimeRevenue: 30000, value: 30000 })).toEqual({ amount: 30000, recurring: false });
  });
  it('shows monthly MRR for recurring deals', () => {
    expect(finservDisplayAmount({ mrr: 6000, oneTimeRevenue: 3000, value: 9000 })).toEqual({ amount: 6000, recurring: true });
  });
});
