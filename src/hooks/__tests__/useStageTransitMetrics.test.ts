import { describe, it, expect } from 'vitest';

/**
 * The pairing/exclusion logic lives in the SQL RPC `get_stage_transit_monthly`
 * (and its DQ counterpart `log_inverted_pi_fci_pairs`). These tests document
 * the contract the chart relies on by exercising a small in-memory replica of
 * the SQL CTE pipeline. Keeping the contract here means regressions in the
 * RPC will surface as failing assertions when the team re-derives the helper.
 */

type Event = { deal_id: string; stage: 'PI' | 'FCI'; at: string };

const FROM = new Set(['PI']);
const TO = new Set(['FCI']);

const MS_PER_MONTH = 86400 * 1000 * 30.4375;

function bucket(events: Event[], windowMonths: number, anchor: Date) {
  // earliest PI per deal
  const piByDeal = new Map<string, number>();
  for (const e of events) {
    if (!FROM.has(e.stage)) continue;
    const t = new Date(e.at).getTime();
    const cur = piByDeal.get(e.deal_id);
    if (cur === undefined || t < cur) piByDeal.set(e.deal_id, t);
  }
  // earliest FCI per deal that is >= the deal's PI
  const pairs: Array<{ deal: string; pi: number; fci: number; months: number; excluded?: string }> = [];
  const fciByDeal = new Map<string, number>();
  for (const e of events) {
    if (!TO.has(e.stage)) continue;
    const t = new Date(e.at).getTime();
    const pi = piByDeal.get(e.deal_id);
    if (pi === undefined) { pairs.push({ deal: e.deal_id, pi: NaN, fci: t, months: NaN, excluded: 'no-PI' }); continue; }
    if (t < pi) { pairs.push({ deal: e.deal_id, pi, fci: t, months: NaN, excluded: 'inverted' }); continue; }
    if (t < pi) continue;
    const cur = fciByDeal.get(e.deal_id);
    if (cur === undefined || t < cur) fciByDeal.set(e.deal_id, t);
  }
  for (const [deal, fci] of fciByDeal) {
    const pi = piByDeal.get(deal)!;
    pairs.push({ deal, pi, fci, months: (fci - pi) / MS_PER_MONTH });
  }
  const windowStart = anchor.getTime() - windowMonths * MS_PER_MONTH;
  const included = pairs.filter((p) => !p.excluded && p.fci >= windowStart && p.fci <= anchor.getTime());
  return { included, excluded: pairs.filter((p) => p.excluded) };
}

describe('Stage transit (PI → FCI) pairing contract', () => {
  const anchor = new Date('2026-06-01T00:00:00Z');

  it('happy path: PI 2026-01-15 + FCI 2026-04-15 yields ~3.0 months', () => {
    const { included } = bucket(
      [
        { deal_id: 'd1', stage: 'PI', at: '2026-01-15T00:00:00Z' },
        { deal_id: 'd1', stage: 'FCI', at: '2026-04-15T00:00:00Z' },
      ],
      12, anchor,
    );
    expect(included).toHaveLength(1);
    expect(included[0].months).toBeCloseTo(3.0, 1);
  });

  it('PI before window but FCI inside window → included', () => {
    const { included } = bucket(
      [
        { deal_id: 'd2', stage: 'PI', at: '2025-01-01T00:00:00Z' }, // > 12mo before anchor
        { deal_id: 'd2', stage: 'FCI', at: '2026-03-01T00:00:00Z' }, // inside window
      ],
      12, anchor,
    );
    expect(included.map((p) => p.deal)).toEqual(['d2']);
  });

  it('FCI before PI (inverted) → excluded + DQ-flagged', () => {
    const { included, excluded } = bucket(
      [
        { deal_id: 'd3', stage: 'PI', at: '2026-04-01T00:00:00Z' },
        { deal_id: 'd3', stage: 'FCI', at: '2026-03-01T00:00:00Z' },
      ],
      12, anchor,
    );
    expect(included).toHaveLength(0);
    expect(excluded.some((e) => e.excluded === 'inverted' && e.deal === 'd3')).toBe(true);
  });

  it('FCI with no PI → excluded', () => {
    const { included, excluded } = bucket(
      [{ deal_id: 'd4', stage: 'FCI', at: '2026-04-01T00:00:00Z' }],
      12, anchor,
    );
    expect(included).toHaveLength(0);
    expect(excluded.some((e) => e.excluded === 'no-PI' && e.deal === 'd4')).toBe(true);
  });
});
