import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTtmRevenuePerDealHour } from './useTtmRevenuePerDealHour';
import { FIFTH_LINE_COMPANY_ID } from './useNaitivePipelineAccess';

const { companyMock, queryMock, fromMock, chain } = vi.hoisted(() => {
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), range: vi.fn() };
  return { companyMock: vi.fn(), queryMock: vi.fn(), fromMock: vi.fn(), chain };
});
vi.mock('@/hooks/useCompany', () => ({ useCompany: companyMock }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'caller' } }) }));
vi.mock('@/contexts/InsightsTimeframeContext', () => ({ useInsightsTimeframe: () => ({ timeframe: { start: '2026-07-01', end: '2026-09-30' }, reportingPeriod: { view: 'quarter' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: queryMock }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));

describe('TTM read boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyMock.mockReturnValue({ company: { id: FIFTH_LINE_COMPANY_ID } });
    queryMock.mockReturnValue({});
    fromMock.mockReturnValue(chain);
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order'] as const) chain[method].mockReturnValue(chain);
    chain.range.mockResolvedValue({ data: [], error: null });
  });
  it('queries the exact entity and company-scoped eligible hours using ordered pages', async () => {
    renderHook(useTtmRevenuePerDealHour);
    const options = queryMock.mock.calls[0]?.[0];
    const rows = await options.queryFn();
    expect(options.enabled).toBe(true);
    expect(options.queryKey).toContain('caller');
    expect(options.queryKey).toContain(FIFTH_LINE_COMPANY_ID);
    expect(fromMock.mock.calls.map(call => call[0])).toEqual(['quickbooks_invoices', 'weekly_time_entries']);
    expect(chain.eq).toHaveBeenCalledWith('realm_id', '193514877331929');
    expect(chain.eq).toHaveBeenCalledWith('deals.company_id', FIFTH_LINE_COMPANY_ID);
    expect(chain.in).toHaveBeenCalledWith('deals.pipeline_id', ['b78ad452-b489-4c89-8a91-789347c05f79', '40b17dfb-9122-49e0-bf7c-5aa993d5d615']);
    expect(chain.order).toHaveBeenCalledWith('id');
    expect(chain.range).toHaveBeenCalledWith(0, 499);
    expect(rows).toHaveLength(4);
    expect(rows.at(-1)?.end).toBe('2026-09-30');
  });
  it('disables and rejects queries for a different company', async () => {
    companyMock.mockReturnValue({ company: { id: 'other-tenant' } });
    renderHook(useTtmRevenuePerDealHour);
    const options = queryMock.mock.calls[0]?.[0];
    expect(options.enabled).toBe(false);
    await expect(options.queryFn()).rejects.toThrow('5th Line');
    expect(fromMock).not.toHaveBeenCalled();
  });
});