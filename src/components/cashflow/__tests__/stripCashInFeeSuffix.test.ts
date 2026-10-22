import { describe, it, expect } from 'vitest';
import { stripCashInFeeSuffix } from '../financeWeeklyBalance';

describe('stripCashInFeeSuffix', () => {
  it('removes a single fee label', () => {
    expect(stripCashInFeeSuffix('Athyna — Closing')).toBe('Athyna');
  });
  it('removes repeated fee labels from older saves', () => {
    expect(stripCashInFeeSuffix('Vispero — Closing — Closing — Closing')).toBe('Vispero');
    expect(stripCashInFeeSuffix('Censys Technologies — Milestone — Milestone')).toBe('Censys Technologies');
  });
  it('leaves a plain deal name unchanged', () => {
    expect(stripCashInFeeSuffix('Vispero')).toBe('Vispero');
  });
});
