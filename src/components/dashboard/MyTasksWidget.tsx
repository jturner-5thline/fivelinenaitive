import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isBefore, addDays, startOfDay, isPast } from 'date-fns';
import { CheckCircle2, Circle, ListTodo, ChevronDown, ChevronUp, CalendarDays, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAllMilestones, MilestoneWithDeal } from '@/hooks/useAllMilestones';
import { cn } from '@/lib/utils';

type TaskFilter = 'today' | 'overdue' | 'upcoming' | 'all';
type GroupBy = 'date' | 'deal';

interface MyTasksWidgetProps {
  variant?: 'compact' | 'expanded';
  defaultOpen?: boolean;
}

export function MyTasksWidget({ variant = 'expanded', defaultOpen = true }: MyTasksWidgetProps) {
  const navigate = useNavigate();
  const { milestones, isLoading } = useAllMilestones();
  const [filter, setFilter] = useState<TaskFilter>('today');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const tasks = useMemo(() => {
    const incomplete = milestones.filter(m => !m.completed);
    const today = startOfDay(new Date());
    const threeDaysOut = addDays(today, 3);

    switch (filter) {
      case 'today':
        return incomplete.filter(m => m.due_date && isToday(new Date(m.due_date)));
      case 'overdue':
        return incomplete.filter(m => m.due_date && isPast(new Date(m.due_date)) && !isToday(new Date(m.due_date)));
      case 'upcoming':
        return incomplete.filter(m => {
          if (!m.due_date) return false;
          const d = new Date(m.due_date);
          return !isPast(d) && isBefore(d, threeDaysOut);
        });
      case 'all':
      default:
        return incomplete;
    }
  }, [milestones, filter]);

  const grouped = useMemo(() => {
    if (groupBy === 'deal') {
      const byDeal = new Map<string, MilestoneWithDeal[]>();
      tasks.forEach(t => {
        const key = t.deal_company || 'No Deal';
        if (!byDeal.has(key)) byDeal.set(key, []);
        byDeal.get(key)!.push(t);
      });
      return Array.from(byDeal.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }
    // Group by date
    const byDate = new Map<string, MilestoneWithDeal[]>();
    tasks.forEach(t => {
      const key = t.due_date ? format(new Date(t.due_date), 'MMM d, yyyy') : 'No date';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(t);
    });
    return Array.from(byDate.entries());
  }, [tasks, groupBy]);

  const overdueCount = useMemo(() => {
    return milestones.filter(m => !m.completed && m.due_date && isPast(new Date(m.due_date)) && !isToday(new Date(m.due_date))).length;
  }, [milestones]);

  const todayCount = useMemo(() => {
    return milestones.filter(m => !m.completed && m.due_date && isToday(new Date(m.due_date))).length;
  }, [milestones]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                My Tasks
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
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as TaskFilter)} className="justify-start">
                <ToggleGroupItem value="today" className="text-xs h-7 px-2.5">Today</ToggleGroupItem>
                <ToggleGroupItem value="overdue" className="text-xs h-7 px-2.5 gap-1">
                  <AlertTriangle className="h-3 w-3" />Overdue
                </ToggleGroupItem>
                <ToggleGroupItem value="upcoming" className="text-xs h-7 px-2.5">Next 3 days</ToggleGroupItem>
                <ToggleGroupItem value="all" className="text-xs h-7 px-2.5">All</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" value={groupBy} onValueChange={(v) => v && setGroupBy(v as GroupBy)} className="justify-end">
                <ToggleGroupItem value="date" className="text-xs h-7 px-2">By date</ToggleGroupItem>
                <ToggleGroupItem value="deal" className="text-xs h-7 px-2">By deal</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <ScrollArea className="max-h-[400px]">
              {tasks.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {filter === 'today' ? 'No tasks due today — you\'re all caught up!' : 'No tasks match this filter.'}
                  </p>
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
                          const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));
                          return (
                            <button
                              key={task.id}
                              onClick={() => navigate(`/deal/${task.deal_id}`)}
                              className={cn(
                                "w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left",
                                isOverdue && "border-l-2 border-destructive"
                              )}
                            >
                              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{task.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-primary font-medium truncate max-w-[120px]">{task.deal_company}</span>
                                  {task.due_date && (
                                    <span className={cn("text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                                      {isToday(new Date(task.due_date)) ? 'Today' : format(new Date(task.due_date), 'MMM d')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
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
