/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const calls: Array<{ table: string; filters: Record<string, any>; ilike?: [string, string]; gte?: [string, string] }> = [];
const fixtures: Record<string, any[]> = {
  deal_emails: [],
  gmail_messages: [],
  email_threads_linked: [],
  email_threads_subject: [
    { thread_id: 't1', subject: 'Out of Office Re: Czerlonka | Capital Source Group – New Deal ~$1.5MM', latest_message_at: '2026-05-22T17:59:38+00:00' },
    { thread_id: 't2', subject: 'Re: Czerlonka | Capital Source Group – New Deal ~$1.5MM', latest_message_at: '2026-05-22T17:59:34+00:00' },
    { thread_id: 't3', subject: 'Re: Czerlonka & 5th Line', latest_message_at: '2026-05-20T23:06:53+00:00' },
    { thread_id: 't4', subject: 'Fwd: Czerlonka Event Design & Management', latest_message_at: '2026-05-20T23:02:58+00:00' },
    { thread_id: 't5', subject: 'Re: Czerlonka | 5th Line Status Update', latest_message_at: '2026-05-15T19:48:36+00:00' },
    { thread_id: 't6', subject: 'Re: Czerlonka & Pershing Ventures | Introduction', latest_message_at: '2026-05-12T19:15:42+00:00' },
  ],
};

vi.mock('@/integrations/supabase/client', () => {
  const make = (table: string) => {
    const state: any = { table, filters: {}, ilike: undefined, gte: undefined };
    const builder: any = {
      select() { return builder; },
      eq(col: string, val: any) { state.filters[col] = val; return builder; },
      ilike(col: string, pattern: string) { state.ilike = [col, pattern]; return builder; },
      gte(col: string, v: string) { state.gte = [col, v]; return builder; },
      order() { return builder; },
      in() { return builder; },
      limit() {
        calls.push(state);
        let rows: any[] = [];
        if (table === 'deal_emails') rows = fixtures.deal_emails;
        else if (table === 'gmail_messages') rows = fixtures.gmail_messages;
        else if (table === 'email_threads') {
          rows = state.filters.matched_deal_id ? fixtures.email_threads_linked : fixtures.email_threads_subject;
        }
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return builder;
  };
  return { supabase: { from: (t: string) => make(t) } };
});

import { useStaleStatusNoteContext } from '../useStaleStatusNoteContext';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useStaleStatusNoteContext recent emails', () => {
  beforeEach(() => { calls.length = 0; });

  it('falls back to email_threads subject match when deal_emails is empty (Czerlonka)', async () => {
    const deal: any = {
      id: 'fac785ba-14cc-4930-9e1c-8299234567fe',
      company: 'Czerlonka',
      stage: 'terms-issued',
      notes: 'submitted to CSG',
      lenders: [],
      contactInfo: '',
    };
    const { result } = renderHook(() => useStaleStatusNoteContext(deal, true), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const rows = result.current.data!.recentClientEmails;
    expect(rows.length).toBeGreaterThanOrEqual(6);
    // Latest-first ordering
    expect(rows[0].subject).toMatch(/Capital Source Group/);
    expect(rows[0].at).toMatch(/May 22/);
    // Direction heuristic: "Re:"/"Fwd:" → inbound, plain subject → outbound
    expect(rows[0].direction).toBe('in');
    // Query targets email_threads with company token
    const subjectQuery = calls.find(c => c.table === 'email_threads' && c.ilike);
    expect(subjectQuery?.ilike?.[1]).toContain('Czerlonka');
    expect(subjectQuery?.gte?.[0]).toBe('latest_message_at');
  });
});