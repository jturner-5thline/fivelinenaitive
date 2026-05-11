import { useState } from 'react';
import type { Deal, DealMilestone } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import { Diamond, Pencil, Square, Check, Plus } from 'lucide-react';
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

/**
 * Tasks & milestones band rendered between the card header and the
 * 3-column insights row. Lists open tasks/outstanding items (capped) and
 * highlights the next upcoming milestone, if any.
 */
export function TasksMilestonesBand({ deal, tasks, rawDigest }: TasksMilestonesBandProps) {
  const queryClient = useQueryClient();
  const { company } = useCompany();
  const [activeFilter, setActiveFilter] = useState<'task' | 'milestone' | 'outstanding' | null>(null);

  const nextMilestone = nextUpcomingMilestone(deal.milestones);
  const allIncompleteMilestones = (deal.milestones || [])
    .filter((m) => !m.completed)
    .sort((a, b) => {
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ta - tb;
    });

  const taskOnlyItems = tasks.filter((t) => t.kind === 'task');
  const outstandingOnlyItems = tasks.filter((t) => {
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
      : tasks;
  const milestonesToRender =
    activeFilter === 'milestone'
      ? allIncompleteMilestones
      : activeFilter === null && nextMilestone
      ? [nextMilestone]
      : [];
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

  const refreshTasks = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pipeline-deal-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['deal-tasks'] }),
    ]);
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

  const saveDueDate = async (task: DealTaskItem, date?: Date) => {
    if (task.kind !== 'task') return;

    setEditingDateId(null);
    const dueDate = date ? format(date, 'yyyy-MM-dd') : null;
    const { error } = await supabase.from('tasks').update({ due_date: dueDate }).eq('id', task.id);

    if (error) {
      toast.error('Failed to update due date');
      return;
    }

    toast.success('Due date updated');
    await refreshTasks();
  };

  const saveAssignee = async (task: DealTaskItem, userId: string | null) => {
    if (task.kind !== 'task') return;

    setEditingAssigneeId(null);
    const { error } = await supabase.from('tasks').update({ assigned_to: userId }).eq('id', task.id);

    if (error) {
      toast.error('Failed to update assignee');
      return;
    }

    toast.success('Assignee updated');
    await refreshTasks();
  };

  return (
    <div className="px-5 py-3 bg-muted/40 border-b border-border">
      <div className="md:max-w-[88%] lg:max-w-[85%]">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Tasks & milestones
        </div>
        <div
          className="flex items-center gap-1"
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
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                  selected
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:border-primary/40'
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
            const dueDate = task.dueDate ? new Date(task.dueDate) : null;
            const isOverdue = !!dueDate && differenceInCalendarDays(dueDate, new Date()) < 0;
            const assigneeLabel = task.kind === 'task' ? task.assignedToName : task.requestedByName;
            const showPlusHere = !addFormOpen && idx === plusOnTaskIndex;

            const rowEl = (
              <div
                className="group flex-1 min-w-0 flex items-center gap-2.5 rounded-md bg-background/70 border border-border/60 px-2.5 py-1.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

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
                    onOpenChange={(open) => setEditingAssigneeId(open ? task.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(null);
                          setEditingDateId(null);
                          setEditingAssigneeId(task.id);
                        }}
                        className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
                        title={assigneeLabel || 'Assign'}
                      >
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[8px] font-semibold text-muted-foreground/90">
                          {initialsOf(assigneeLabel) || '?'}
                        </span>
                        <span className="truncate max-w-[84px]">{assigneeLabel || 'Unassigned'}</span>
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
                            <CommandItem onSelect={() => void saveAssignee(task, null)} className="gap-2">
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                                ?
                              </span>
                              <span>Unassigned</span>
                              {!task.assignedToId && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                            </CommandItem>
                            {members.map((member) => (
                              <CommandItem
                                key={member.id}
                                value={`${member.name} ${member.id}`}
                                onSelect={() => void saveAssignee(task, member.id)}
                                className="gap-2"
                              >
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                                  {initialsOf(member.name)}
                                </span>
                                <span className="truncate">{member.name}</span>
                                {task.assignedToId === member.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
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
                    onOpenChange={(open) => setEditingDateId(open ? task.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(null);
                          setEditingAssigneeId(null);
                          setEditingDateId(task.id);
                        }}
                        className={cn(
                          'rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0 transition-colors hover:text-foreground',
                          isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                        )}
                        title={dueDate ? format(dueDate, 'MMM d, yyyy') : 'Set due date'}
                      >
                        {dueDate ? format(dueDate, 'MMM d') : '+ date'}
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
                        onSelect={(date) => void saveDueDate(task, date || undefined)}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                      {dueDate && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void saveDueDate(task, undefined);
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
                <Diamond className="h-3.5 w-3.5 text-primary shrink-0 fill-primary" />
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