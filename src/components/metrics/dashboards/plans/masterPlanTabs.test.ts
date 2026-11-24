import { describe, it, expect } from 'vitest';
import { VISIBLE_ENTRIES } from './masterPlanTabs';

const labels = (k: string) => VISIBLE_ENTRIES.find(([d]) => d === k)![1].widgets.map((w) => w.label);

describe('Master Plan KPI rows', () => {
  it('Debt Advisory shows Deals Closed and Dollars Funded, no FinServ rows', () => {
    const l = labels('consolidated-debt-pipeline');
    expect(l).toContain('Deals Closed');
    expect(l).toContain('Dollars Funded');
    expect(l.some((x) => x.includes('FinServ'))).toBe(false);
  });
  it('Debt Advisory keeps Terms Issued and Terms Issued $ and drops unlisted rows', () => {
    const l = labels('consolidated-debt-pipeline');
    expect(l).toContain('Terms Issued');
    expect(l).toContain('Terms Issued $');
    expect(l).not.toContain('Clients Receiving Terms');
    for (const gone of ['Total Revenue', 'Total Revenue Opportunity', 'NDA Sent', 'Closed-Won Fees']) expect(l).not.toContain(gone);
    expect(l).toHaveLength(35);
  });
  it('FinServ shows only the four listed metrics', () => {
    expect(labels('finserv-financial-metrics')).toEqual(['Active Clients', 'New Clients', 'MRR', 'Revenue Run Rate']);
  });
});
