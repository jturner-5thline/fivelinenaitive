import { describe, it, expect } from 'vitest';
import { agreementSchema, evaluateQualifiers, agreementTotalFee, feePatchSchema } from '../agreementTerms';

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
describe('qualifier count and group rules', () => {
  const criteria = (count: number, group: string | null = null, met = count) => Array.from({ length: count }, (_, position) => ({ position, text: `Criterion ${position}`, group, is_met: position < met }));
  const base = { executed_qualifies: false, match_rule: 'any', criteria: criteria(4, null, 3), min_required: 3 };
  it('Lango needs 3 of 4, not just any one', () => {
    expect(evaluateQualifiers(agreementSchema.parse(base)).qualified).toBe(true);
    expect(evaluateQualifiers(agreementSchema.parse({ ...base, criteria: criteria(4, null, 2) })).qualified).toBe(false);
  });
  it('rejects counts below 1, fractional, and above the criteria count', () => {
    for (const min_required of [0, -1, 1.5, 5]) expect(agreementSchema.safeParse({ ...base, min_required }).success).toBe(false);
  });
  it('null falls back to all or any', () => {
    expect(evaluateQualifiers(agreementSchema.parse({ ...base, min_required: null, match_rule: 'all' })).qualified).toBe(false);
    expect(evaluateQualifiers(agreementSchema.parse({ ...base, min_required: null })).qualified).toBe(true);
  });
  const group = (key: string, match_rule = 'all', fee: number | null = null, min_required: number | null = null) => ({ key, label: key, match_rule, fee, min_required });
  it('Censys requires all core criteria AND one either criterion', () => {
    const record = { ...base, min_required: null, criteria: [...criteria(3, 'core'), ...criteria(2, 'either', 1).map((c) => ({ ...c, position: c.position + 3 }))], groups: [group('core'), group('either', 'any', null, 1)] };
    expect(evaluateQualifiers(agreementSchema.parse(record)).qualified).toBe(true);
    expect(evaluateQualifiers(agreementSchema.parse({ ...record, criteria: record.criteria.map((c) => c.group === 'either' ? { ...c, is_met: false } : c) })).qualified).toBe(false);
  });
  it('iunu earns independent $10,000 and $5,000 fees', () => {
    const record = { ...base, min_required: null, groups_logic: 'each_group_separately', criteria: [...criteria(1, 'term_loan_refi'), ...criteria(1, 'capex', 0).map((c) => ({ ...c, position: 1 }))], groups: [group('term_loan_refi', 'all', 10000), group('capex', 'all', 5000)] };
    expect(evaluateQualifiers(agreementSchema.parse(record)).earned_group_fees).toBe(10000);
    expect(evaluateQualifiers(agreementSchema.parse({ ...record, criteria: record.criteria.map((c) => ({ ...c, is_met: true })) })).earned_group_fees).toBe(15000);
  });
  it('rejects unknown/duplicate groups and excessive group counts', () => {
    expect(agreementSchema.safeParse({ ...base, min_required: null, criteria: criteria(1, 'unknown') }).success).toBe(false);
    expect(agreementSchema.safeParse({ ...base, groups: [group('a'), group('a')] }).success).toBe(false);
    expect(agreementSchema.safeParse({ ...base, min_required: null, groups: [group('a', 'any', null, 2)], criteria: criteria(1, 'a') }).success).toBe(false);
  });
});
