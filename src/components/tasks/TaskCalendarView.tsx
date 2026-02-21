import { useMemo, useState } from 'react';
import { type Task } from '@/hooks/useTasks';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isToday, isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-destructive',
  high: 'bg-orange-500',
  medium: 'bg-primary',
  low: 'bg-muted-foreground/40',
};

interface TaskCalendarViewProps {
  tasks: Task[];
  onSelectTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  selectedTaskId: string | null;
}

export function TaskCalendarView({ tasks, onSelectTask, onUpdateTask, selectedTaskId }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

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
                {dayTasks.slice(0, 3).map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onClick={() => onSelectTask(task.id)}
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded cursor-pointer truncate flex items-center gap-1',
                      'hover:bg-muted transition-colors',
                      task.status === 'complete' && 'line-through text-muted-foreground',
                      selectedTaskId === task.id && 'ring-1 ring-primary bg-primary/5',
                    )}
                  >
                    <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium)} />
                    {task.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[9px] text-muted-foreground pl-1">+{dayTasks.length - 3} more</span>
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
                className="text-[10px] px-2 py-0.5 rounded border bg-card cursor-grab hover:shadow-sm"
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
