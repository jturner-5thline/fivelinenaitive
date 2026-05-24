/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock auth / permissions / context-hook / suggestion service / audit
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'ian@example.com', user_metadata: { full_name: 'Ian Phillips' } },
  }),
}));

let mockPermissions: any = { admin: true, deals: true };
vi.mock('@/hooks/useUserPermissions', () => ({
  useUserPermissions: () => ({ permissions: mockPermissions }),
}));

let mockCtx: any = {
  dealId: 'd1',
  companyName: 'Worthy',
  stageLabel: 'submitted-to-lenders',
  currentNote: 'submitted to Advantage + Eastward',
  lendersSent: [{ name: 'Advantage', sentAt: 'May 18' }, { name: 'Eastward', sentAt: 'May 18' }],
  lendersPassed: [],
  recentClientEmails: [{ direction: 'in', subject: 'Re: term sheet', at: 'May 21' }],
  lastMeetingSummary: null,
  outstandingItems: [],
};
let mockCtxLoading = false;
vi.mock('@/hooks/useStaleStatusNoteContext', () => ({
  useStaleStatusNoteContext: () => ({ data: mockCtx, isLoading: mockCtxLoading }),
}));

const mockSuggest = vi.fn();
vi.mock('@/services/smartStatusNoteSuggestion', async () => {
  const actual = await vi.importActual<any>('@/services/smartStatusNoteSuggestion');
  return {
    ...actual,
    suggestStatusNoteUpdate: (...args: any[]) => mockSuggest(...args),
  };
});

vi.mock('@/lib/naitivePipelineAudit', () => ({
  logNaitivePipelineAudit: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: () => {}, error: () => {} } }));

import { StaleStatusNudge } from '../StaleStatusNudge';

const baseDeal: any = {
  id: 'd1',
  company: 'Worthy',
  name: 'Worthy',
  stage: 'submitted-to-lenders',
  status: 'on-track',
  notes: 'submitted to Advantage + Eastward',
  notesUpdatedAt: '2026-05-15T14:00:00Z', // > 3 BD before May 24
  lenders: [],
  contactInfo: '',
  manager: 'Ian Phillips',
  dealOwner: 'Ian Phillips',
};

const TODAY = new Date('2026-05-24T10:00:00');

describe('StaleStatusNudge', () => {
  beforeEach(() => {
    mockPermissions = { admin: true, deals: true };
    mockCtxLoading = false;
    mockSuggest.mockReset();
    mockSuggest.mockResolvedValue({
      text: 'Submitted to Advantage and Eastward May 18; awaiting Eastward reply.',
      ok: true,
      sources: ['2 lenders sent'],
    });
  });

  it('hides when deal is closed/lost', () => {
    render(<StaleStatusNudge deal={{ ...baseDeal, stage: 'closed-lost' }} onSave={() => {}} now={TODAY} />);
    expect(screen.queryByLabelText('Draft AI status update')).toBeNull();
  });

  it('hides when deal is past Terms Issued (in-due-diligence)', () => {
    render(<StaleStatusNudge deal={{ ...baseDeal, stage: 'in-due-diligence' }} onSave={() => {}} now={TODAY} />);
    expect(screen.queryByLabelText('Draft AI status update')).toBeNull();
  });

  it('hides for read-only viewers', () => {
    mockPermissions = { admin: false, deals: false };
    render(<StaleStatusNudge deal={baseDeal} onSave={() => {}} now={TODAY} />);
    expect(screen.queryByLabelText('Draft AI status update')).toBeNull();
  });

  it('hides when note is fresh (Worthy: Fri 5/22 → Sun 5/24 = 0 BD)', () => {
    render(
      <StaleStatusNudge
        deal={{ ...baseDeal, notesUpdatedAt: '2026-05-22T14:03:00Z' }}
        onSave={() => {}}
        now={TODAY}
      />,
    );
    expect(screen.queryByLabelText('Draft AI status update')).toBeNull();
  });

  it('shows icon when stale', () => {
    render(<StaleStatusNudge deal={baseDeal} onSave={() => {}} now={TODAY} />);
    expect(screen.getByLabelText('Draft AI status update')).toBeInTheDocument();
  });

  it('opens popover, fetches suggestion, Accept saves and writes audit', async () => {
    const onSave = vi.fn();
    render(<StaleStatusNudge deal={baseDeal} onSave={onSave} now={TODAY} />);
    fireEvent.click(screen.getByLabelText('Draft AI status update'));
    await waitFor(() => expect(mockSuggest).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() =>
      expect(screen.getByTestId('stale-status-suggestion').textContent).toMatch(/Advantage/),
    );
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }));
    expect(onSave).toHaveBeenCalledWith(
      'Submitted to Advantage and Eastward May 18; awaiting Eastward reply.',
    );
  });

  it('Generate again re-fires suggestion', async () => {
    render(<StaleStatusNudge deal={baseDeal} onSave={() => {}} now={TODAY} />);
    fireEvent.click(screen.getByLabelText('Draft AI status update'));
    await waitFor(() => expect(mockSuggest).toHaveBeenCalledTimes(1), { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: /Generate again/ }));
    await waitFor(() => expect(mockSuggest).toHaveBeenCalledTimes(2));
  });

  it('Edit makes textarea writable; Save persists edited value', async () => {
    const onSave = vi.fn();
    render(<StaleStatusNudge deal={baseDeal} onSave={onSave} now={TODAY} />);
    fireEvent.click(screen.getByLabelText('Draft AI status update'));
    await waitFor(() => expect(mockSuggest).toHaveBeenCalled(), { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const ta = await screen.findByTestId('stale-status-edit') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'Manually edited status.' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(onSave).toHaveBeenCalledWith('Manually edited status.');
  });

  it('insufficient activity shows fallback with only Cancel + Edit', async () => {
    const original = { ...mockCtx };
    mockCtx = {
      ...mockCtx,
      lendersSent: [],
      lendersPassed: [],
      recentClientEmails: [],
      lastMeetingSummary: null,
      outstandingItems: [],
    };
    render(<StaleStatusNudge deal={baseDeal} onSave={() => {}} now={TODAY} />);
    fireEvent.click(screen.getByLabelText('Draft AI status update'));
    await waitFor(() =>
      expect(screen.getByText(/Not enough recent activity/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Accept/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Generate again/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    mockCtx = original;
  });
});