import { describe, it, expect, vi } from 'vitest';

const invokeMock = vi.fn().mockResolvedValue({ data: { result: { text: 'Test status.' } }, error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: any[]) => invokeMock(...args) } },
}));

import { suggestStatusNoteUpdate } from '../smartStatusNoteSuggestion';

describe('suggestStatusNoteUpdate invoke contract', () => {
  it('invokes smart-email-ai without custom headers (no CORS preflight)', async () => {
    await suggestStatusNoteUpdate({
      dealId: 'd1',
      companyName: 'Czerlonka',
      stageLabel: 'terms-issued',
      currentNote: 'note',
      lendersSent: [{ name: 'CSG' }],
      lendersPassed: [],
      recentClientEmails: [{ direction: 'in', subject: 'x', at: 'May 18' }],
      lastMeetingSummary: null,
      outstandingItems: [],
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [slug, opts] = invokeMock.mock.calls[0];
    expect(slug).toBe('smart-email-ai');
    expect(opts.body.action).toBe('suggest_status_update');
    // Guard against re-introducing a header that triggers a CORS preflight.
    expect(opts.headers).toBeUndefined();
  });
});