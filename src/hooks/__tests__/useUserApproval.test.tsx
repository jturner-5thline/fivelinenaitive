import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsApproved } from '../useUserApproval';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'invitee' } }) }));
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}
describe('Approval status query', () => {
  afterEach(cleanup);
  beforeEach(() => rpc.mockReset());
  it('preserves an explicit denial', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(useIsApproved, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });
  it('reports request failures as errors instead of denials', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Temporary failure') });
    const { result } = renderHook(useIsApproved, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it('rejects malformed approval responses', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(useIsApproved, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});