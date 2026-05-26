import { describe, it, expect } from 'vitest';
import { buildDealFieldsUpdate, isEmptyDealFieldsPayload } from '../dealFieldsUpdatePayload';

describe('buildDealFieldsUpdate', () => {
  it('adds Post-Signing hours via delta against the current value', () => {
    const out = buildDealFieldsUpdate(
      { post_signing_hours_delta: 0.5 },
      { pre_signing_hours: 2, post_signing_hours: 3 },
    );
    expect(out).toEqual({ post_signing_hours: 3.5 });
  });

  it('handles a batch: Upflex +0.5 and Xnergy +1.5 produce two distinct payloads', () => {
    const upflex = buildDealFieldsUpdate(
      { post_signing_hours_delta: 0.5 },
      { pre_signing_hours: 0, post_signing_hours: 4 },
    );
    const xnergy = buildDealFieldsUpdate(
      { post_signing_hours_delta: 1.5 },
      { pre_signing_hours: 0, post_signing_hours: 2 },
    );
    expect(upflex).toEqual({ post_signing_hours: 4.5 });
    expect(xnergy).toEqual({ post_signing_hours: 3.5 });
    expect(isEmptyDealFieldsPayload(upflex)).toBe(false);
    expect(isEmptyDealFieldsPayload(xnergy)).toBe(false);
  });

  it('supports absolute set for Pre-Signing hours', () => {
    const out = buildDealFieldsUpdate(
      { pre_signing_hours: 8 },
      { pre_signing_hours: 2, post_signing_hours: 0 },
    );
    expect(out).toEqual({ pre_signing_hours: 8 });
  });

  it('absolute set wins over delta when both are present', () => {
    const out = buildDealFieldsUpdate(
      { post_signing_hours: 10, post_signing_hours_delta: 0.5 },
      { pre_signing_hours: 0, post_signing_hours: 4 },
    );
    expect(out).toEqual({ post_signing_hours: 10 });
  });

  it('returns empty payload when no writable fields are provided', () => {
    const out = buildDealFieldsUpdate({}, { pre_signing_hours: 0, post_signing_hours: 0 });
    expect(out).toEqual({});
    expect(isEmptyDealFieldsPayload(out)).toBe(true);
  });

  it('passes scalar deal fields through', () => {
    const out = buildDealFieldsUpdate(
      { value: 1000, stage: 'terms-issued', is_flagged: true, flag_notes: 'check' },
      { pre_signing_hours: 0, post_signing_hours: 0 },
    );
    expect(out).toEqual({
      value: 1000,
      stage: 'terms-issued',
      is_flagged: true,
      flag_notes: 'check',
    });
  });

  it('supports negative deltas (subtract hours)', () => {
    const out = buildDealFieldsUpdate(
      { post_signing_hours_delta: -1 },
      { pre_signing_hours: 0, post_signing_hours: 4 },
    );
    expect(out).toEqual({ post_signing_hours: 3 });
  });
});