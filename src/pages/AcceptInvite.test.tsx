import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptInvite from './AcceptInvite';

const { rpc, invoke, seed } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), seed: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'invitee', email: 'invitee@example.org' }, isLoading: false }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { first_name: 'Jane', display_name: 'Jane' }, isLoading: false }) }));
vi.mock('@/utils/seedSampleDeal', () => ({ seedSampleDeal: seed }));
vi.mock('@/components/onboarding/ProfileSetupModal', () => ({ ProfileSetupModal: () => null }));
vi.mock('@/components/company/MigrateDealsDialog', () => ({ MigrateDealsDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) => open ? <button onClick={onClose}>Finish joining</button> : null }));

describe('Invitation acceptance', () => {
  afterEach(cleanup);
  beforeEach(() => {
    rpc.mockReset(); seed.mockReset(); invoke.mockReset();
    invoke.mockResolvedValue({ data: { status: 'valid', invitation: { id: 'invitation', email: 'invitee@example.org', company_id: 'company', company_name: 'Test company', role: 'member', expires_at: '2030-01-01' } }, error: null });
  });
  function open() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['user-approved', 'invitee'], false);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<HelmetProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={['/accept-invite?token=test-token']}><Routes>
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/deals" element={<div>Joined deals</div>} />
    </Routes></MemoryRouter></QueryClientProvider></HelmetProvider>);
    return { client, invalidate };
  }
  it('commits through the trusted operation and refreshes cached rejection before continuing', async () => {
    rpc.mockResolvedValue({ error: null });
    const { client, invalidate } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish joining' }));
    expect(await screen.findByText('Joined deals')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('accept_company_invitation', { _token: 'test-token' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user-approved', 'invitee'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['company', 'invitee'] });
    expect(client.getQueryState(['user-approved', 'invitee'])?.isInvalidated).toBe(true);
  });
  it('does not continue or seed when server validation denies acceptance', async () => {
    rpc.mockResolvedValue({ error: new Error('Invitation expired') });
    open();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(seed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Finish joining' })).not.toBeInTheDocument();
  });
});