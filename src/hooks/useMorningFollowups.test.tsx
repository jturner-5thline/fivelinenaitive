import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ----
const userId = 'user-1';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: userId } }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// In-memory fake of the rows the hook queries.
const state = {
  tasks: [] as any[],
  scheduled: [] as any[],
  deals: [] as any[],
  contactDeals: [] as any[],
  updates: [] as { table: string; values: any; id: string }[],
};

function makeSelectBuilder(table: string) {
  // Each .from(table).select(...) returns a thenable builder we can chain
  // .eq/.or/.lte/.in/.order/.limit on. Resolves to {data, error}.
  const filters: any = {
    statusEq: null as string | null,
    or: null as string | null,
    lteField: null as string | null,
    lteVal: null as string | null,
    inField: null as string | null,
    inVals: null as string[] | null,
  };

  const exec = (): { data: any[]; error: null } => {
    let rows: any[] = [];
    if (table === 'wf_tasks') rows = state.tasks;
    else if (table === 'scheduled_followup_actions') rows = state.scheduled;
    else if (table === 'deals') rows = state.deals;
    else if (table === 'contact_deals') rows = state.contactDeals;

    if (filters.statusEq != null) rows = rows.filter(r => r.status === filters.statusEq);
    if (filters.lteField) rows = rows.filter(r => !r[filters.lteField] || r[filters.lteField] <= filters.lteVal);
    if (filters.inField && filters.inVals) rows = rows.filter(r => filters.inVals!.includes(r[filters.inField]));
    if (filters.or) {
      // very small parser: "assignee_id.eq.X,workflow_owner_id.eq.X"
      const clauses = filters.or.split(',').map((c: string) => {
        const [field, _op, val] = c.split('.');
        return { field, val };
      });
      rows = rows.filter(r => clauses.some(c => r[c.field] === c.val));
    }
    return { data: rows, error: null };
  };

  const builder: any = {
    eq: (field: string, val: string) => {
      if (field === 'status') filters.statusEq = val;
      return builder;
    },
    or: (clause: string) => { filters.or = clause; return builder; },
    lte: (field: string, val: string) => { filters.lteField = field; filters.lteVal = val; return builder; },
    in: (field: string, vals: string[]) => { filters.inField = field; filters.inVals = vals; return builder; },
    order: () => builder,
    limit: () => builder,
    then: (resolve: any) => Promise.resolve(exec()).then(resolve),
  };
  return builder;
}

function makeUpdateBuilder(table: string, values: any) {
  return {
    eq: async (_field: string, id: string) => {
      state.updates.push({ table, values, id });
      // Apply to in-memory state too so subsequent refetch reflects change.
      const collection =
        table === 'wf_tasks' ? state.tasks :
        table === 'scheduled_followup_actions' ? state.scheduled : [];
      for (const row of collection) {
        if (row.id === id) Object.assign(row, values);
      }
      return { error: null };
    },
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols?: string) => makeSelectBuilder(table),
      update: (values: any) => makeUpdateBuilder(table, values),
    }),
  },
}));

// Imported AFTER mocks so the hook picks them up.
import { useMorningFollowups, useFollowupActions, FollowupItem } from './useMorningFollowups';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  state.tasks = [];
  state.scheduled = [];
  state.deals = [];
  state.contactDeals = [];
  state.updates = [];
});

describe('useFollowupActions.markDone + useMorningFollowups refresh', () => {
  it('marks a wf_task as done and removes it from the Today list on refetch', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    state.tasks.push({
      id: 't1',
      title: 'Call lender',
      due_at: future,
      deal_id: 'd1',
      status: 'open',
      assignee_id: userId,
      workflow_owner_id: null,
    });
    state.deals.push({ id: 'd1', company: 'Acme', stage: 'active', user_id: userId, contact: null, company_id: null });

    const Wrapper = wrapper();
    const { result } = renderHook(
      () => ({ list: useMorningFollowups(true), actions: useFollowupActions() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(result.current.list.data?.[0]?.items).toHaveLength(1);

    const item: FollowupItem = result.current.list.data![0].items[0];
    expect(item.source).toBe('task');

    await act(async () => {
      await result.current.actions.markDone.mutateAsync(item);
    });

    expect(state.updates).toContainEqual({ table: 'wf_tasks', values: { status: 'done' }, id: 't1' });

    // After invalidation the list should refresh and exclude the now-closed task.
    await waitFor(() => expect(result.current.list.data ?? []).toHaveLength(0));
  });

  it('marks a scheduled_followup_action as cancelled and removes it on refetch', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    state.scheduled.push({
      id: 's1',
      trigger_key: 'three_day',
      deal_id: 'd2',
      scheduled_for: future,
      status: 'pending',
    });
    state.deals.push({ id: 'd2', company: 'Beta', stage: 'active', user_id: userId, contact: null, company_id: null });

    const Wrapper = wrapper();
    const { result } = renderHook(
      () => ({ list: useMorningFollowups(true), actions: useFollowupActions() }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const item = result.current.list.data![0].items[0];
    expect(item.source).toBe('scheduled');

    await act(async () => {
      await result.current.actions.markDone.mutateAsync(item);
    });

    const upd = state.updates.find(u => u.table === 'scheduled_followup_actions' && u.id === 's1');
    expect(upd).toBeTruthy();
    expect(upd!.values.status).toBe('cancelled');
    expect(typeof upd!.values.fired_at).toBe('string');

    await waitFor(() => expect(result.current.list.data ?? []).toHaveLength(0));
  });
});