import { describe, expect, it } from 'vitest';
import { buildTtmPeriods, calculateTtmPeriod, loadAllTtmRows, TTM_HOUR_PIPELINE_IDS, TTM_REVENUE_REALM_ID, type TtmHours } from './ttmRevenuePerDealHour';

const company = 'company-one';
const period = { start: '2025-10-01', end: '2026-09-30', label: 'Q3 26' };
const entry = (patch: Partial<TtmHours> = {}): TtmHours => ({
  deal_id: 'deal-one', week_start_date: '2026-09-07', hours: 10,
  deals: { company: 'Real deal', company_id: company, pipeline_id: TTM_HOUR_PIPELINE_IDS[0] ?? '' }, ...patch,
});

describe('TTM revenue per deal hour', () => {
  it('uses only the Capital Advisors realm configuration', () => {
    expect(TTM_REVENUE_REALM_ID).toBe('193514877331929');
  });
  it('builds four quarterly TTM bars ending in the selected quarter plus prior comparison', () => {
    const periods = buildTtmPeriods('2026-09-30', 'quarter');
    expect(periods.slice(1).map(p => p.label)).toEqual(['Q4 25', 'Q1 26', 'Q2 26', 'Q3 26']);
    expect(periods.at(-1)).toEqual(period);
    expect(periods[0]).toEqual({ start: '2024-10-01', end: '2025-09-30', label: 'Q3 25' });
  });
  it('builds twelve monthly TTM bars with exact month boundaries including leap years', () => {
    const periods = buildTtmPeriods('2024-02-29', 'month');
    expect(periods.slice(1)).toHaveLength(12);
    expect(periods.at(-1)).toEqual({ start: '2023-03-01', end: '2024-02-29', label: 'Feb 24' });
    expect(periods[1]?.label).toBe('Mar 23');
  });
  it('sums full invoice amounts inside the inclusive window, not balances or collection', () => {
    const result = calculateTtmPeriod(period, [
      { txn_date: '2025-09-30', total_amt: 9999 },
      { txn_date: '2025-10-01', total_amt: '1000' },
      { txn_date: '2026-09-30', total_amt: 2000 },
      { txn_date: '2026-10-01', total_amt: 9999 },
    ], [entry()], company);
    expect(result.revenue).toBe(3000);
    expect(result.hours).toBe(10);
    expect(result.rate).toBe(300);
  });
  it('includes both eligible pipelines and closed deals with logged hours; excludes other tenants and pipelines', () => {
    const result = calculateTtmPeriod(period, [], [
      entry(), entry({ deal_id: 'development', hours: 20, deals: { company: 'Closed deal', company_id: company, pipeline_id: TTM_HOUR_PIPELINE_IDS[1] ?? '' } }),
      entry({ deals: { company: 'Wrong tenant', company_id: 'other', pipeline_id: TTM_HOUR_PIPELINE_IDS[0] ?? '' } }),
      entry({ deals: { company: 'FinServ', company_id: company, pipeline_id: 'finserv' } }),
    ], company);
    expect(result.hours).toBe(30);
    expect(result.deals.map(d => d.id)).toEqual(['development', 'deal-one']);
  });
  it.each(["Test-Niki's Store", 'Example Deal', 'test client'])('excludes the test deal %s', name => {
    expect(calculateTtmPeriod(period, [], [entry({ deals: { company: name, company_id: company, pipeline_id: TTM_HOUR_PIPELINE_IDS[0] ?? '' } })], company).hours).toBe(0);
  });
  it('aggregates repeated hours per deal and preserves adjustments so detail totals reconcile', () => {
    const result = calculateTtmPeriod(period, [], [entry(), entry({ hours: -2 }), entry({ week_start_date: '2026-10-01' })], company);
    expect(result.hours).toBe(8);
    expect(result.deals).toHaveLength(1);
    expect(result.deals[0]?.hours).toBe(8);
  });
  it('uses no rate rather than infinity when no qualifying hours exist', () => {
    expect(calculateTtmPeriod(period, [{ txn_date: period.end, total_amt: 100 }], [], company).rate).toBeNull();
  });
  it('loads beyond a 500-row first page', async () => {
    const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const rows = await loadAllTtmRows(async (from, to) => ({ data: source.slice(from, to + 1), error: null }));
    expect(rows).toHaveLength(1201);
    expect(rows.at(-1)?.id).toBe(1200);
  });
  it('rejects later-page failures instead of returning a partial total', async () => {
    await expect(loadAllTtmRows(async from => from === 0 ? { data: Array.from({ length: 500 }, () => 1), error: null } : { data: null, error: new Error('Denied') })).rejects.toThrow('Denied');
  });
});