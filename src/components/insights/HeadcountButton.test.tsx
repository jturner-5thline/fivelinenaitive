import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEADCOUNT_COMPANY_ID } from '@/lib/monthlyHeadcount';
import { HeadcountButton } from './HeadcountButton';
const mocks = vi.hoisted(() => ({ save: vi.fn(), companyId: '44556c46-9127-4b12-b14e-d6fee784afcf', canEdit: true }));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: { id: mocks.companyId } }) }));
vi.mock('@/hooks/useCanEditMasterPlan', () => ({ useCanEditMasterPlan: () => ({ canEditMasterPlan: mocks.canEdit }) }));
vi.mock('@/hooks/useMonthlyHeadcount', () => ({ useMonthlyHeadcount: () => ({ data: {}, isSuccess: true, save: mocks.save }) }));
afterEach(cleanup);
beforeEach(() => { mocks.companyId = HEADCOUNT_COMPANY_ID; mocks.canEdit = true; mocks.save.mockReset().mockResolvedValue(undefined); });
function open() { render(<HeadcountButton />); fireEvent.click(screen.getByRole('button', { name: 'Headcount' })); }
describe('headcount editor', () => {
  it('keeps edits local until save and submits fractional input', async () => {
    open();
    fireEvent.change(screen.getByLabelText(/Debt Jan/), { target: { value: '2.5' } });
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ '193514877331929:0': '2.5' }, {}));
  });
  it('discards changes and blocks invalid saves', () => {
    open(); const input = screen.getByLabelText(/Debt Jan/);
    fireEvent.change(input, { target: { value: '-1' } });
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(input).toHaveValue('');
  });
  it('retains edits after save failure', async () => {
    mocks.save.mockRejectedValue(new Error('denied')); open();
    fireEvent.change(screen.getByLabelText(/Debt Jan/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled());
    expect(screen.getByLabelText(/Debt Jan/)).toHaveValue('3');
  });
  it('confirms before leaving a dirty year', () => {
    open(); fireEvent.change(screen.getByLabelText(/Debt Jan/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/Debt Jan/)).toHaveValue('1');
  });
  it('does not expose the tool in another workspace', () => { mocks.companyId = 'another'; render(<HeadcountButton />); expect(screen.queryByRole('button', { name: 'Headcount' })).toBeNull(); });
  it('makes the table read-only for non-editors', () => { mocks.canEdit = false; open(); expect(screen.getByLabelText(/Debt Jan/)).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull(); });
});