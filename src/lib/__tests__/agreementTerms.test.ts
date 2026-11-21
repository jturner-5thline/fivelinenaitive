import { describe, it, expect } from 'vitest';
import { agreementSchema, agreementTotalFee, feePatchSchema } from '../agreementTerms';

describe('agreement fees', () => {
  it('uses whole percentage points: 1.5 means 1.5 percent', () => expect(agreementTotalFee(1000000, 1.5, null)).toBe(15000));
  it('supports percentages below one without decimal-percent normalization', () => expect(agreementTotalFee(1000000, 0.5, null)).toBe(5000));
  it('uses the greater of percentage and minimum', () => {
    expect(agreementTotalFee(1000000, 1.5, 20000)).toBe(20000);
    expect(agreementTotalFee(2000000, 1.5, 20000)).toBe(30000);
  });
  it('allows null clears but rejects direct derived fee writes', () => {
    expect(feePatchSchema.parse({ success_fee_minimum: null })).toEqual({ success_fee_minimum: null });
    expect(feePatchSchema.safeParse({ total_fee: 99 }).success).toBe(false);
    expect(feePatchSchema.safeParse({ closing_fee: 99 }).success).toBe(false);
  });
  it('rejects negative fees and invalid dates', () => {
    expect(feePatchSchema.safeParse({ retainer_fee: -1 }).success).toBe(false);
    expect(feePatchSchema.safeParse({ contract_end_date: '2026-02-30' }).success).toBe(false);
  });
});
describe('agreement criteria', () => {
  const record = { executed_qualifies: false, match_rule: 'all', criteria: [{ position: 0, text: '  At least $1.5MM\nNo board seat.  ', metric: 'total_commitment', operator: '>=', value: 1500000, unit: '$' }] };
  it('preserves verbatim text and a false executed-qualifies rule', () => {
    const parsed = agreementSchema.parse(record);
    expect(parsed.criteria[0].text).toBe(record.criteria[0].text);
    expect(parsed.executed_qualifies).toBe(false);
  });
  it('requires an explicit all/any rule and unique positions', () => {
    expect(agreementSchema.safeParse({ ...record, match_rule: 'other' }).success).toBe(false);
    expect(agreementSchema.safeParse({ ...record, criteria: [record.criteria[0], record.criteria[0]] }).success).toBe(false);
  });
  it('rejects unsafe source URLs', () => expect(agreementSchema.safeParse({ ...record, source_file_url: 'javascript:alert(1)' }).success).toBe(false));
  it('permits an empty criteria array and explicit check/uncheck', () => {
    expect(agreementSchema.parse({ ...record, criteria: [] }).criteria).toEqual([]);
    expect(agreementSchema.parse({ ...record, criteria: [{ ...record.criteria[0], is_met: false }] }).criteria[0].is_met).toBe(false);
  });
});