import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClaapFundingBackfill } from './ClaapFundingBackfill';
const { invoke, identity } = vi.hoisted(() => ({ invoke: vi.fn(), identity: { email: 'jturner@5thline.co' } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: identity }) }));
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClaapFundingBackfill companyId="team-a" /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); identity.email = 'jturner@5thline.co'; invoke.mockResolvedValue({ data: { job: null }, error: null }); });
afterEach(cleanup);
it('reads status without starting imports until requested', async () => {
  mount();
  const start = await screen.findByRole('button', { name: 'Start 4-year backfill' });
  await waitFor(() => expect(start).toBeEnabled());
  expect(invoke).toHaveBeenCalledWith('claap-funding-backfill', { body: { action: 'status', company_id: 'team-a' } });
  expect(invoke).toHaveBeenCalledTimes(1);
  fireEvent.click(start);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('claap-funding-backfill', { body: { action: 'start', company_id: 'team-a' } }));
});
it('pauses and resumes a job in the selected company', async () => {
  invoke.mockResolvedValue({ data: { job: { status: 'running', phase: 'content', scanned: 20 } }, error: null });
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('claap-funding-backfill', { body: { action: 'pause', company_id: 'team-a' } }));
});
it('does not fetch privileged controls for unapproved users', () => {
  identity.email = 'someone@example.com'; mount(); expect(invoke).not.toHaveBeenCalled();
});