import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BdRevenuePerHourWidget } from './BdRevenuePerHourWidget';

vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: { id: 'workspace' } }) }));
vi.mock('@/contexts/SalesBdDateRangeContext', () => ({ useOptionalSalesBdDateRange: () => ({ start: new Date('2026-01-01'), end: new Date('2026-03-31') }) }));
vi.mock('@/hooks/useDealReferralSources', () => ({
  useDealReferralSources: () => ({ isLoading: false, resolveChannel: () => 'Banks', referralSources: [
    { contactId: 'armen', referredBy: 'Armen', crmCompanyId: 'boa', companyName: 'Bank of America', channelType: 'Banks', deals: [{ id: 'd1', company: 'Client', ndaEnteredAt: '2026-03-01T10:00:00Z' }] },
    { contactId: 'pat', referredBy: 'Pat', crmCompanyId: 'advisors', companyName: 'Advisor Co', channelType: 'Advisors', deals: [{ id: 'd2', company: 'Other Client', ndaEnteredAt: '2026-01-02T10:00:00Z' }] },
    { contactId: 'missing', referredBy: 'No NDA', deals: [{ id: 'd3', company: 'Missing date', ndaEnteredAt: null }] },
  ] }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));

afterEach(cleanup);

function renderWidget(calendarError = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['bd_rev_hour_fees', 'workspace', 'd1,d2'], new Map([['d1', 100000], ['d2', 50000]]));
  client.setQueryData(['bd_rev_hour_emails', 'workspace', 'armen,pat'], new Map([['armen', ['armen@boa.com']], ['pat', ['pat@advisor.com']]]));
  if (!calendarError) client.setQueryData(['bd_rev_hour_meetings', 'workspace', '2026-01-01T00:00:00.000Z', '2026-03-31T00:00:00.000Z'], [
    { id: 'm1', start: '2026-01-10T10:00:00Z', end: '2026-01-10T11:00:00Z', attendeeEmails: ['armen@boa.com'], matchedContactId: null },
    { id: 'm2', start: '2026-02-10T10:00:00Z', end: '2026-02-10T11:00:00Z', attendeeEmails: ['armen@boa.com'], matchedContactId: null },
    { id: 'm3', start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z', attendeeEmails: ['pat@advisor.com'], matchedContactId: null },
  ]);
  return render(<QueryClientProvider client={client}><TooltipProvider><BdRevenuePerHourWidget /></TooltipProvider></QueryClientProvider>);
}

describe('BD referral correlation interactions', () => {
  it('expands contact/company rollups and sorts lag both ways without losing expansion', () => {
    renderWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Banks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bank of America' }));
    const armen = screen.getByRole('button', { name: 'Armen' }).closest('tr');
    expect(armen).not.toBeNull();
    if (!armen) throw new Error('Missing contact row');
    const cells = within(armen).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('2');
    expect(cells[6]).toHaveTextContent('2.0');
    expect(cells[7]).toHaveTextContent('4.9 wks');
    expect(screen.queryByText('No NDA')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avg Lag to Deal' }));
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Debt Advisor');
    fireEvent.click(screen.getByRole('button', { name: 'Avg Lag to Deal ↑' }));
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Banks');
    expect(screen.getByRole('button', { name: 'Armen' })).toBeInTheDocument();
  });
  it('shows unavailable meeting metrics when calendar loading fails', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: new Error('Offline') } as Awaited<ReturnType<typeof supabase.functions.invoke>>);
    renderWidget(true);
    await screen.findByText('Calendar meetings could not be loaded; meeting metrics are unavailable.');
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('—');
    expect(cells[6]).toHaveTextContent('—');
    expect(cells[7]).toHaveTextContent('—');
  });
});