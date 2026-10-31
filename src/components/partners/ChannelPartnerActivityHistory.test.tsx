import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelPartnerActivityHistory } from './ChannelPartnerActivityHistory';

const { from, select, eq, order } = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: { id: 'team-a' } }) }));

function mount(partnerId: string | null = 'partner-a') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ChannelPartnerActivityHistory partnerId={partnerId} />
  </QueryClientProvider>);
}

describe('Channel partner history reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue({ select });
    select.mockReturnValue({ eq });
    eq.mockReturnValue({ eq, order });
    order.mockResolvedValue({ data: [], error: null });
  });
  afterEach(cleanup);

  it('reads only the selected partner and current company, newest first', async () => {
    mount();
    await waitFor(() => expect(order).toHaveBeenCalled());
    expect(from).toHaveBeenCalledWith('channel_partner_history');
    expect(eq).toHaveBeenCalledWith('channel_partner_id', 'partner-a');
    expect(eq).toHaveBeenCalledWith('company_id', 'team-a');
    expect(order).toHaveBeenCalledWith('occurred_at', { ascending: false });
  });

  it('does not fetch without a selected partner', () => {
    mount(null);
    expect(from).not.toHaveBeenCalled();
  });

  it('retries a failed read without mutating partner records', async () => {
    order.mockResolvedValueOnce({ data: null, error: new Error('Unavailable') });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(order).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(from.mock.calls.every(([table]) => table === 'channel_partner_history')).toBe(true);
  });
});