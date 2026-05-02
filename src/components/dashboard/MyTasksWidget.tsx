import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isBefore, addDays, startOfDay, isPast } from 'date-fns';
import { CheckCircle2, Circle, ListTodo, ChevronDown, ChevronUp, CalendarDays, AlertTriangle, Plus, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
// Canonical task data source — same hook the /tasks page uses. The widget
// MUST stay aligned with it so dashboard counts and rows always match the
// Tasks page after refresh, navigation, and live updates.
import { useMyTasks, type Task, type TaskOwnerFilter } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';

type TaskFilter = 'today' | 'overdue' | 'upcoming' | 'all';
type GroupBy = 'date' | 'deal';
type Scope = 'mine' | 'team';

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

  // Map widget scope -> canonical owner filter used by /tasks. 'team' fetches
  // the full company task pool (matches /tasks "all"); 'mine' uses the same
  // assignee + collaborator semantics as the Tasks page.
  const ownerFilter: TaskOwnerFilter = scope === 'mine' ? 'mine' : 'all';
  const { tasks: allTasks, isLoading, updateTask } = useMyTasks(ownerFilter);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  const handleComplete = async (e: React.MouseEvent | React.KeyboardEvent, taskId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (completingIds.has(taskId)) return;
    setCompletingIds(prev => new Set(prev).add(taskId));
    try {
      await updateTask.mutateAsync({ id: taskId, status: 'complete' });
    } catch {
      // hook surfaces toast on error; nothing else to do
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // Treat tasks as "completed" using the EXACT same rule as the Tasks page
  // (status === 'complete'). `completed_at` is also a positive signal.
  const isComplete = (t: Task) => t.status === 'complete' || !!t.completed_at;

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
                {scope === 'mine' ? 'My Tasks' : 'Team Tasks'}
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-5">{overdueCount} overdue</Badge>
                )}
                {todayCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5">{todayCount} today</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
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
                  value={scope}
                  onValueChange={(v) => v && setScope(v as Scope)}
                  className="gap-0.5"
                >
                  <ToggleGroupItem value="mine" className="text-[11px] h-7 px-2 font-medium whitespace-nowrap text-muted-foreground data-[state=on]:text-foreground" title="My tasks only">
                    Mine
                  </ToggleGroupItem>
                  <ToggleGroupItem value="team" className="text-[11px] h-7 px-2 font-medium gap-1 whitespace-nowrap text-muted-foreground data-[state=on]:text-foreground" title="All team tasks">
                    <Users className="h-3 w-3" />Team
                  </ToggleGroupItem>
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
                          const isCompleting = completingIds.has(task.id);
                          return (
                            <div
                              key={task.id}
                              className={cn(
                                "w-full flex items-center gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors",
                                isOverdue && "border-l-2 border-destructive",
                                isCompleting && "opacity-60"
                              )}
                            >
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={false}
                                aria-label={`Mark "${task.title}" complete`}
                                disabled={isCompleting}
                                onClick={(e) => handleComplete(e, task.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    handleComplete(e, task.id);
                                  }
                                }}
                                className="shrink-0 h-7 w-7 -m-1.5 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-95 transition-all disabled:cursor-not-allowed"
                              >
                                <Circle className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={onOpen}
                                className="flex-1 min-w-0 text-left"
                              >
                                <p className="text-sm text-foreground truncate">{task.title}</p>
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
