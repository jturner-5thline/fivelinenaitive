import { describe, it, expect } from 'vitest';
import { buildClientTypeMix } from './clientTypeMix';

const deal = (clientType: string | undefined, mrr: number) => ({ clientType, mrr } as any);

describe('buildClientTypeMix', () => {
  const deals = [deal('Type A - AINS', 1000), deal('Type A - AINS', 500), deal('Type C - Advisory + GTM', 2000), deal(undefined, 300)];

  it('counts clients per type', () => {
    const mix = buildClientTypeMix(deals, 'count');
    expect(mix.find((s) => s.name === 'Type A - AINS')!.value).toBe(2);
    expect(mix.find((s) => s.name === 'Unassigned')!.value).toBe(1);
  });

  it('sums MRR per type', () => {
    const mix = buildClientTypeMix(deals, 'mrr');
    expect(mix.find((s) => s.name === 'Type A - AINS')!.value).toBe(1500);
    expect(mix.find((s) => s.name === 'Type C - Advisory + GTM')!.value).toBe(2000);
  });

  it('hides Unassigned when every deal has a type', () => {
    expect(buildClientTypeMix([deal('Type A - AINS', 1)], 'count').some((s) => s.name === 'Unassigned')).toBe(false);
  });
});
