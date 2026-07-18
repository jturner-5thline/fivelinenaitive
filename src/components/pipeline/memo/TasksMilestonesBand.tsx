import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Deal, DealMilestone } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import { Diamond, Pencil, Check, Plus, Maximize2, X, Search, GripVertical, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, differenceInCalendarDays } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AddFollowupInlineForm } from './AddFollowupInlineForm';
import { AddTaskInlineForm } from './AddTaskInlineForm';
import { AddMilestoneInlineForm } from './AddMilestoneInlineForm';
import { SharedTaskDrawer } from '@/components/tasks/SharedTaskDrawer';
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
  /**
   * Optional batched milestones from usePipelineDealMilestones().
   * When provided, takes precedence over `deal.milestones` (which is
   * usually empty on rundown cards because the global Deal mapper does
   * not join `deal_milestones`).
   */
  milestones?: DealMilestone[];
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
export function TasksMilestonesBand({ deal, tasks, milestones, rawDigest }: TasksMilestonesBandProps) {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const [activeFilter, setActiveFilter] = useState<'task' | 'milestone' | 'outstanding' | null>(null);
  // Optimistically hide rows that the user just completed inline.
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [completingMilestoneIds, setCompletingMilestoneIds] = useState<Set<string>>(new Set());

  const effectiveMilestones = milestones ?? deal.milestones;
  const nextMilestone = nextUpcomingMilestone(effectiveMilestones);
  const allIncompleteMilestones = (effectiveMilestones || [])
    .filter((m) => !m.completed)
    .sort((a, b) => {
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ta - tb;
    });

  const visibleTaskPool = tasks;
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
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const navigate = useNavigate();
  const prefillTitle = prefillFollowupTitle(deal, tasks, rawDigest);

  // Standalone "+" button rendered as a sibling to the bottom-most
  // task/milestone row — never embedded inside the row's bordered container.
  // Label is context-aware so it reflects the creator the active filter
  // pill will mount.
  const addLabel =
    activeFilter === 'task'
      ? 'Add task'
      : activeFilter === 'milestone'
      ? 'Add milestone'
      : 'Add follow-up';
  const StandalonePlusButton = (
    <button
      type="button"
      aria-label={addLabel}
      title={addLabel}
      onClick={(e) => {
        e.stopPropagation();
        setAddFormOpen(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/10 bg-[hsl(220,25%,10%)] text-white/70 hover:text-white hover:border-primary/60 hover:bg-[hsl(220,25%,14%)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: TASK_STATUS_COMPLETE,
            completed_at: new Date().toISOString(),
            completed_by: u?.id ?? null,
          })
          .eq('id', task.id)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Complete blocked by permissions');
        console.log('[TasksMilestonesBand] task completed', { taskId: task.id });
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

    const { data, error } = await supabase
      .from('tasks')
      .update({ title: nextTitle })
      .eq('id', task.id)
      .select('id');

    if (error || !data || data.length === 0) {
      console.error('[TasksMilestonesBand] title update failed', { taskId: task.id, error, rows: data?.length });
      toast.error(error ? 'Failed to update task title' : 'You do not have permission to edit this task');
      setTitleDraft(task.title);
      return;
    }

    console.log('[TasksMilestonesBand] title updated', { taskId: task.id, title: nextTitle });
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
      const { data, error } = await supabase
        .from('tasks')
        .update({ due_date: nextDueDate })
        .eq('id', taskId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update blocked by permissions');

      console.log('[TasksMilestonesBand] due date updated', { taskId, nextDueDate });
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
      const { data, error } = await supabase
        .from('tasks')
        .update({ assigned_to: userId })
        .eq('id', taskId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Update blocked by permissions');

      console.log('[TasksMilestonesBand] assignee updated', { taskId, userId });
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
    <div className="px-5 py-3 bg-gradient-to-br from-[hsl(220,30%,9%)] to-[hsl(260,15%,5%)] border-b border-white/10">
      <div className="w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2 min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDetailOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="group flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shrink-0 truncate hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          title="Open all tasks & milestones"
        >
          <span className="truncate">Tasks & milestones</span>
          <Maximize2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <div
          className="flex flex-wrap items-center gap-1 min-w-0"
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
                    : 'border-white/15 bg-white/[0.04] text-white/75 hover:text-white hover:bg-white/[0.08] hover:border-white/25'
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {!hasContent ? (
        <p className="text-xs italic text-white/60">
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
              'max-h-[5.25rem] overflow-y-auto rounded-md ring-1 ring-white/10 bg-black/30 p-1 tasks-scroll-shell'
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
            const isCompleting = completingIds.has(task.id);
            const showPlusHere = !addFormOpen && idx === plusOnTaskIndex;

            const rowEl = (
              <div
                className="group flex-1 min-w-0 flex items-center gap-2.5 rounded-md bg-[hsl(220,25%,9%)] border border-white/10 px-2.5 py-1.5 shadow-sm"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isCompleting}
                  aria-label={isCompleting ? `Completing "${task.title}"` : `Mark "${task.title}" complete`}
                  disabled={isCompleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCompleting) return;
                    void completeTaskItem(task);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    "group/complete shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isCompleting
                      ? "scale-110 border-primary bg-primary/25 cursor-default"
                      : "border-muted-foreground/50 bg-transparent hover:scale-110 hover:border-primary hover:bg-primary/20 active:scale-95 active:bg-primary/35"
                  )}
                >
                  <Check className={cn(
                    "h-3.5 w-3.5 text-primary transition-opacity duration-150 group-hover/complete:opacity-100 group-active/complete:opacity-100",
                    isCompleting ? "opacity-100" : "opacity-0"
                  )} strokeWidth={3} />
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
                    onClick={(e) => {
                      e.stopPropagation();
                      if (task.kind === 'task') {
                        setOpenTaskId(task.id);
                      } else {
                        // Outstanding items aren't backed by a task record —
                        // open the deal details overlay so the user can act
                        // on them from the canonical deal page.
                        navigate(`/deals?deal=${deal.id}`);
                      }
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (task.kind === 'task') startTitleEdit(task);
                    }}
                    className={cn(
                      'flex-1 min-w-0 text-xs text-foreground font-medium truncate cursor-pointer hover:text-primary hover:underline underline-offset-4',
                    )}
                    title={
                      task.kind === 'task'
                        ? `${task.title} — click to open, double-click to rename`
                        : `${task.title} — click to open deal details`
                    }
                  >
                    {task.title}
                  </span>
                )}

                {task.kind === 'task' && (
                  <button
                    type="button"
                    aria-label={`Rename "${task.title}"`}
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      startTitleEdit(task);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 -m-0.5 rounded hover:bg-muted/60"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground/60" />
                  </button>
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
                        className="group/assignee flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/80 transition-colors hover:text-white hover:border-primary/50 hover:bg-white/[0.1] whitespace-nowrap shrink-0 disabled:pointer-events-none disabled:opacity-60"
                        title={assigneeLabel || 'No assignee'}
                      >
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white/10 text-[8px] font-semibold text-white/90">
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
                  <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/80 whitespace-nowrap shrink-0">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-white/10 text-[8px] font-semibold text-white/90">
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
                          'group/date inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0 transition-colors hover:text-white hover:border-primary/50 hover:bg-white/[0.1] disabled:pointer-events-none disabled:opacity-60',
                          isOverdue ? 'text-destructive font-medium' : 'text-white/80'
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
                      'rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0',
                      isOverdue ? 'text-destructive font-medium' : 'text-white/80'
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
              <div className="min-w-0 flex items-center gap-2.5 rounded-md bg-primary/15 border border-primary/40 px-2.5 py-1.5 shadow-sm">
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
        </div>
      )}

      {/* Inline add — the "+" button lives on the bottom-most row above.
          When opened, the create form is rendered below; the empty state
          shows a single "+" button as the only entry point. */}
      {addFormOpen ? (
        <div className="mt-2">
          {activeFilter === 'task' ? (
            <AddTaskInlineForm
              deal={deal}
              onClose={() => setAddFormOpen(false)}
            />
          ) : activeFilter === 'milestone' ? (
            <AddMilestoneInlineForm
              deal={deal}
              onClose={() => setAddFormOpen(false)}
            />
          ) : (
            <AddFollowupInlineForm
              deal={deal}
              defaultTitle={prefillTitle}
              onClose={() => setAddFormOpen(false)}
            />
          )}
        </div>
      ) : !hasContent ? (
        <div className="mt-2 flex justify-end">{StandalonePlusButton}</div>
      ) : null}
      </div>
      <SharedTaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      <TasksMilestonesDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        deal={deal}
        tasks={tasks}
        milestones={effectiveMilestones}
        completingTaskIds={completingIds}
        completingMilestoneIds={completingMilestoneIds}
        onCompleteTask={completeTaskItem}
        onCompleteMilestone={completeMilestone}
        onOpenTask={(id) => setOpenTaskId(id)}
        members={members}
        savingFieldIds={savingFieldIds}
        onSaveDueDate={saveDueDate}
        onSaveAssignee={saveAssignee}
      />
    </div>
  );
}

interface TasksMilestonesDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  tasks: DealTaskItem[];
  milestones?: DealMilestone[];
  completingTaskIds: Set<string>;
  completingMilestoneIds: Set<string>;
  onCompleteTask: (task: DealTaskItem) => void | Promise<void>;
  onCompleteMilestone: (m: DealMilestone) => void | Promise<void>;
  onOpenTask: (taskId: string) => void;
  members: CompanyMemberOption[];
  savingFieldIds: Set<string>;
  onSaveDueDate: (taskId: string, date: Date | null) => Promise<void>;
  onSaveAssignee: (taskId: string, userId: string | null) => Promise<void>;
}

function TasksMilestonesDetailDialog({
  open,
  onOpenChange,
  deal,
  tasks,
  milestones,
  completingTaskIds,
  completingMilestoneIds,
  onCompleteTask,
  onCompleteMilestone,
  onOpenTask,
  members,
  savingFieldIds,
  onSaveDueDate,
  onSaveAssignee,
}: TasksMilestonesDetailDialogProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [addKind, setAddKind] = useState<'task' | 'milestone' | 'followup' | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const taskOrderKey = `tm-order-tasks-${deal.id}`;
  const milestoneOrderKey = `tm-order-milestones-${deal.id}`;
  const [taskOrder, setTaskOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(taskOrderKey) || '[]'); } catch { return []; }
  });
  const [milestoneOrder, setMilestoneOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(milestoneOrderKey) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(taskOrderKey, JSON.stringify(taskOrder)); } catch {}
  }, [taskOrder, taskOrderKey]);
  useEffect(() => {
    try { localStorage.setItem(milestoneOrderKey, JSON.stringify(milestoneOrder)); } catch {}
  }, [milestoneOrder, milestoneOrderKey]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const applyManualOrder = <T extends { id?: string | null }>(list: T[], order: string[]): T[] => {
    if (order.length === 0) return list;
    const byId = new Map(list.map((item) => [item.id ?? '', item] as const));
    const seen = new Set<string>();
    const ordered: T[] = [];
    for (const id of order) {
      const item = byId.get(id);
      if (item) { ordered.push(item); seen.add(id); }
    }
    for (const item of list) {
      const id = item.id ?? '';
      if (!seen.has(id)) ordered.push(item);
    }
    return ordered;
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesQuery = (haystack: (string | null | undefined)[]) => {
    if (!normalizedQuery) return true;
    return haystack.some((s) => (s || '').toLowerCase().includes(normalizedQuery));
  };

  const sortedTasks = useMemo(() => {
    const list = [...tasks];
    list.sort((a, b) => {
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ta - tb;
    });
    return applyManualOrder(list, taskOrder);
  }, [tasks, taskOrder]);

  const sortedMilestones = useMemo(() => {
    const list = [...(milestones || [])];
    list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ta - tb;
    });
    return applyManualOrder(list, milestoneOrder);
  }, [milestones, milestoneOrder]);

  const dndDisabled = normalizedQuery.length > 0;
  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sortedTasks.map((t) => t.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setTaskOrder(arrayMove(ids, oldIdx, newIdx));
  };
  const handleMilestoneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sortedMilestones.map((m) => m.id || m.title);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setMilestoneOrder(arrayMove(ids, oldIdx, newIdx));
  };

  const filteredTasks = useMemo(
    () => sortedTasks.filter((t) => t.kind === 'task' && matchesQuery([t.title, t.assignedToName, t.requestedByName])),
    [sortedTasks, normalizedQuery]
  );
  const filteredOutstanding = useMemo(
    () => sortedTasks.filter((t) => t.kind === 'outstanding' && matchesQuery([t.title, t.requestedByName])),
    [sortedTasks, normalizedQuery]
  );
  const [outstandingSort, setOutstandingSort] = useState<{ key: 'due' | 'requester'; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' });
  const toggleOutstandingSort = (key: 'due' | 'requester') => {
    setOutstandingSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  };
  const sortedOutstanding = useMemo(() => {
    const list = [...filteredOutstanding];
    const dirMul = outstandingSort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (outstandingSort.key === 'due') {
        const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return (ta - tb) * dirMul;
      }
      const ra = (a.requestedByName || '').toLowerCase();
      const rb = (b.requestedByName || '').toLowerCase();
      if (!ra && rb) return 1;
      if (ra && !rb) return -1;
      return ra.localeCompare(rb) * dirMul;
    });
    return list;
  }, [filteredOutstanding, outstandingSort]);
  const totalTasks = sortedTasks.filter((t) => t.kind === 'task').length;
  const totalOutstanding = sortedTasks.filter((t) => t.kind === 'outstanding').length;
  const filteredMilestones = useMemo(
    () => sortedMilestones.filter((m) => matchesQuery([m.title])),
    [sortedMilestones, normalizedQuery]
  );

  const [activeTab, setActiveTab] = useState<'tasks' | 'outstanding' | 'milestones'>('tasks');
  const scrollPositionsRef = useRef<Record<string, number>>({ tasks: 0, outstanding: 0, milestones: 0 });
  const scrollRefs = {
    tasks: useRef<HTMLDivElement | null>(null),
    outstanding: useRef<HTMLDivElement | null>(null),
    milestones: useRef<HTMLDivElement | null>(null),
  } as const;
  useEffect(() => {
    if (!open) return;
    const el = scrollRefs[activeTab].current;
    if (!el) return;
    // Restore after paint so the newly-mounted content has layout
    const raf = requestAnimationFrame(() => {
      el.scrollTop = scrollPositionsRef.current[activeTab] ?? 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTab, open]);
  const handleTabScroll = (key: 'tasks' | 'outstanding' | 'milestones') => (e: React.UIEvent<HTMLDivElement>) => {
    scrollPositionsRef.current[key] = e.currentTarget.scrollTop;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[42rem] h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span className="truncate">Tasks & milestones — {deal.name}</span>
            <label className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground normal-case tracking-normal cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="h-3 w-3"
              />
              Show completed
            </label>
          </DialogTitle>
        </DialogHeader>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, milestones, assignees..."
            autoFocus
            className="w-full rounded-md border border-white/15 bg-white/[0.04] pl-8 pr-8 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 min-h-0 flex flex-col overflow-hidden -mx-1 px-1 mt-2">
          <TabsList className="grid grid-cols-3 w-full h-10 gap-1 p-1">
            <TabsTrigger
              value="tasks"
              className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 whitespace-nowrap"
            >
              <span className="truncate">Tasks &amp; follow-ups</span>
              <span className="inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-muted-foreground min-w-[1.25rem] h-4 px-1">
                {filteredTasks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="outstanding"
              className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 whitespace-nowrap"
            >
              <span className="truncate">Outstanding items</span>
              <span className="inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-muted-foreground min-w-[1.25rem] h-4 px-1">
                {filteredOutstanding.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="milestones"
              className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium py-1.5 px-2 whitespace-nowrap"
            >
              <span className="truncate">Milestones</span>
              <span className="inline-flex items-center justify-center rounded-full bg-white/10 text-[10px] font-medium text-muted-foreground min-w-[1.25rem] h-4 px-1">
                {filteredMilestones.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" ref={scrollRefs.tasks} onScroll={handleTabScroll('tasks')} className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1">
          <section>
            <div className="sticky top-0 z-10 -mx-1 px-1 py-2 mb-2 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-white/5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tasks & follow-ups ({filteredTasks.length}{normalizedQuery && filteredTasks.length !== sortedTasks.length ? ` of ${sortedTasks.length}` : ''})
              </h3>
              <button
                type="button"
                onClick={() => setAddKind(addKind === 'task' ? null : 'task')}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Task
              </button>
            </div>
            {addKind === 'task' && (
              <div className="mb-2">
                <AddTaskInlineForm deal={deal} onClose={() => setAddKind(null)} />
              </div>
            )}
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-md border border-dashed border-white/10 bg-white/[0.02]">
                <p className="text-sm font-medium text-foreground">
                  {normalizedQuery ? 'No matching tasks or follow-ups' : 'No tasks or follow-ups yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {normalizedQuery ? 'Try a different search term.' : 'Create the first item to keep this deal moving.'}
                </p>
                {!normalizedQuery && (
                  <button
                    type="button"
                    onClick={() => setAddKind('task')}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium px-3 py-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Task
                  </button>
                )}
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
                <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {filteredTasks.map((task) => {
                  const isCompleting = completingTaskIds.has(task.id);
                  const dueDate = parseStoredDate(task.dueDate);
                  const isOverdue = !!dueDate && differenceInCalendarDays(dueDate, new Date()) < 0;
                  const assigneeLabel = task.kind === 'task' ? task.assignedToName : task.requestedByName;
                  const isSavingField = task.kind === 'task' && savingFieldIds.has(task.id);
                  const selectedAssigneeId = task.kind === 'task' ? (task.assignedToId ?? null) : null;
                  return (
                    <SortableRow key={task.id} id={task.id} disabled={dndDisabled}>
                      {(handleProps) => (
                        <div className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/40 transition-colors">
                          <button
                            type="button"
                            {...handleProps}
                            className="shrink-0 -ml-1 p-0.5 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden"
                            disabled={dndDisabled}
                            title="Drag to reorder"
                          >
                            <GripVertical className="h-3.5 w-3.5" />
                          </button>
                          <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => void onCompleteTask(task)}
                        className={cn(
                          'shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full border transition-all',
                          isCompleting
                            ? 'border-primary bg-primary/25'
                            : 'border-muted-foreground/50 hover:border-primary hover:bg-primary/20'
                        )}
                        title="Mark complete"
                      >
                        <Check
                          className={cn(
                            'h-3.5 w-3.5 text-primary transition-opacity',
                            isCompleting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          )}
                          strokeWidth={3}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (task.kind === 'task') onOpenTask(task.id);
                        }}
                        className="flex-1 min-w-0 text-left text-xs font-medium text-foreground truncate hover:text-primary hover:underline underline-offset-4"
                        title={task.kind === 'task' ? 'Open task' : task.title}
                      >
                        {task.title}
                      </button>
                      {task.kind === 'task' ? (
                        <Popover
                          open={editingAssigneeId === task.id}
                          onOpenChange={(open) => setEditingAssigneeId(open ? task.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              disabled={isSavingField}
                              onClick={(e) => e.stopPropagation()}
                              className="group/assignee flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 whitespace-nowrap shrink-0 disabled:opacity-60"
                              title={assigneeLabel || 'No assignee'}
                            >
                              <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-muted text-[8px] font-semibold">
                                {initialsOf(assigneeLabel) || '?'}
                              </span>
                              <span className="truncate max-w-[100px]">{assigneeLabel || 'No assignee'}</span>
                              <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/assignee:opacity-100 transition-opacity" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-60 p-0 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                            <Command className="bg-popover">
                              <CommandInput placeholder="Search members..." />
                              <CommandList>
                                <CommandEmpty>No members found.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem onSelect={() => void onSaveAssignee(task.id, null)} className="gap-2">
                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">?</span>
                                    <span>No assignee</span>
                                    {!selectedAssigneeId && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                                  </CommandItem>
                                  {members.map((member) => (
                                    <CommandItem
                                      key={member.id}
                                      value={`${member.name} ${member.id}`}
                                      onSelect={() => void onSaveAssignee(task.id, member.id)}
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
                        <span className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-muted text-[8px] font-semibold">
                            {initialsOf(assigneeLabel) || '?'}
                          </span>
                          <span className="truncate max-w-[100px]">{assigneeLabel}</span>
                        </span>
                      ) : null}
                      {task.kind === 'task' ? (
                        <Popover
                          open={editingDateId === task.id}
                          onOpenChange={(open) => setEditingDateId(open ? task.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              disabled={isSavingField}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                'group/date inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0 hover:border-primary/50 disabled:opacity-60',
                                isOverdue ? 'text-destructive font-medium border-destructive/40' : 'text-muted-foreground'
                              )}
                              title={dueDate ? format(dueDate, 'MMM d, yyyy') : 'No due date'}
                            >
                              <span>{dueDate ? format(dueDate, 'MMM d') : 'No due date'}</span>
                              <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-auto p-0 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                            <Calendar
                              mode="single"
                              selected={dueDate || undefined}
                              onSelect={(date) => void onSaveDueDate(task.id, date ?? null)}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                            {dueDate && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onSaveDueDate(task.id, null);
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
                            'rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0',
                            isOverdue ? 'text-destructive font-medium border-destructive/40' : 'text-muted-foreground'
                          )}
                          title={format(dueDate, 'MMM d, yyyy')}
                        >
                          {format(dueDate, 'MMM d')}
                        </span>
                      ) : null}
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>
          </TabsContent>

          <TabsContent value="outstanding" ref={scrollRefs.outstanding} onScroll={handleTabScroll('outstanding')} className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1">
            <section>
              <div className="sticky top-0 z-10 -mx-1 px-1 py-2 mb-2 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-white/5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Outstanding items ({filteredOutstanding.length}{normalizedQuery && filteredOutstanding.length !== totalOutstanding ? ` of ${totalOutstanding}` : ''})
                </h3>
              </div>
              {filteredOutstanding.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-md border border-dashed border-white/10 bg-white/[0.02]">
                  <p className="text-sm font-medium text-foreground">
                    {normalizedQuery ? 'No matching outstanding items' : "You're all caught up"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    {normalizedQuery
                      ? 'Try a different search term.'
                      : 'Outstanding requests from lenders and reviewers will appear here.'}
                  </p>
                  {!normalizedQuery && (
                    <button
                      type="button"
                      onClick={() => setAddKind('followup')}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium px-3 py-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create follow-up
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredOutstanding.map((item) => {
                    const dueDate = parseStoredDate(item.dueDate);
                    const isOverdue = !!dueDate && differenceInCalendarDays(dueDate, new Date()) < 0;
                    const isCompleting = completingTaskIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/40 transition-colors"
                      >
                        <button
                          type="button"
                          disabled={isCompleting}
                          onClick={() => void onCompleteTask(item)}
                          className={cn(
                            'shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full border transition-all',
                            isCompleting
                              ? 'border-primary bg-primary/25'
                              : 'border-muted-foreground/50 hover:border-primary hover:bg-primary/20'
                          )}
                          title="Mark resolved"
                        >
                          <Check
                            className={cn(
                              'h-3.5 w-3.5 text-primary transition-opacity',
                              isCompleting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            )}
                            strokeWidth={3}
                          />
                        </button>
                        <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate" title={item.title}>
                          {item.title}
                        </span>
                        {item.requestedByName && (
                          <span className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                            <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-muted text-[8px] font-semibold">
                              {initialsOf(item.requestedByName) || '?'}
                            </span>
                            <span className="truncate max-w-[100px]">{item.requestedByName}</span>
                          </span>
                        )}
                        {dueDate && (
                          <span
                            className={cn(
                              'rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0',
                              isOverdue ? 'text-destructive font-medium border-destructive/40' : 'text-muted-foreground'
                            )}
                            title={format(dueDate, 'MMM d, yyyy')}
                          >
                            {format(dueDate, 'MMM d')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="milestones" ref={scrollRefs.milestones} onScroll={handleTabScroll('milestones')} className="flex-1 min-h-0 overflow-y-auto mt-3 pr-1">
          <section>
            <div className="sticky top-0 z-10 -mx-1 px-1 py-2 mb-2 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-white/5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Milestones ({filteredMilestones.length}{normalizedQuery && filteredMilestones.length !== sortedMilestones.length ? ` of ${sortedMilestones.length}` : ''})
              </h3>
              <button
                type="button"
                onClick={() => setAddKind(addKind === 'milestone' ? null : 'milestone')}
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add milestone
              </button>
            </div>
            {addKind === 'milestone' && (
              <div className="mb-2">
                <AddMilestoneInlineForm deal={deal} onClose={() => setAddKind(null)} />
              </div>
            )}
            {filteredMilestones.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-md border border-dashed border-white/10 bg-white/[0.02]">
                <p className="text-sm font-medium text-foreground">
                  {normalizedQuery ? 'No matching milestones' : 'No milestones yet'}
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {normalizedQuery ? 'Try a different search term.' : 'Add milestones to mark the key steps toward close.'}
                </p>
                {!normalizedQuery && (
                  <button
                    type="button"
                    onClick={() => setAddKind('milestone')}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium px-3 py-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create milestone
                  </button>
                )}
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMilestoneDragEnd}>
                <SortableContext items={filteredMilestones.map((m) => m.id || m.title)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {filteredMilestones.map((m) => {
                      const isCompleting = completingMilestoneIds.has(m.id || '');
                      const done = m.completed || isCompleting;
                      return (
                        <SortableRow key={m.id || m.title} id={m.id || m.title} disabled={dndDisabled}>
                          {(handleProps) => (
                            <div
                              className={cn(
                                'group flex items-center gap-2.5 rounded-md border px-2.5 py-1.5',
                                done ? 'bg-muted/40 border-border opacity-70' : 'bg-primary/10 border-primary/30'
                              )}
                            >
                              <button
                                type="button"
                                {...handleProps}
                                className="shrink-0 -ml-1 p-0.5 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden"
                                disabled={dndDisabled}
                                title="Drag to reorder"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <button
                        type="button"
                        disabled={done}
                        onClick={() => void onCompleteMilestone(m)}
                        className="shrink-0 inline-flex items-center justify-center h-4 w-4 rounded-sm border border-primary/60 bg-transparent hover:bg-primary/20 transition-colors disabled:opacity-60"
                        title={done ? 'Completed' : 'Mark milestone complete'}
                      >
                        {done ? (
                          <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                        ) : (
                          <Diamond className="h-3 w-3 text-primary fill-primary" />
                        )}
                      </button>
                      <span className={cn('flex-1 text-xs font-medium truncate', done && 'line-through')}>
                        {m.title}
                      </span>
                      {m.dueDate && (
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(m.dueDate), 'MMM d, yyyy')}
                          {!done && ` · ${relativeDays(m.dueDate)}`}
                        </span>
                      )}
                            </div>
                          )}
                        </SortableRow>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (handleProps: {
    ref: (el: HTMLElement | null) => void;
    [key: string]: any;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...(listeners as any), ...(attributes as any) } as any)}
    </div>
  );
}