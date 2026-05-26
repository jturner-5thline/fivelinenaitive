import { useMemo, useState } from 'react';
import { type Task } from '@/hooks/useTasks';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isToday, isSameMonth, addMonths, subMonths,
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const URGENT_BORDER = 'border-l-[hsl(0,84%,60%)]';
const URGENT_BG = 'bg-[hsl(0,84%,60%,0.08)]';
const DEFAULT_BORDER = 'border-l-muted-foreground/30';
const DEFAULT_BG = 'bg-card';
const priorityBorder = (p: any) => (p === 'urgent' ? URGENT_BORDER : DEFAULT_BORDER);
const priorityBg = (p: any) => (p === 'urgent' ? URGENT_BG : DEFAULT_BG);

interface TaskCalendarViewProps {
  tasks: Task[];
  onSelectTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  selectedTaskId: string | null;
}

export function TaskCalendarView({ tasks, onSelectTask, onUpdateTask, selectedTaskId }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      if (!t.due_date) return;
      const key = t.due_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const handleDrop = (day: Date) => {
    if (!draggedTaskId) return;
    const dateStr = format(day, 'yyyy-MM-dd');
    onUpdateTask(draggedTaskId, { due_date: dateStr } as any);
    setDraggedTaskId(null);
  };

  const toggleExpand = (dateStr: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
      return next;
    });
  };

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex flex-col h-full">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold min-w-[140px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCurrentMonth(new Date())}>
          Today
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {weekDays.map(day => (
          <div key={day} className="text-center text-[11px] font-medium text-muted-foreground py-2 border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDate.get(dateStr) || [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const isExpanded = expandedDays.has(dateStr);
          const visibleCount = isExpanded ? dayTasks.length : Math.min(dayTasks.length, 2);
          const hiddenCount = dayTasks.length - visibleCount;

          return (
            <div
              key={i}
              className={cn(
                'border-r border-b last:border-r-0 p-1 min-h-[80px] transition-colors',
                !inMonth && 'bg-muted/20',
                draggedTaskId && 'hover:bg-primary/5',
              )}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={e => { e.preventDefault(); handleDrop(day); }}
            >
              <div className={cn(
                'text-[11px] font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                today && 'bg-primary text-primary-foreground',
                !today && !inMonth && 'text-muted-foreground/40',
                !today && inMonth && 'text-foreground',
              )}>
                {format(day, 'd')}
              </div>

              <div className="space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, visibleCount).map(task => {
                  const isOverdue = task.due_date && task.due_date < todayStr && task.status !== 'complete';
                  const daysOverdue = isOverdue ? Math.ceil((new Date(todayStr).getTime() - new Date(task.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)) : 0;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onDragEnd={() => setDraggedTaskId(null)}
                      onClick={() => onSelectTask(task.id)}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded cursor-pointer truncate border-l-2',
                        priorityBorder(task.priority),
                        priorityBg(task.priority),
                        'hover:brightness-95 transition-all',
                        task.status === 'complete' && 'line-through text-muted-foreground opacity-60',
                        selectedTaskId === task.id && 'ring-1 ring-primary',
                        isOverdue && daysOverdue >= 4 && 'text-[hsl(0,74%,50%)] font-bold',
                        isOverdue && daysOverdue >= 1 && daysOverdue < 4 && 'text-[hsl(0,84%,60%)] font-medium',
                      )}
                      title={task.title}
                    >
                      {daysOverdue >= 8 && <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5" />}
                      {task.title.length > 20 ? task.title.slice(0, 20) + '…' : task.title}
                      {task.deal_id && (task as any).deal?.company && (
                        <span className="ml-0.5 opacity-70">· {(task as any).deal.company}</span>
                      )}
                      {task.contact_id && (task as any).contact?.full_name && (
                        <span className="ml-0.5 opacity-70">· {(task as any).contact.full_name}</span>
                      )}
                      {task.crm_company_id && (task as any).crm_company?.name && (
                        <span className="ml-0.5 opacity-70">· {(task as any).crm_company.name}</span>
                      )}
                    </div>
                  );
                })}
                {hiddenCount > 0 && (
                  <button
                    className="text-[9px] text-primary hover:underline pl-1 cursor-pointer"
                    onClick={() => toggleExpand(dateStr)}
                  >
                    +{hiddenCount} more
                  </button>
                )}
                {isExpanded && dayTasks.length > 2 && (
                  <button
                    className="text-[9px] text-muted-foreground hover:underline pl-1 cursor-pointer"
                    onClick={() => toggleExpand(dateStr)}
                  >
                    show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled tasks */}
      {tasks.filter(t => !t.due_date).length > 0 && (
        <div className="border-t px-4 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {tasks.filter(t => !t.due_date).length} unscheduled — drag to a day to set due date
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {tasks.filter(t => !t.due_date).slice(0, 8).map(task => (
              <div
                key={task.id}
                draggable
                onDragStart={() => setDraggedTaskId(task.id)}
                onDragEnd={() => setDraggedTaskId(null)}
                onClick={() => onSelectTask(task.id)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border-l-2 cursor-grab hover:shadow-sm bg-card",
                  priorityBorder(task.priority),
                )}
              >
                {task.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
