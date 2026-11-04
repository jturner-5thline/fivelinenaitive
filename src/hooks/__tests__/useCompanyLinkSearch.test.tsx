import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompanyLinkSearch } from '../useCompanyLinkSearch';

const mocks = vi.hoisted(() => ({ from: vi.fn(), company: { id: 'tenant-a' } as { id: string } | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: mocks.company }) }));
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
describe('Company link directory search', () => {
  let query: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    mocks.company = { id: 'tenant-a' };
    query = Object.fromEntries(['select', 'eq', 'or', 'order', 'range'].map(key => [key, vi.fn()]));
    for (const fn of Object.values(query)) fn.mockReturnValue(query);
    query.range.mockResolvedValue({ data: [{ id: 'boa', name: 'Bank of America Corporation' }], count: 101, error: null });
    mocks.from.mockReset().mockReturnValue(query);
  });
  afterEach(cleanup);
  it('searches the full tenant directory before paging, not a local 1,000-row list', async () => {
    const { result } = renderHook(() => useCompanyLinkSearch('Bank of America Corporation', 0, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(query.eq).toHaveBeenCalledWith('org_company_id', 'tenant-a');
    expect(query.or).toHaveBeenCalledWith('name.ilike.%Corporation%,domain.ilike.%Corporation%,additional_domains.cs.{corporation}');
    expect(query.range).toHaveBeenCalledWith(0, 49);
    expect(result.current.data?.data[0].id).toBe('boa');
    expect(result.current.data?.totalPages).toBe(3);
  });
  it('searches primary and alternate domains and pages results', async () => {
    const { result } = renderHook(() => useCompanyLinkSearch('bofa.com', 1, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(query.or).toHaveBeenCalledWith('name.ilike.%bofa.com%,domain.ilike.%bofa.com%,additional_domains.cs.{bofa.com}');
    expect(query.range).toHaveBeenCalledWith(50, 99);
  });
  it('does not query without a verified workspace', () => {
    mocks.company = null;
    renderHook(() => useCompanyLinkSearch('Bank', 0, true), { wrapper });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not query while the picker is closed', () => {
    renderHook(() => useCompanyLinkSearch('', 0, false), { wrapper });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('propagates access failures without displaying stale results', async () => {
    query.range.mockResolvedValue({ data: null, error: new Error('Forbidden') });
    const { result } = renderHook(() => useCompanyLinkSearch('Bank', 0, true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});