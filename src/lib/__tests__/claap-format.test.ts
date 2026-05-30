import { describe, it, expect } from 'vitest';
import { parseClaapActionItemText } from '@/lib/claap-format';

describe('parseClaapActionItemText', () => {
  it('strips bold assignee prefix with colon', () => {
    const out = parseClaapActionItemText(
      '**James Turner**: send an NDA to **Shimmy Ruben** for the equipment finance deal.'
    );
    expect(out).toEqual({
      text: 'Send an NDA to Shimmy Ruben for the equipment finance deal.',
      assigneeName: 'James Turner',
    });
  });

  it('strips bold assignee prefix with em dash', () => {
    const out = parseClaapActionItemText(
      '**James Turner** — have Flora follow up via email with **Shimmy Ruben** to send the NDA and schedule a demo of the deal management platform.'
    );
    expect(out).toEqual({
      text: 'Have Flora follow up via email with Shimmy Ruben to send the NDA and schedule a demo of the deal management platform.',
      assigneeName: 'James Turner',
    });
  });

  it('returns text unchanged when no assignee prefix', () => {
    const out = parseClaapActionItemText('Send recap email to attendees.');
    expect(out).toEqual({ text: 'Send recap email to attendees.' });
    expect(out.assigneeName).toBeUndefined();
  });

  it('strips Claap timestamps and markdown', () => {
    const out = parseClaapActionItemText('**Alice**: review the **deck** %[16:03]() before EOD');
    expect(out.assigneeName).toBe('Alice');
    expect(out.text).toBe('Review the deck before EOD');
  });
});