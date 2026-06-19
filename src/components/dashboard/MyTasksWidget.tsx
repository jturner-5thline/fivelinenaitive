import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isBefore, addDays, startOfDay, isPast } from 'date-fns';
import { CheckCircle2, ListTodo, ChevronDown, ChevronUp, CalendarDays, AlertTriangle, Plus, Users, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useUndoStack } from '@/hooks/useUndoStack';
// Canonical task data source — same hook the /tasks page uses. The widget
// MUST stay aligned with it so dashboard counts and rows always match the
// Tasks page after refresh, navigation, and live updates.
import { useMyTasks, type Task, type TaskOwnerFilter } from '@/hooks/useTasks';
import { useCompany } from '@/hooks/useCompany';
import { cn } from '@/lib/utils';

type TaskFilter = 'today' | 'overdue' | 'upcoming' | 'all';
type GroupBy = 'date' | 'deal';
type Scope = 'mine' | 'all';

interface MyTasksWidgetProps {
  variant?: 'compact' | 'expanded';
  defaultOpen?: boolean;
}

export function MyTasksWidget({ variant = 'expanded', defaultOpen = true }: MyTasksWidgetProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [scope, setScope] = useState<Scope>('mine');
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { isAdmin } = useCompany();

  // Non-admins cannot view the company-wide pool. Force back to "mine" if
  // an admin who previously selected "all" loses the role.
  const effectiveScope: Scope = isAdmin ? scope : 'mine';

  // Map widget scope -> canonical owner filter used by /tasks. 'team' fetches
  // the full company task pool (matches /tasks "all"); 'mine' uses the same
  // assignee + collaborator semantics as the Tasks page.
  const ownerFilter: TaskOwnerFilter = effectiveScope === 'mine' ? 'mine' : 'all';
  const { tasks: allTasks, isLoading, updateTask } = useMyTasks(ownerFilter);
  // Optimistically-completed task ids. These rows stay visible (faded +
  // strikethrough) for 1.5s before being filtered out so the user gets
  // confirmation of the action and the click target doesn't shift.
  const [optimisticDoneIds, setOptimisticDoneIds] = useState<Set<string>>(new Set());
  // Once the 1.5s grace expires we hide the row from the open list.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Per-row disable window (500ms) to swallow rapid double-clicks.
  const recentClickRef = useRef<Map<string, number>>(new Map());
  const { push: pushUndo, pop: popUndo, canUndo } = useUndoStack(10);

  const restoreTask = useCallback(
    async (task: Task) => {
      setOptimisticDoneIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
      setHiddenIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
      try {
        await updateTask.mutateAsync({ id: task.id, status: task.status || 'not_started' });
        toast.success('Undone');
      } catch {
        toast.error('Could not undo — try again');
      }
    },
    [updateTask],
  );

  // Click handler for the visible Undo button — pops the most recent action
  // off the stack and runs it. Mirrors the Cmd/Ctrl+Z behavior below.
  const handleUndoClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // don't toggle the Collapsible
      const action = popUndo();
      if (!action) return;
      Promise.resolve(action.undo()).catch(() => {});
    },
    [popUndo],
  );

  const handleComplete = useCallback(
    (task: Task) => {
      // 500ms per-row debounce
      const now = Date.now();
      const last = recentClickRef.current.get(task.id) ?? 0;
      if (now - last < 500) return;
      recentClickRef.current.set(task.id, now);
      if (optimisticDoneIds.has(task.id)) return;

      // Snapshot the prior status so undo can restore it precisely.
      const priorStatus = task.status || 'not_started';

      // Optimistic UI: mark done immediately.
      setOptimisticDoneIds(prev => new Set(prev).add(task.id));

      // Hide from the list after 1.5s so the row stays put briefly.
      window.setTimeout(() => {
        setHiddenIds(prev => new Set(prev).add(task.id));
      }, 1500);

      // Fire the mutation; revert on failure.
      updateTask.mutate(
        { id: task.id, status: 'complete' },
        {
          onError: () => {
            setOptimisticDoneIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
            setHiddenIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
            toast.error('Could not update task — try again');
          },
        },
      );

      // Push to the undo stack and show toast with Undo action (8s).
      pushUndo({
        label: task.title,
        undo: () => restoreTask({ ...task, status: priorStatus }),
      });
      toast(`Task "${task.title}" marked complete`, {
        duration: 8000,
        action: {
          label: 'Undo',
          onClick: () => restoreTask({ ...task, status: priorStatus }),
        },
      });
    },
    [optimisticDoneIds, pushUndo, restoreTask, updateTask],
  );

  // Cmd/Ctrl+Z — undo the most recent completion from this widget.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const action = popUndo();
      if (!action) return;
      e.preventDefault();
      Promise.resolve(action.undo()).catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popUndo]);

  // Treat tasks as "completed" using the EXACT same rule as the Tasks page
  // (status === 'complete'). `completed_at` is also a positive signal.
  const isComplete = (t: Task) =>
    t.status === 'complete' || !!t.completed_at || hiddenIds.has(t.id);

  // Date helpers mirror /pages/Tasks.tsx so a task that the Tasks page treats
  // as Today/Overdue/Upcoming is bucketed identically here.
  const parseDue = (d: string | null) => (d ? new Date(d + 'T00:00:00') : null);
  const parseDueEnd = (d: string | null) => (d ? new Date(d + 'T23:59:59') : null);

  const filtered = useMemo(() => {
    const incomplete = allTasks.filter(t => !isComplete(t));
    const todayDate = startOfDay(new Date());
    const threeDaysOut = addDays(todayDate, 3);

    switch (filter) {
      case 'today':
        return incomplete.filter(t => {
          const d = parseDue(t.due_date);
          return d ? isToday(d) : false;
        });
      case 'overdue':
        return incomplete.filter(t => {
          const dEnd = parseDueEnd(t.due_date);
          const dStart = parseDue(t.due_date);
          return !!dEnd && !!dStart && isPast(dEnd) && !isToday(dStart);
        });
      case 'upcoming':
        return incomplete.filter(t => {
          const d = parseDue(t.due_date);
          if (!d) return false;
          return !isPast(d) && isBefore(d, threeDaysOut);
        });
      case 'all':
      default:
        return incomplete;
    }
  }, [allTasks, filter]);

  const grouped = useMemo(() => {
    if (groupBy === 'deal') {
      const byDeal = new Map<string, Task[]>();
      filtered.forEach(t => {
        const key = t.deal?.company || t.crm_company?.name || t.contact?.full_name || 'No Deal';
        if (!byDeal.has(key)) byDeal.set(key, []);
        byDeal.get(key)!.push(t);
      });
      return Array.from(byDeal.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }
    const byDate = new Map<string, Task[]>();
    filtered.forEach(t => {
      const d = parseDue(t.due_date);
      const key = d ? format(d, 'MMM d, yyyy') : 'No date';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(t);
    });
    return Array.from(byDate.entries());
  }, [filtered, groupBy]);

  const overdueCount = useMemo(
    () => allTasks.filter(t => {
      if (isComplete(t)) return false;
      const dEnd = parseDueEnd(t.due_date);
      const dStart = parseDue(t.due_date);
      return !!dEnd && !!dStart && isPast(dEnd) && !isToday(dStart);
    }).length,
    [allTasks],
  );

  const todayCount = useMemo(
    () => allTasks.filter(t => {
      if (isComplete(t)) return false;
      const d = parseDue(t.due_date);
      return d ? isToday(d) : false;
    }).length,
    [allTasks],
  );

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="h-full">
      <Card className="h-full flex flex-col">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                {effectiveScope === 'mine' ? 'My Tasks' : 'All Tasks'}
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-5">{overdueCount} overdue</Badge>
                )}
                {todayCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5">{todayCount} today</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canUndo && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 gap-1 text-[11px]"
                        onClick={handleUndoClick}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Undo
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Undo last action (⌘Z)
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex-1 min-h-0 flex flex-col">
          <CardContent className="pt-0 space-y-3 flex-1 min-h-0 flex flex-col">
            {/* Single-row unified filter bar */}
            <div className="border-b border-border/40 -mx-6 px-6 pb-2">
              <div className="flex items-center gap-1 flex-nowrap overflow-x-auto">
                <ToggleGroup
                  type="single"
                  value={filter}
                  onValueChange={(v) => v && setFilter(v as TaskFilter)}
                  className="justify-start gap-0.5"
                >
                  <ToggleGroupItem value="all" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap">All Tasks</ToggleGroupItem>
                  <ToggleGroupItem value="today" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap">Today</ToggleGroupItem>
                  <ToggleGroupItem value="overdue" className="text-[11px] h-7 px-2 font-medium gap-1 whitespace-nowrap">
                    <AlertTriangle className="h-3 w-3" />Overdue
                  </ToggleGroupItem>
                  <ToggleGroupItem value="upcoming" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap">Next 3 Days</ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  value={effectiveScope}
                  onValueChange={(v) => v && isAdmin && setScope(v as Scope)}
                  className="gap-0.5"
                >
                  <ToggleGroupItem value="mine" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap text-muted-foreground data-[state=on]:text-foreground" title="My tasks only">
                    Mine
                  </ToggleGroupItem>
                  {isAdmin && (
                    <ToggleGroupItem
                      value="all"
                      className="text-[11px] h-7 px-2 font-medium gap-1 whitespace-nowrap text-muted-foreground data-[state=on]:text-foreground"
                      title="All tasks across your company (admin only)"
                    >
                      <Users className="h-3 w-3" />All
                    </ToggleGroupItem>
                  )}
                </ToggleGroup>
                <ToggleGroup
                  type="single"
                  value={groupBy}
                  onValueChange={(v) => v && setGroupBy(v as GroupBy)}
                  className="gap-0.5"
                >
                  <ToggleGroupItem value="date" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap text-muted-foreground data-[state=on]:text-foreground">
                    By Date
                  </ToggleGroupItem>
                  <ToggleGroupItem value="deal" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap text-muted-foreground data-[state=on]:text-foreground">
                    By Deal
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              {filtered.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {filter === 'today'
                      ? 'No tasks due today.'
                      : filter === 'all'
                        ? 'No open tasks.'
                        : 'No tasks match this filter.'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filter === 'all'
                      ? 'Create one to get started.'
                      : filter === 'today'
                        ? 'Try Overdue, Next 3 Days, or All Tasks — or create a new task.'
                        : 'Try a different filter or scope.'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs gap-1"
                    onClick={() => navigate('/tasks')}
                  >
                    <Plus className="h-3 w-3" />
                    Create Task
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {grouped.map(([groupLabel, items]) => (
                    <div key={groupLabel}>
                      <h5 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        {groupBy === 'deal' ? <CalendarDays className="h-3 w-3" /> : null}
                        {groupLabel}
                        <Badge variant="outline" className="text-[10px] h-4">{items.length}</Badge>
                      </h5>
                      <div className="space-y-1">
                         {items.map(task => {
                          const dStart = parseDue(task.due_date);
                          const dEnd = parseDueEnd(task.due_date);
                          const isOverdue = !!dEnd && !!dStart && isPast(dEnd) && !isToday(dStart);
                          const dealLabel = task.deal?.company || task.crm_company?.name || task.contact?.full_name || '';
                          // Route to the canonical Task detail in /tasks (matches
                          // the Tasks page query param contract used elsewhere).
                          const onOpen = () => navigate(`/tasks?task=${task.id}`);
                          const optimisticDone = optimisticDoneIds.has(task.id);
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                "w-full flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-300",
                                isOverdue && "border-l-2 border-destructive",
                                optimisticDone && "opacity-50"
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="shrink-0 inline-flex">
                                    <TaskCompletionCheckbox
                                      checked={optimisticDone}
                                      disabled={optimisticDone}
                                      taskTitle={task.title}
                                      onChange={() => handleComplete(task)}
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  {optimisticDone ? 'Mark incomplete' : 'Mark complete'}
                                </TooltipContent>
                              </Tooltip>
                              <button
                                type="button"
                                onClick={onOpen}
                                className="flex-1 min-w-0 text-left"
                              >
                                <p className={cn(
                                  "text-sm text-foreground truncate transition-all",
                                  optimisticDone && "line-through text-muted-foreground"
                                )}>{task.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {dealLabel && (
                                    <span className="text-xs text-primary font-medium truncate max-w-[120px]">{dealLabel}</span>
                                  )}
                                  {dStart && (
                                    <span className={cn("text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                                      {isToday(dStart) ? 'Today' : format(dStart, 'MMM d')}
                                    </span>
                                  )}
                                </div>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
