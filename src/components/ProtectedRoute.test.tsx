import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

const state = vi.hoisted(() => ({ approval: { data: false as boolean | undefined, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'invitee', email: 'invitee@example.org' }, isLoading: false }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { onboarding_completed: true }, isLoading: false }) }));
vi.mock('@/hooks/useUserApproval', () => ({ useIsApproved: () => state.approval }));

function Gate() {
  return <MemoryRouter initialEntries={['/deals']}><Routes>
    <Route path="/deals" element={<ProtectedRoute><div>Accessible deals</div></ProtectedRoute>} />
    <Route path="/pending-approval" element={<div>Pending account</div>} />
  </Routes></MemoryRouter>;
}
describe('Account approval gate', () => {
  afterEach(cleanup);
  beforeEach(() => { state.approval = { data: false, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }; });
  it('keeps a self-signup without approval out of deals', async () => {
    render(<Gate />);
    expect(await screen.findByText('Pending account')).toBeInTheDocument();
    expect(screen.queryByText('Accessible deals')).not.toBeInTheDocument();
  });
  it('allows an approved invited teammate', () => {
    state.approval.data = true;
    render(<Gate />);
    expect(screen.getByText('Accessible deals')).toBeInTheDocument();
  });
  it('does not grant access or mislabel a transient error, and retries', async () => {
    state.approval.data = true; // A stale success must not override a failed new check.
    state.approval.isError = true;
    const view = render(<Gate />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Accessible deals')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending account')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(state.approval.refetch).toHaveBeenCalledTimes(1);
    state.approval.isError = false;
    view.rerender(<Gate />);
    await waitFor(() => expect(screen.getByText('Accessible deals')).toBeInTheDocument());
  });
});