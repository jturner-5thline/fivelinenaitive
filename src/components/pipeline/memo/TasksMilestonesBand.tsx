import { useMemo, useState } from 'react';
import type { Deal, DealMilestone } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import { Diamond, Pencil, Check, Plus } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AddFollowupInlineForm } from './AddFollowupInlineForm';
import { prefillFollowupTitle } from '@/lib/dealNextBestAction';
import { getAsanaSyncContext } from '@/hooks/useAsanaTaskSync';
import { updateTaskInAsana } from '@/hooks/useAsanaTaskUpdate';
import type { DealTaskItem as DealTaskItemType } from '@/hooks/usePipelineDealTasks';
import {
  TASK_STATUS_COMPLETE,
  TASK_STATUS_REOPENED,
  invalidateAllTaskCaches,
} from '@/lib/taskCache';

function shortName(full?: string | null): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/**
 * Best-effort: after a task field write, push the same change to Asana
 * if this task is linked to an Asana task and the workspace has Asana
 * sync configured. Mirrors the logic in useTasks.updateTask.
 */
async function syncTaskFieldToAsana(
  taskId: string,
  updates: { due_date?: string | null; assigned_to?: string | null | undefined },
) {
  try {
    const { data: row } = await supabase
      .from('tasks')
      .select('asana_task_gid, sync_source, company_id')
      .eq('id', taskId)
      .maybeSingle();
    const asanaGid = (row as any)?.asana_task_gid;
    const syncSource = (row as any)?.sync_source;
    if (!asanaGid || syncSource === 'asana') return;
    const ctx = await getAsanaSyncContext((row as any)?.company_id || null);
    if (!ctx) return;
    const payload: { due_date?: string | null; assignee_email?: string | null } = {};
    if ('due_date' in updates) payload.due_date = updates.due_date ?? null;
    if ('assigned_to' in updates) {
      if (updates.assigned_to) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('user_id', updates.assigned_to)
          .maybeSingle();
        payload.assignee_email = (profile as any)?.email || null;
      } else {
        payload.assignee_email = null;
      }
    }
    if (Object.keys(payload).length === 0) return;
    await updateTaskInAsana(ctx, asanaGid, payload);
    await supabase.from('tasks').update({ sync_source: null }).eq('id', taskId);
  } catch (err) {
    console.warn('[TasksMilestonesBand] Asana field sync failed:', err);
  }
}

interface TasksMilestonesBandProps {
  deal: Deal;
  tasks: DealTaskItem[];
  /** Used to compute a smarter "+ Add Follow-up" pre-fill title. */
  rawDigest?: PipelineDigestRaw;
}

interface CompanyMemberOption {
  id: string;
  name: string;
}

function initialsOf(name?: string | null) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function nextUpcomingMilestone(milestones: DealMilestone[] | undefined) {
  if (!milestones?.length) return null;
  const now = Date.now();
  return milestones
    .filter((m) => !m.completed && m.dueDate)
    .map((m) => ({ m, t: new Date(m.dueDate as string).getTime() }))
    .filter(({ t }) => t >= now - 86_400_000)
    .sort((a, b) => a.t - b.t)[0]?.m ?? null;
}

function relativeDays(dueDate: string): string {
  const days = differenceInCalendarDays(new Date(dueDate), new Date());
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days > 0) return `${days} days`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

