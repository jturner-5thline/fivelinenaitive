import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MasterPlanDialog } from './MasterPlanDialog';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: { id: 'test-company' } }) }));
vi.mock('./FinancialsPlanGrid', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    FinancialsPlanGrid: forwardRef(function FinancialsStub(_, ref) {
      useImperativeHandle(ref, () => ({ isDirty: () => false, save: async () => true }));
      return <input aria-label="Financial plan value" />;
    }),
  };
});
vi.mock('@/components/insights/HeadcountGrid', () => ({ HeadcountGrid: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        in: () => query,
        eq: async () => ({ data: [], error: null }),
        is: async () => ({ data: [], error: null }),
      };
      return query;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

afterEach(cleanup);

describe('Master Plan opening tab', () => {
  it('opens Financials and restores it after closing from another tab', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    const view = (open: boolean) => (
      <QueryClientProvider client={client}>
        <MasterPlanDialog open={open} onOpenChange={onOpenChange} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(true));
    expect(screen.getByRole('textbox', { name: 'Financial plan value' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sales Dashboard' }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Financial plan value' })).toBeNull());
    rerender(view(false));
    rerender(view(true));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Financial plan value' })).toBeInTheDocument());
  });
});