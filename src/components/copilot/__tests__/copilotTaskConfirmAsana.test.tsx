import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────────────────────────
const syncSpy = vi.fn();
vi.mock('@/lib/asana/syncTaskAfterCreate', () => ({
  syncTaskAfterCreate: (...args: unknown[]) => syncSpy(...args),
  retryAsanaSyncForTask: vi.fn().mockResolvedValue({ ok: true, gid: 'g0', error: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock('@/stores/copilotStore', () => ({ useCopilotStore: (sel: any) => sel({ addMutation: vi.fn() }) }));

// Stub global fetch (CopilotTaskConfirm POSTs to copilot-chat)
const origFetch = globalThis.fetch;

import { CopilotTaskConfirm } from '../CopilotTaskConfirm';

function renderCard(mockResponse: any) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(mockResponse),
  }) as any;

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CopilotTaskConfirm
        action={{
          action: 'confirm',
          action_type: 'create_task',
          description: 'Create a follow-up',
          params: { title: 'Follow up with Gabb', task_type: 'task' },
        }}
      />
    </QueryClientProvider>,
  );
}

describe('CopilotTaskConfirm → Asana fan-out', () => {
  beforeEach(() => {
    syncSpy.mockReset();
  });
  afterEach?.(() => { globalThis.fetch = origFetch; });

  it('fans out to Asana after a successful local create', async () => {
    syncSpy.mockResolvedValue({ ok: true, gid: 'asana-gid-123', error: null });
    renderCard({
      success: true,
      message: 'Task created',
      params: { task_id: 'task-uuid-1', assigned_to: 'user-1', deal_id: null },
    });

    const saveBtn = await screen.findByText(/save|confirm|create/i, { selector: 'button' });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(syncSpy).toHaveBeenCalledTimes(1));
    const args = syncSpy.mock.calls[0][0];
    expect(args.taskId).toBe('task-uuid-1');
    expect(args.title).toBe('Follow up with Gabb');
    expect(args.assignedTo).toBe('user-1');
  });

  it('treats Asana failure as a soft success (local row still created)', async () => {
    syncSpy.mockResolvedValue({ ok: false, gid: null, error: 'Asana proxy 500' });
    renderCard({
      success: true,
      message: 'Task created',
      params: { task_id: 'task-uuid-2', assigned_to: 'user-1' },
    });

    const saveBtn = await screen.findByText(/save|confirm|create/i, { selector: 'button' });
    fireEvent.click(saveBtn);

    // Local success UI still renders ("Task created — ...")
    await waitFor(() => expect(screen.getByText(/Task created/i)).toBeTruthy());
    await waitFor(() => expect(syncSpy).toHaveBeenCalledTimes(1));
  });
});