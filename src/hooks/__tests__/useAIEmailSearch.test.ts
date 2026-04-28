import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';

// Mock the supabase client's `functions.invoke` before importing the hook so
// the mocked module is what the hook closes over.
const mockedInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockedInvoke(...args) },
  },
}));

import { useAIEmailSearch } from '@/hooks/useAIEmailSearch';
import type { MockEmail } from '@/components/deal/email/mockEmailData';

// ── Tiny renderHook shim ───────────────────────────────────────
// We avoid @testing-library/react (not in this project) and drive the hook
// through React's standard root API on a jsdom-ish container.
type HookHarness<T> = {
  current: T;
  rerender: () => void;
  unmount: () => void;
};

function ensureDom() {
  // vitest's default env is node — minimally polyfill what react-dom needs.
  const g = globalThis as any;
  if (!g.document) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>');
    g.window = dom.window;
    g.document = dom.window.document;
    g.navigator = dom.window.navigator;
    g.HTMLElement = dom.window.HTMLElement;
  }
}

function renderHook<T>(hook: () => T): HookHarness<T> {
  ensureDom();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const ref: { current: T | null } = { current: null };
  const Wrapper: React.FC = () => {
    ref.current = hook();
    return null;
  };
  const root = ReactDOMClient.createRoot(container);
  root.render(React.createElement(Wrapper));
  const harness: HookHarness<T> = {
    get current(): T { return ref.current as T; },
    rerender: () => root.render(React.createElement(Wrapper)),
    unmount: () => { root.unmount(); container.remove(); },
  };
  return harness;
}

async function act(fn: () => unknown | Promise<unknown>) {
  await fn();
  // Flush microtasks + a macrotask for React's commit phase.
  await new Promise((r) => setTimeout(r, 0));
}

function makeEmail(id: string, overrides: Partial<MockEmail> = {}): MockEmail {
  return {
    id,
    thread_id: id,
    from_name: 'Acme Capital',
    from_email: 'deals@acme-capital.com',
    to: ['me@example.com'],
    cc: [],
    bcc: [],
    subject: `Subject ${id}`,
    body_html: '',
    body_preview: 'preview',
    snippet: 'snippet text',
    received_at: '2026-04-25T10:00:00.000Z',
    folder: 'inbox',
    labels: [],
    is_read: false,
    is_starred: false,
    is_follow_up: false,
    needs_response: false,
    has_attachments: false,
    attachments: [],
    ...overrides,
  } as unknown as MockEmail;
}

/**
 * Build a successful `functions.invoke` response from the legacy payload shape
 * the tests use (`{ interpretation, filters, results }`). The edge function
 * returns `{ interpretation, parsedFilters, results, latencyMs, model }`, so we
 * normalize here to keep the test cases readable.
 */
