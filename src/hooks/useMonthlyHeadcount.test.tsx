import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMonthlyHeadcount } from './useMonthlyHeadcount';
import { HEADCOUNT_COMPANY_ID } from '@/lib/monthlyHeadcount';
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), eq: vi.fn(), gte: vi.fn(), lt: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: mocks.eq }), upsert: mocks.upsert }) } }));
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.eq.mockReturnValue({ gte: mocks.gte }); mocks.gte.mockReturnValue({ lt: mocks.lt });
  mocks.lt.mockResolvedValue({ data: [{ realm_id: '193514877331929', month: '2026-01-01', headcount: 2.5 }], error: null });
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  return renderHook(() => useMonthlyHeadcount(HEADCOUNT_COMPANY_ID, 2026, true), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
describe('headcount storage', () => {
  it('reads the workspace and year and writes only changed cells', async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.eq).toHaveBeenCalledWith('company_id', HEADCOUNT_COMPANY_ID);
    expect(mocks.gte).toHaveBeenCalledWith('month', '2026-01-01');
    expect(mocks.lt).toHaveBeenCalledWith('month', '2027-01-01');
    const baseline = result.current.data ?? {};
    await act(() => result.current.save({ ...baseline, '193514877331929:0': '3' }, baseline));
    expect(mocks.upsert).toHaveBeenCalledWith([{ company_id: HEADCOUNT_COMPANY_ID, realm_id: '193514877331929', month: '2026-01-01', headcount: 3 }], { onConflict: 'company_id,realm_id,month' });
    await waitFor(() => expect(result.current.data?.['193514877331929:0']).toBe('3'));
  });
  it('does not overwrite the cached baseline on rejected writes', async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mocks.upsert.mockResolvedValue({ error: new Error('permission denied') });
    await expect(result.current.save({ '193514877331929:0': '4' }, result.current.data ?? {})).rejects.toThrow('permission denied');
    expect(result.current.data?.['193514877331929:0']).toBe('2.5');
  });
});