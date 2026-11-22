import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEADCOUNT_COMPANY_ID } from '@/lib/monthlyHeadcount';
import { HeadcountGrid, type HeadcountGridHandle } from './HeadcountGrid';
const mocks = vi.hoisted(() => ({ save: vi.fn(), companyId: '44556c46-9127-4b12-b14e-d6fee784afcf', canEdit: true }));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => ({ company: { id: mocks.companyId } }) }));
vi.mock('@/hooks/useCanEditMasterPlan', () => ({ useCanEditMasterPlan: () => ({ canEditMasterPlan: mocks.canEdit }) }));
vi.mock('@/hooks/useMonthlyHeadcount', () => ({ useMonthlyHeadcount: () => ({ data: {}, isSuccess: true, save: mocks.save }) }));
afterEach(cleanup);
beforeEach(() => { mocks.companyId = HEADCOUNT_COMPANY_ID; mocks.canEdit = true; mocks.save.mockReset().mockResolvedValue(undefined); });
let ref = createRef<HeadcountGridHandle>();
function open() { ref = createRef<HeadcountGridHandle>(); render(<HeadcountGrid ref={ref} />); }
const save = () => act(async () => { await ref.current!.save(); });
describe('headcount editor', () => {
  it('keeps edits local until save and submits fractional input', async () => {
    open();
    fireEvent.change(screen.getByLabelText(/Debt Jan/), { target: { value: '2.5' } });
    expect(mocks.save).not.toHaveBeenCalled();
    await save();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ '193514877331929:0': '2.5' }, {}));
  });
  it('discards changes and blocks invalid saves', () => {
    open(); const input = screen.getByLabelText(/Debt Jan/);
    fireEvent.change(input, { target: { value: '-1' } });
    expect(ref.current!.isInvalid()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(input).toHaveValue('');
  });
  it('retains edits after save failure', async () => {
    mocks.save.mockRejectedValue(new Error('denied')); open();
    fireEvent.change(screen.getByLabelText(/Debt Jan/), { target: { value: '3' } });
    await save();
    expect(mocks.save).toHaveBeenCalled();
    expect(screen.getByLabelText(/Debt Jan/)).toHaveValue('3');
  });
  it('shows the year chosen in the Master Plan header and clears drafts when it changes', () => {
    const { rerender } = render(<HeadcountGrid year={2027} />);
    fireEvent.change(screen.getByLabelText(/Debt Jan/), { target: { value: '1' } });
    rerender(<HeadcountGrid year={2028} />);
    expect(screen.getByLabelText(/Debt Jan.*2028/)).toHaveValue('');
    expect(screen.queryByRole('button', { name: '2028' })).toBeNull();
  });
  it('does not expose the tool in another workspace', () => { mocks.companyId = 'another'; const { container } = render(<HeadcountGrid />); expect(container).toBeEmptyDOMElement(); });
  it('makes the table read-only for non-editors', () => { mocks.canEdit = false; open(); expect(screen.getByLabelText(/Debt Jan/)).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull(); });
  it('has no separate Save Changes button', () => { open(); expect(screen.queryByRole('button', { name: /Save Changes/ })).toBeNull(); });
});