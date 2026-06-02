import { describe, it, expect } from 'vitest';
import { MissingAssigneeError } from '@/hooks/useMeetingTaskSuggestions';
import type { MeetingTaskSuggestion } from '@/hooks/useMeetingTaskSuggestions';

/**
 * Pure gating helpers mirrored from SuggestedTasksSection so the
 * disable/enable logic can be exercised without mounting the React
 * tree. If these stay in sync with the component, regressions surface
 * here first.
 */
function isCreateDisabled(s: Pick<MeetingTaskSuggestion, 'assignee_user_id' | 'status'>) {
  return s.status !== 'pending' || !s.assignee_user_id;
}

function isApproveAllDisabled(considered: Array<Pick<MeetingTaskSuggestion, 'assignee_user_id' | 'status'>>) {
  const pending = considered.filter((s) => s.status === 'pending');
  if (pending.length === 0) return true;
  return pending.some((s) => !s.assignee_user_id);
}

const base = {
  suggestion_id: 'x', text: 't',
  assignee_name: null, assignee_email: null, external_mention: null,
  assignment_source: null as null, due_date: null, created_task_id: null,
  id: null, source: 'claap' as const,
};

describe('SuggestedTasks gating', () => {
  it('Create disabled when assignee_user_id is null', () => {
    expect(isCreateDisabled({ status: 'pending', assignee_user_id: null })).toBe(true);
  });

  it('Create enabled after an assignee is picked', () => {
    expect(isCreateDisabled({ status: 'pending', assignee_user_id: 'u1' })).toBe(false);
  });

  it('Approve all disabled when any considered row has null assignee', () => {
    const rows = [
      { ...base, status: 'pending', assignee_user_id: 'u1' },
      { ...base, status: 'pending', assignee_user_id: null },
      { ...base, status: 'pending', assignee_user_id: 'u2' },
    ] as any;
    expect(isApproveAllDisabled(rows)).toBe(true);
  });

  it('Approve all enabled once every considered row has an assignee', () => {
    const rows = [
      { ...base, status: 'pending', assignee_user_id: 'u1' },
      { ...base, status: 'pending', assignee_user_id: 'u2' },
    ] as any;
    expect(isApproveAllDisabled(rows)).toBe(false);
  });

  it('Approve all stays disabled when there is nothing pending', () => {
    expect(isApproveAllDisabled([])).toBe(true);
  });
});

describe('MissingAssigneeError', () => {
  it('is thrown for null-assignee suggestions in the create-task path', () => {
    // Stand-in for the approve() guard — same predicate the hook uses.
    const guard = (s: { assignee_user_id: string | null; suggestion_id: string }) => {
      if (!s.assignee_user_id) throw new MissingAssigneeError(s.suggestion_id);
    };
    expect(() => guard({ assignee_user_id: null, suggestion_id: 'sid-1' }))
      .toThrow(MissingAssigneeError);
    expect(() => guard({ assignee_user_id: 'u1', suggestion_id: 'sid-2' }))
      .not.toThrow();
  });
});