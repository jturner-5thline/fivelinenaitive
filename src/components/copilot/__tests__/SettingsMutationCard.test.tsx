/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
  },
}));

let mockIsAdmin = true;
vi.mock('@/hooks/useCompany', () => ({
  useCompany: () => ({ isAdmin: mockIsAdmin, company: { id: 'co_1' } }),
}));

import { SettingsMutationCard } from '../SettingsMutationCard';
import type { SettingsProposal } from '@/hooks/useSettingsMutation';

const baseProposal: SettingsProposal = {
  diff_id: 'diff_1',
  tool_name: 'settings.update_company_name',
  human_name: 'Company name',
  description: 'Display name shown across the workspace.',
  settings_tab: 'company',
  target_table: 'companies',
  target_column: 'name',
  current_value: '5th Line',
  proposed_value: '5th Line Capital',
  source_prompt: 'rename company to 5th Line Capital',
  requires_role: 'company_admin',
};

function renderCard(p: Partial<SettingsProposal> = {}) {
  return render(
    <MemoryRouter>
      <SettingsMutationCard proposal={{ ...baseProposal, ...p }} />
    </MemoryRouter>
  );
}

describe('SettingsMutationCard', () => {
  beforeEach(() => {
    mockIsAdmin = true;
    invokeMock.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('T1 admin happy path: shows diff and applies', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, undo_token: 'u1' }, error: null });
    renderCard();
    expect(screen.getByTestId('current-value')).toHaveTextContent('5th Line');
    expect(screen.getByTestId('proposed-value')).toHaveTextContent('5th Line Capital');
    fireEvent.click(screen.getByTestId('accept-btn'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const [fn, { body }] = invokeMock.mock.calls[0];
    expect(fn).toBe('ai-settings-apply');
    expect(body.diff_id).toBe('diff_1');
    expect(body.undo).toBe(false);
    await screen.findByText(/Applied/);
  });

  it('T2 Edit overrides proposed_value before apply', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    renderCard();
    fireEvent.click(screen.getByTestId('edit-btn'));
    const ta = screen.getByTestId('edit-input') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '5th Line Capital LLC' } });
    fireEvent.click(screen.getByTestId('accept-btn'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock.mock.calls[0][1].body.proposed_value).toBe('5th Line Capital LLC');
  });

  it('T3 non-admin: Accept disabled, explainer visible, deep link present', () => {
    mockIsAdmin = false;
    renderCard();
    expect(screen.getByTestId('accept-btn')).toBeDisabled();
    expect(screen.getByText(/Admin only/)).toBeInTheDocument();
    const cancel = screen.getByTestId('cancel-btn') as HTMLAnchorElement;
    expect(cancel.getAttribute('href')).toBe('/settings?tab=company');
  });

  it('T4 rate-limit 429 surfaces friendly error', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error('rate'), { context: { status: 429 } }),
    });
    renderCard();
    fireEvent.click(screen.getByTestId('accept-btn'));
    await screen.findByText(/Rate limit reached/);
  });

  it('T5 Undo within 30s posts undo:true', async () => {
    invokeMock.mockResolvedValueOnce({ data: { undo_token: 'u9' }, error: null });
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    renderCard();
    fireEvent.click(screen.getByTestId('accept-btn'));
    await screen.findByText(/Applied/);
    fireEvent.click(screen.getByTestId('undo-btn'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const undoCall = invokeMock.mock.calls[1][1].body;
    expect(undoCall.undo).toBe(true);
    expect(undoCall.undo_token).toBe('u9');
    await screen.findByText(/Change reverted/);
  });

  it('T6 Undo button disappears after 30s', async () => {
    invokeMock.mockResolvedValueOnce({ data: { undo_token: 'u9' }, error: null });
    renderCard();
    fireEvent.click(screen.getByTestId('accept-btn'));
    await screen.findByText(/Applied/);
    expect(screen.getByTestId('undo-btn')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(screen.queryByTestId('undo-btn')).toBeNull();
  });
});