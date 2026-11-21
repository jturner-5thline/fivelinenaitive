import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { DealQualifiersPanel } from './DealQualifiersPanel';
const saved = { executed_qualifies: false, match_rule: 'all', criteria: [{ id: '11111111-1111-4111-8111-111111111111', position: 0, text: 'Original requirement', is_met: false }], updated_at: '2026-11-21T00:00:00Z' };
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: saved, error: null }); });
describe('qualifier agreement confirmation', () => {
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