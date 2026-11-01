import { describe, it, expect } from 'vitest';
import { isMissingFeeInfo } from '../dealMissingFeeInfo';

describe('isMissingFeeInfo', () => {
  it('flags deals with no fee values at all', () => {
    expect(isMissingFeeInfo({ totalFee: 0 } as any)).toBe(true);
  });
  it('does not flag a deal with only a success fee %', () => {
    expect(isMissingFeeInfo({ totalFee: 0, successFeePercent: 2 } as any)).toBe(false);
  });
  it('does not flag a deal with only a retainer', () => {
    expect(isMissingFeeInfo({ totalFee: 0, retainerFee: 5000 } as any)).toBe(false);
  });
});