function parseStoredDate(dateValue?: string | null): Date | null {
  if (!dateValue) return null;
  const parsed = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Tasks & milestones band rendered between the card header and the
 * 3-column insights row. Lists open tasks/outstanding items (capped) and
 * highlights the next upcoming milestone, if any.
 */
export function TasksMilestonesBand({ deal, tasks, rawDigest }: TasksMilestonesBandProps) {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const [activeFilter, setActiveFilter] = useState<'task' | 'milestone' | 'outstanding' | null>(null);
  // Optimistically hide rows that the user just completed inline.
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [completingMilestoneIds, setCompletingMilestoneIds] = useState<Set<string>>(new Set());

  const nextMilestone = nextUpcomingMilestone(deal.milestones);
  const allIncompleteMilestones = (deal.milestones || [])
    .filter((m) => !m.completed)
    .sort((a, b) => {
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ta - tb;
    });

  const visibleTaskPool = tasks.filter((t) => !completingIds.has(t.id));
  const taskOnlyItems = visibleTaskPool.filter((t) => t.kind === 'task');
  const outstandingOnlyItems = visibleTaskPool.filter((t) => {
    if (t.kind === 'outstanding') return true;
    if (t.kind === 'task' && t.dueDate) {
      return differenceInCalendarDays(new Date(t.dueDate), new Date()) < 0;
    }
    return false;
  });

  const visibleTasks =
    activeFilter === 'task'
      ? taskOnlyItems
      : activeFilter === 'outstanding'
      ? outstandingOnlyItems
      : activeFilter === 'milestone'
      ? []
      : visibleTaskPool;
  const milestonesToRender = (
    activeFilter === 'milestone'
      ? allIncompleteMilestones
      : activeFilter === null && nextMilestone
      ? [nextMilestone]
      : []
  ).filter((m) => !completingMilestoneIds.has(m.id || ''));
  const hasContent = visibleTasks.length > 0 || milestonesToRender.length > 0;
  // Show ~2 rows by default; scroll the rest. Each row ≈ 36px + 6px gap.
  const totalItems = visibleTasks.length + milestonesToRender.length;
  const isScrollable = totalItems > 2;
  // The "+" add control is anchored to the bottom-most actionable row in
  // the rendered list. Milestone is rendered after tasks, so if present it
  // owns the inline plus; otherwise the final visible task row does.
  const lastTaskIndex = visibleTasks.length - 1;
  const plusOnMilestone = milestonesToRender.length > 0;
  const plusOnTaskIndex = !plusOnMilestone ? lastTaskIndex : -1;
  const lastMilestoneIndex = milestonesToRender.length - 1;
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null);
  const [dateDrafts, setDateDrafts] = useState<Record<string, Date | null>>({});
  const [assigneeDrafts, setAssigneeDrafts] = useState<Record<string, string | null>>({});
  const [savingFieldIds, setSavingFieldIds] = useState<Set<string>>(new Set());
  const [titleDraft, setTitleDraft] = useState('');
  const [addFormOpen, setAddFormOpen] = useState(false);
  const prefillTitle = prefillFollowupTitle(deal, tasks, rawDigest);

  // Standalone "+" button rendered as a sibling to the bottom-most
  // task/milestone row — never embedded inside the row's bordered container.
  const StandalonePlusButton = (
    <button
      type="button"
      aria-label="Add follow-up task"
      title="Add follow-up"
      onClick={(e) => {
        e.stopPropagation();
        setAddFormOpen(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );

  const { data: members = [] } = useQuery({
    queryKey: ['deal-rundown-task-members', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: companyMembers, error: companyMembersError } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', company!.id);

      if (companyMembersError) throw companyMembersError;

      const userIds = (companyMembers || []).map((row) => row.user_id).filter(Boolean) as string[];
      if (userIds.length === 0) return [] as CompanyMemberOption[];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, first_name, last_name, email')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      return (profiles || [])
        .map((profile) => ({
          id: profile.user_id,
          name: (
            [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
            profile.display_name ||
            profile.email ||
            'Unknown'
          ).trim(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const taskItemsById = useMemo(
    () => new Map(tasks.filter((task): task is DealTaskItemType & { kind: 'task' } => task.kind === 'task').map((task) => [task.id, task])),
    [tasks],
  );
  const memberNameById = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members]);

  const setFieldSaving = (taskId: string, isSaving: boolean) => {
    setSavingFieldIds((prev) => {
      const next = new Set(prev);
      if (isSaving) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const startAssigneeEdit = (taskId: string, currentAssigneeId?: string | null) => {
    setEditingTitleId(null);
    setEditingDateId(null);
    setAssigneeDrafts((prev) => ({ ...prev, [taskId]: currentAssigneeId ?? null }));
    setEditingAssigneeId(taskId);
  };

  const startDateEdit = (taskId: string, currentDueDate?: string | null) => {
    setEditingTitleId(null);
    setEditingAssigneeId(null);
    setDateDrafts((prev) => ({ ...prev, [taskId]: parseStoredDate(currentDueDate) }));
    setEditingDateId(taskId);
  };

  const refreshTasks = async () => {
    // Canonical cross-surface sync: invalidates Tasks page, Daily
    // Rundown, Deal Rundown, Deal panels, dashboard widgets, etc.
    invalidateAllTaskCaches(queryClient);
  };

  /**
   * Optimistically patch the cached `pipeline-deal-tasks` Map so the
   * row updates immediately, before the supabase round-trip completes.
   */
  const patchTaskInCache = (taskId: string, patch: Partial<DealTaskItemType>) => {
    queryClient.setQueriesData<Map<string, DealTaskItemType[]>>(
      { queryKey: ['pipeline-deal-tasks'] },
      (current) => {
        if (!current) return current;
        const next = new Map(current);
        for (const [dealId, items] of next.entries()) {
          if (!items.some((t) => t.id === taskId)) continue;
          next.set(
            dealId,
            items.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
          );
        }
        return next;
      },
    );
  };

  const completeTaskItem = async (task: DealTaskItem) => {
    // Optimistically hide
    setCompletingIds((prev) => {
      const n = new Set(prev);
      n.add(task.id);
      return n;
    });

    let undone = false;
    const restore = () => {
      undone = true;
      setCompletingIds((prev) => {
        const n = new Set(prev);
        n.delete(task.id);
        return n;
      });
    };

    try {
      if (task.kind === 'task') {
        const { data: { user: u } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('tasks')
          .update({
            status: TASK_STATUS_COMPLETE,
            completed_at: new Date().toISOString(),
            completed_by: u?.id ?? null,
          })
          .eq('id', task.id);
        if (error) throw error;
      } else {
        // outstanding: id is prefixed with "o-"
        const realId = task.id.startsWith('o-') ? task.id.slice(2) : task.id;
        const { data: row, error: fetchErr } = await supabase
          .from('outstanding_items')
          .select('status')
          .eq('id', realId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        let parsed: any = {};
        try { parsed = row?.status ? JSON.parse(row.status) : {}; } catch { parsed = {}; }
        const nextStatus = JSON.stringify({
          received: true,
          approved: true,
          deliveredToLenders: parsed.deliveredToLenders ?? [],
          requestedBy: parsed.requestedBy ?? [],
        });
        const { error } = await supabase
          .from('outstanding_items')
          .update({ status: nextStatus })
          .eq('id', realId);
        if (error) throw error;
      }

      toast.success(task.kind === 'task' ? 'Task completed' : 'Item completed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              if (task.kind === 'task') {
                await supabase
                  .from('tasks')
                  .update({
                    status: TASK_STATUS_REOPENED,
                    completed_at: null,
                    completed_by: null,
                  })
                  .eq('id', task.id);
              } else {
                const realId = task.id.startsWith('o-') ? task.id.slice(2) : task.id;
                const { data: row } = await supabase
                  .from('outstanding_items')
                  .select('status')
                  .eq('id', realId)
                  .maybeSingle();
                let parsed: any = {};
                try { parsed = row?.status ? JSON.parse(row.status) : {}; } catch { parsed = {}; }
                const nextStatus = JSON.stringify({
                  received: false,
                  approved: false,
                  deliveredToLenders: parsed.deliveredToLenders ?? [],
                  requestedBy: parsed.requestedBy ?? [],
                });
                await supabase
                  .from('outstanding_items')
                  .update({ status: nextStatus })
                  .eq('id', realId);
              }
              restore();
              await refreshTasks();
            } catch {
              toast.error('Failed to undo');
            }
          },
        },
      });
      await refreshTasks();
    } catch (err) {
      console.error('Inline complete failed:', err);
      if (!undone) restore();
      toast.error('Failed to complete');
    }
  };

  const completeMilestone = async (m: DealMilestone) => {
    if (!m.id) return;
    const id = m.id;
    setCompletingMilestoneIds((prev) => {
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    const restore = () => {
      setCompletingMilestoneIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    };
    try {
      const { error } = await supabase
        .from('deal_milestones')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      // Trigger DealsContext refresh so deal.milestones updates everywhere.
      window.dispatchEvent(
        new CustomEvent('copilot-action-completed', {
          detail: { actionType: 'add_milestone', params: { deal_id: deal.id } },
        }),
      );

      toast.success('Milestone completed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await supabase
                .from('deal_milestones')
                .update({ completed: false, completed_at: null })
                .eq('id', id);
              restore();
              window.dispatchEvent(
                new CustomEvent('copilot-action-completed', {
                  detail: { actionType: 'add_milestone', params: { deal_id: deal.id } },
                }),
              );
            } catch {
              toast.error('Failed to undo');
            }
          },
        },
      });
    } catch (err) {
      console.error('Inline milestone complete failed:', err);
      restore();
      toast.error('Failed to complete milestone');
    }
  };

  const startTitleEdit = (task: DealTaskItem) => {
    if (task.kind !== 'task') return;
    setEditingDateId(null);
    setEditingAssigneeId(null);
    setEditingTitleId(task.id);
    setTitleDraft(task.title);
  };

  const saveTitle = async (task: DealTaskItem) => {
    if (task.kind !== 'task') return;

    const nextTitle = titleDraft.trim();
    setEditingTitleId(null);

    if (!nextTitle || nextTitle === task.title) {
      setTitleDraft(task.title);
      return;
    }

    const { error } = await supabase.from('tasks').update({ title: nextTitle }).eq('id', task.id);

    if (error) {
      toast.error('Failed to update task title');
      setTitleDraft(task.title);
      return;
    }

    toast.success('Task title updated');
    await refreshTasks();
  };

  const saveDueDate = async (taskId: string, date: Date | null) => {
    const task = taskItemsById.get(taskId);
    if (!task) return;

    const previousDueDate = task.dueDate ?? null;
    const nextDueDate = date ? format(date, 'yyyy-MM-dd') : null;

    setEditingDateId(null);
    setDateDrafts((prev) => ({ ...prev, [taskId]: date }));

    if (nextDueDate === previousDueDate) return;

    patchTaskInCache(taskId, { dueDate: nextDueDate });
    setFieldSaving(taskId, true);

    try {
      const { error } = await supabase.from('tasks').update({ due_date: nextDueDate }).eq('id', taskId);
      if (error) throw error;

      toast.success('Due date updated');
      void syncTaskFieldToAsana(taskId, { due_date: nextDueDate });
      await refreshTasks();
    } catch (error) {
      console.error('Failed to update due date:', error);
      patchTaskInCache(taskId, { dueDate: previousDueDate });
      setDateDrafts((prev) => ({ ...prev, [taskId]: parseStoredDate(previousDueDate) }));
      toast.error('Failed to update due date');
      await refreshTasks();
    } finally {
      setFieldSaving(taskId, false);
    }
  };

  const saveAssignee = async (taskId: string, userId: string | null) => {
    const task = taskItemsById.get(taskId);
    if (!task) return;

    const previousAssignedToId = task.assignedToId ?? null;
    const previousAssignedToName = task.assignedToName ?? null;
    const nextAssignedToName = userId ? shortName(memberNameById.get(userId) || null) : null;

    setEditingAssigneeId(null);
    setAssigneeDrafts((prev) => ({ ...prev, [taskId]: userId }));

    if (userId === previousAssignedToId) return;

    patchTaskInCache(taskId, {
      assignedToId: userId,
      assignedToName: nextAssignedToName,
    });
    setFieldSaving(taskId, true);

    try {
      const { error } = await supabase.from('tasks').update({ assigned_to: userId }).eq('id', taskId);
      if (error) throw error;

      toast.success('Assignee updated');
      void syncTaskFieldToAsana(taskId, { assigned_to: userId });
      await refreshTasks();
    } catch (error) {
      console.error('Failed to update assignee:', error);
      patchTaskInCache(taskId, {
        assignedToId: previousAssignedToId,
        assignedToName: previousAssignedToName,
      });
      setAssigneeDrafts((prev) => ({ ...prev, [taskId]: previousAssignedToId }));
      toast.error('Failed to update assignee');
      await refreshTasks();
    } finally {
      setFieldSaving(taskId, false);
    }
  };

  return (
    <div className="px-5 py-3 bg-white/[0.03] border-b border-white/[0.08]">
      <div className="md:max-w-[88%] lg:max-w-[85%]">
      <div className="flex items-center justify-between gap-3 mb-2 flex-nowrap min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 shrink-0 truncate">
          Tasks & milestones
        </div>
        <div
          className="flex items-center gap-1 shrink-0 flex-nowrap"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {([
            { key: 'task', label: 'Tasks' },
            { key: 'milestone', label: 'Milestones' },
            { key: 'outstanding', label: 'Outstanding' },
          ] as const).map((f) => {
            const selected = activeFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveFilter(selected ? null : f.key);
                }}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground hover:border-primary'
                    : 'border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-border'
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {!hasContent ? (
        <p className="text-xs italic text-muted-foreground">
          {activeFilter
            ? `No ${
                activeFilter === 'task'
                  ? 'tasks'
                  : activeFilter === 'milestone'
                  ? 'milestones'
                  : 'outstanding items'
              } for this deal.`
            : 'No outstanding tasks or milestones.'}
        </p>
      ) : (
        <div
          className={cn(
            'relative -mr-1 pr-1',
            isScrollable &&
              'max-h-[5.25rem] overflow-y-auto rounded-md ring-1 ring-border/50 bg-background/30 p-1 tasks-scroll-shell'
          )}
        >
        <div className="space-y-1.5">
          {visibleTasks.map((task, idx) => {
            const hasDateDraft = Object.prototype.hasOwnProperty.call(dateDrafts, task.id);
            const hasAssigneeDraft = Object.prototype.hasOwnProperty.call(assigneeDrafts, task.id);
            const dueDate = editingDateId === task.id && hasDateDraft
              ? dateDrafts[task.id]
              : parseStoredDate(task.dueDate);
            const isOverdue = !!dueDate && differenceInCalendarDays(dueDate, new Date()) < 0;
            const selectedAssigneeId = task.kind === 'task'
              ? editingAssigneeId === task.id && hasAssigneeDraft
                ? assigneeDrafts[task.id]
                : (task.assignedToId ?? null)
              : null;
            const assigneeLabel = task.kind === 'task'
              ? (selectedAssigneeId
                  ? shortName(memberNameById.get(selectedAssigneeId) || null) || task.assignedToName
                  : null)
              : task.requestedByName;
            const isSavingField = task.kind === 'task' && savingFieldIds.has(task.id);
            const showPlusHere = !addFormOpen && idx === plusOnTaskIndex;

            const rowEl = (
              <div
                className="group flex-1 min-w-0 flex items-center gap-2.5 rounded-md bg-background/70 border border-border/60 px-2.5 py-1.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Mark "${task.title}" complete`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void completeTaskItem(task);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded border border-muted-foreground/50 bg-transparent hover:border-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Check className="h-3 w-3 text-primary opacity-0 hover:opacity-100" strokeWidth={3} />
                </button>

                {editingTitleId === task.id && task.kind === 'task' ? (
                  <input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    autoFocus
                    onBlur={() => void saveTitle(task)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveTitle(task);
                      }
                      if (e.key === 'Escape') {
                        setEditingTitleId(null);
                        setTitleDraft(task.title);
                      }
                    }}
                    className="flex-1 min-w-0 text-xs bg-transparent border-b border-primary/40 outline-none text-foreground font-medium"
                  />
                ) : (
                  <span
                    onClick={() => startTitleEdit(task)}
                    className={cn(
                      'flex-1 min-w-0 text-xs text-foreground font-medium truncate',
                      task.kind === 'task' && 'cursor-text hover:text-primary'
                    )}
                    title={task.title}
                  >
                    {task.title}
                  </span>
                )}

                {task.kind === 'task' && (
                  <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}

                {task.kind === 'task' ? (
                  <Popover
                    open={editingAssigneeId === task.id}
                    onOpenChange={(open) => {
                      if (open) startAssigneeEdit(task.id, task.assignedToId ?? null);
                      else setEditingAssigneeId(null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isSavingField}
                        onClick={(e) => {
                          e.stopPropagation();
                          startAssigneeEdit(task.id, task.assignedToId ?? null);
                        }}
                        className="group/assignee flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground hover:border-primary/50 hover:bg-muted whitespace-nowrap shrink-0 disabled:pointer-events-none disabled:opacity-60"
                        title={assigneeLabel || 'No assignee'}
                      >
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[8px] font-semibold text-muted-foreground/90">
                          {initialsOf(assigneeLabel) || '?'}
                        </span>
                        <span className="truncate max-w-[84px] group-hover/assignee:underline decoration-dotted underline-offset-2">
                          {assigneeLabel || 'No assignee'}
                        </span>
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground/60 opacity-0 group-hover/assignee:opacity-100 transition-opacity" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-60 p-0 pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Command className="bg-popover">
                        <CommandInput placeholder="Search members..." />
                        <CommandList>
                          <CommandEmpty>No members found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem onSelect={() => void saveAssignee(task.id, null)} className="gap-2">
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                                ?
                              </span>
                              <span>No assignee</span>
                              {!selectedAssigneeId && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                            </CommandItem>
                            {members.map((member) => (
                              <CommandItem
                                key={member.id}
                                value={`${member.name} ${member.id}`}
                                onSelect={() => void saveAssignee(task.id, member.id)}
                                className="gap-2"
                              >
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                                  {initialsOf(member.name)}
                                </span>
                                <span className="truncate">{member.name}</span>
                                {selectedAssigneeId === member.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : assigneeLabel ? (
                  <span className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[8px] font-semibold text-muted-foreground/90">
                      {initialsOf(assigneeLabel)}
                    </span>
                    <span className="truncate max-w-[84px]">{assigneeLabel}</span>
                  </span>
                ) : null}

                {task.kind === 'task' ? (
                  <Popover
                    open={editingDateId === task.id}
                    onOpenChange={(open) => {
                      if (open) startDateEdit(task.id, task.dueDate ?? null);
                      else setEditingDateId(null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={isSavingField}
                        onClick={(e) => {
                          e.stopPropagation();
                          startDateEdit(task.id, task.dueDate ?? null);
                        }}
                        className={cn(
                          'group/date inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0 transition-colors hover:text-foreground hover:border-primary/50 hover:bg-muted disabled:pointer-events-none disabled:opacity-60',
                          isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                        )}
                        title={dueDate ? format(dueDate, 'MMM d, yyyy') : 'No due date'}
                      >
                        <span className="group-hover/date:underline decoration-dotted underline-offset-2">
                          {dueDate ? format(dueDate, 'MMM d') : 'No due date'}
                        </span>
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground/60 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-auto p-0 pointer-events-auto"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Calendar
                        mode="single"
                        selected={dueDate || undefined}
                        onSelect={(date) => {
                          setDateDrafts((prev) => ({ ...prev, [task.id]: date ?? null }));
                          void saveDueDate(task.id, date ?? null);
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                      {dueDate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDateDrafts((prev) => ({ ...prev, [task.id]: null }));
                            void saveDueDate(task.id, null);
                          }}
                          className="w-full border-t border-border py-2 text-xs text-muted-foreground hover:text-destructive"
                        >
                          Clear date
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : dueDate ? (
                  <span
                    className={cn(
                      'rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0',
                      isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {format(dueDate, 'MMM d')}
                  </span>
                ) : null}
              </div>
            );

            return (
              <div
                key={task.id}
                className="grid items-center gap-2 grid-cols-[1fr_28px]"
              >
                {rowEl}
                <div className="w-7 flex items-center justify-center">
                  {showPlusHere ? StandalonePlusButton : null}
                </div>
              </div>
            );
          })}
          {milestonesToRender.map((m, idx) => (
            <div key={m.id || `${m.title}-${idx}`} className="grid items-center gap-2 grid-cols-[1fr_28px]">
              <div className="min-w-0 flex items-center gap-2.5 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-1.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={`Mark milestone "${m.title}" complete`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void completeMilestone(m);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-sm border border-primary/60 bg-transparent hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Mark milestone complete"
                >
                  <Diamond className="h-3 w-3 text-primary fill-primary" />
                </button>
                <span className="flex-1 text-xs text-foreground font-medium truncate" title={m.title}>
                  {m.title}
                  {m.dueDate && ` · ${format(new Date(m.dueDate), 'MMM d')}`}
                </span>
                {m.dueDate && (
                  <span className="text-[10px] text-primary whitespace-nowrap">
                    {relativeDays(m.dueDate)}
                  </span>
                )}
              </div>
              <div className="w-7 flex items-center justify-center">
                {!addFormOpen && plusOnMilestone && idx === lastMilestoneIndex ? StandalonePlusButton : null}
              </div>
            </div>
          ))}
        </div>
        {isScrollable && (
          <div className="pointer-events-none sticky bottom-0 left-0 right-0 h-4 -mt-4 bg-gradient-to-t from-muted/80 to-transparent rounded-b-md" />
        )}
        </div>
      )}

      {/* Inline add — the "+" button lives on the bottom-most row above.
          When opened, the create form is rendered below; the empty state
          shows a single "+" button as the only entry point. */}
      {addFormOpen ? (
        <div className="mt-2">
          <AddFollowupInlineForm
            deal={deal}
            defaultTitle={prefillTitle}
            onClose={() => setAddFormOpen(false)}
          />
        </div>
      ) : !hasContent ? (
        <div className="mt-2 flex justify-end">{StandalonePlusButton}</div>
      ) : null}
      </div>
    </div>
  );
}