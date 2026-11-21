import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
const { account } = vi.hoisted(() => ({ account: { company: { id: '44556c46-9127-4b12-b14e-d6fee784afcf' }, isLoading: false } }));
vi.mock('@/hooks/useCompany', () => ({ useCompany: () => account }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { DealQualifiersPanel } from './DealQualifiersPanel';
const saved = { executed_qualifies: false, match_rule: 'all', criteria: [{ id: '11111111-1111-4111-8111-111111111111', position: 0, text: 'Original requirement', is_met: false }], updated_at: '2026-11-21T00:00:00Z' };
beforeEach(() => {
  account.company.id = '44556c46-9127-4b12-b14e-d6fee784afcf'; account.isLoading = false;
  rpc.mockReset(); rpc.mockResolvedValue({ data: saved, error: null });
});
describe('5th Line account availability', () => {
  it('loads the editor for the canonical 5th Line account', async () => {
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    expect(await screen.findByLabelText('Qualifier text')).toHaveValue('Original requirement');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('does not mount or read qualifiers for another account', () => {
    account.company.id = '22222222-2222-4222-8222-222222222222';
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.queryByLabelText('Add qualifier')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not mount or read qualifiers while account membership is loading', () => {
    account.isLoading = true;
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.queryByLabelText('Add qualifier')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('unmounts the editor and its draft when switching to another account', async () => {
    const view = render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    fireEvent.change(await screen.findByLabelText('Qualifier text'), { target: { value: 'Unsaved draft' } });
    account.company.id = '22222222-2222-4222-8222-222222222222';
    view.rerender(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    expect(screen.queryByLabelText('Qualifier text')).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    account.company.id = '44556c46-9127-4b12-b14e-d6fee784afcf';
    view.rerender(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    expect(await screen.findByLabelText('Qualifier text')).toHaveValue('Original requirement');
  });
});
describe('qualifier agreement confirmation', () => {
  it('allows editing the final requirement and adding/deleting rows without saving until confirmation', async () => {
    const criteria = Array.from({ length: 7 }, (_, position) => ({
      id: `11111111-1111-4111-8111-11111111111${position}`,
      position, text: `Requirement ${position + 1}`, is_met: false,
    }));
    rpc.mockResolvedValue({ data: { ...saved, criteria }, error: null });
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    await screen.findByDisplayValue('Requirement 7');
    fireEvent.change(screen.getByDisplayValue('Requirement 7'), { target: { value: 'Edited final requirement' } });
    fireEvent.click(screen.getAllByLabelText('Mark qualifier met')[6]);
    fireEvent.click(screen.getByLabelText('Add qualifier'));
    expect(screen.getAllByLabelText('Qualifier text')).toHaveLength(8);
    fireEvent.click(screen.getAllByLabelText('Delete qualifier')[7]);
    expect(screen.getAllByLabelText('Qualifier text')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByDisplayValue('Requirement 7')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Mark qualifier met')).toHaveLength(7);
  });
  it('stages text and signed-company edits, then discards on outside click', async () => {
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    const text = await screen.findByLabelText('Qualifier text');
    fireEvent.change(text, { target: { value: 'Draft requirement' } });
    fireEvent.click(screen.getByLabelText('Signed by company counts'));
    expect(rpc).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(text).toHaveValue('Original requirement');
    expect(screen.getByLabelText('Signed by company counts')).toHaveAttribute('aria-checked', 'false');
  });
  it('requires confirmation, sends the whole record atomically and reloads it', async () => {
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    const text = await screen.findByLabelText('Qualifier text');
    fireEvent.change(text, { target: { value: '  Changed verbatim  ' } });
    fireEvent.click(screen.getByLabelText('Mark qualifier met'));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('upsert_deal_qualifiers_record', expect.objectContaining({ p_dry_run: false, p_expected_updated_at: saved.updated_at, p_record: expect.objectContaining({ criteria: [expect.objectContaining({ text: '  Changed verbatim  ', is_met: true })] }) })));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  });
  it('keeps unsaved edits after a failed save', async () => {
    render(<DealQualifiersPanel dealId="11111111-1111-4111-8111-111111111111" />);
    const text = await screen.findByLabelText('Qualifier text');
    fireEvent.change(text, { target: { value: 'Keep my draft' } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(text).toHaveValue('Keep my draft');
  });
});