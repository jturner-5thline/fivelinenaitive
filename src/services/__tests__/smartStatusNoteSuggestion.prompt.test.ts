import { describe, it, expect } from 'vitest';
import { collectSources } from '../smartStatusNoteSuggestion';

// buildPrompt is not exported; re-exercise via the public path by inspecting
// the invoke body. We test the prompt-relevant transformation via a thin
// wrapper: import the module fresh and reach the internal function via the
// exported invoke service in a mock-friendly way.
import { suggestStatusNoteUpdate } from '../smartStatusNoteSuggestion';
import { vi } from 'vitest';

const invoke = vi.fn().mockResolvedValue({ data: { result: { text: 'ok.' } }, error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: any[]) => invoke(...a) } },
}));

describe('buildPrompt recent-emails section', () => {
  it('emits "Recent emails (last 14d):" with up to 6 rows and date prefix', async () => {
    invoke.mockClear();
    await suggestStatusNoteUpdate({
      dealId: 'd1',
      companyName: 'Czerlonka',
      stageLabel: 'terms-issued',
      currentNote: 'submitted to CSG',
      lendersSent: [{ name: 'CSG' }],
      lendersPassed: [],
      recentClientEmails: [
        { direction: 'in', subject: 'Re: Czerlonka | CSG Reply', at: 'May 22' },
        { direction: 'in', subject: 'Re: Czerlonka & 5th Line', at: 'May 20' },
        { direction: 'out', subject: 'Czerlonka | Pershing Intro', at: 'May 12' },
      ],
      lastMeetingSummary: null,
      outstandingItems: [],
    });
    const userPrompt: string = invoke.mock.calls[0][1].body.userPrompt;
    expect(userPrompt).toContain('Recent emails (last 14d):');
    expect(userPrompt).toContain('May 22 inbound: Re: Czerlonka | CSG Reply');
  });

  it('collectSources still reports email count', () => {
    const out = collectSources({
      dealId: 'd1', companyName: 'X', stageLabel: null, currentNote: null,
      lendersSent: [], lendersPassed: [],
      recentClientEmails: [
        { direction: 'in', subject: 'a', at: 'May 22' },
        { direction: 'out', subject: 'b', at: 'May 21' },
      ],
      lastMeetingSummary: null, outstandingItems: [],
    });
    expect(out.join(' ')).toContain('2 recent client emails');
  });
});