function aiResponse(payload: any) {
  return {
    data: {
      interpretation: payload.interpretation ?? null,
      parsedFilters: payload.filters ?? {},
      results: payload.results ?? [],
      executedQuery: '',
      latencyMs: 0,
      model: 'test-model',
    },
    error: null,
  };
}

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe('useAIEmailSearch', () => {
  it('returns ranked results and parsed filters from the AI response', async () => {
    mockedInvoke.mockResolvedValueOnce(
      aiResponse({
        interpretation: 'Signed NDAs from lenders last week',
        filters: {
          sender: null,
          senderRole: 'lender',
          dateRange: 'last_week',
          dateRangeStart: '2026-04-18',
          dateRangeEnd: '2026-04-25',
          category: null,
          topics: ['NDA', 'signed'],
          hasAttachments: true,
        },
        results: [{ id: 'b', reason: 'matches' }, { id: 'a', reason: 'matches' }],
      }),
    );

    const harness = renderHook(() => useAIEmailSearch());

    await act(async () => {
      await harness.current.search('signed NDAs from lenders last week', [
        makeEmail('a'),
        makeEmail('b'),
      ]);
    });

    expect(harness.current.result?.rankedIds).toEqual(['b', 'a']);
    expect(harness.current.result?.filters.senderRole).toBe('lender');
    expect(harness.current.result?.filters.topics).toEqual(['NDA', 'signed']);
    expect(harness.current.result?.filters.hasAttachments).toBe(true);
    expect(harness.current.isSearching).toBe(false);
  });

  it('removeFilter drops a single chip without mutating ranked ids', async () => {
    mockedInvoke.mockResolvedValueOnce(
      aiResponse({
        interpretation: 'x',
        filters: {
          sender: 'acme',
          dateRange: 'last_week',
          dateRangeStart: '2026-04-18',
          dateRangeEnd: '2026-04-25',
          topics: ['NDA', 'signed'],
          hasAttachments: true,
        },
        results: [{ id: 'a', reason: 'r' }],
      }),
    );

    const harness = renderHook(() => useAIEmailSearch());
    await act(async () => {
      await harness.current.search('q', [makeEmail('a')]);
    });

    act(() => harness.current.removeFilter('dateRange'));
    expect(harness.current.result?.filters.dateRange).toBeNull();
    expect(harness.current.result?.filters.dateRangeStart).toBeNull();
    expect(harness.current.result?.filters.dateRangeEnd).toBeNull();

    act(() => harness.current.removeFilter('topic:NDA'));
    expect(harness.current.result?.filters.topics).toEqual(['signed']);

    act(() => harness.current.removeFilter('hasAttachments'));
    expect(harness.current.result?.filters.hasAttachments).toBeNull();

    // rankedIds preserved
    expect(harness.current.result?.rankedIds).toEqual(['a']);
  });

  it('discards stale responses when a newer search starts', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const firstPromise = new Promise((res) => { resolveFirst = res; });
    mockedInvoke.mockImplementationOnce(() => firstPromise as any);
    mockedInvoke.mockResolvedValueOnce(
      aiResponse({
        interpretation: 'newer',
        filters: {},
        results: [{ id: 'b', reason: 'r' }],
      }),
    );

    const harness = renderHook(() => useAIEmailSearch());
    // Kick off the first (slow) call without awaiting completion.
    const firstCall = harness.current.search('first', [makeEmail('a'), makeEmail('b')]);
    // Start the second call while the first is in flight; it will resolve quickly.
    await act(async () => {
      await harness.current.search('second', [makeEmail('a'), makeEmail('b')]);
    });
    // Now resolve the stale first call — it should be discarded.
    resolveFirst(
      aiResponse({ interpretation: 'stale', filters: {}, results: [{ id: 'a', reason: 'x' }] }),
    );
    await firstCall;
    await act(async () => {});

    expect(harness.current.result?.interpretation).toBe('newer');
    expect(harness.current.result?.rankedIds).toEqual(['b']);
  });

  it('caches identical queries within the TTL window', async () => {
    mockedInvoke.mockResolvedValueOnce(
      aiResponse({
        interpretation: 'cached',
        filters: {},
        results: [{ id: 'a', reason: 'r' }],
      }),
    );

    const candidates = [makeEmail('a'), makeEmail('b')];
    const harness = renderHook(() => useAIEmailSearch());
    await act(async () => {
      await harness.current.search('hello world', candidates);
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    // Second identical call — should hit the cache, not the network.
    await act(async () => {
      await harness.current.search('hello world', candidates);
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(harness.current.result?.interpretation).toBe('cached');
  });

  it('cancel() flips isSearching off without clearing the existing result', async () => {
    mockedInvoke.mockResolvedValueOnce(
      aiResponse({
        interpretation: 'done',
        filters: {},
        results: [{ id: 'a', reason: 'r' }],
      }),
    );

    const harness = renderHook(() => useAIEmailSearch());
    await act(async () => {
      await harness.current.search('q', [makeEmail('a')]);
    });
    expect(harness.current.result).not.toBeNull();

    act(() => harness.current.cancel());
    expect(harness.current.isSearching).toBe(false);
    // Cancel keeps the prior result around (chips stay visible).
    expect(harness.current.result?.rankedIds).toEqual(['a']);
  });

  it('surfaces an error when the AI service fails', async () => {
    mockedInvoke.mockResolvedValueOnce({ data: null, error: { message: 'rate limit' } });

    const harness = renderHook(() => useAIEmailSearch());
    await act(async () => {
      await harness.current.search('q', [makeEmail('a')]);
    });
    expect(harness.current.error).toBe('rate limit');
    expect(harness.current.result).toBeNull();
  });
});