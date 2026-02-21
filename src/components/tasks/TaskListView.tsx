import { KeyboardEvent, RefObject, useState, useCallback } from 'react';
import { type Task } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus, MoreHorizontal, Trash2, ChevronDown, ChevronRight, GripVertical,
  Calendar as CalendarIcon, Sun, Sunrise, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import confetti from 'canvas-confetti';
import { addDays, isToday, isTomorrow, isThisWeek, isPast, format, startOfDay, nextMonday } from 'date-fns';

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  high: { label: 'High', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  medium: { label: 'Medium', className: 'bg-primary/10 text-primary border-primary/20' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground border-border' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not Started', color: 'bg-muted-foreground/20' },
  in_progress: { label: 'In Progress', color: 'bg-primary' },
  blocked: { label: 'Blocked', color: 'bg-destructive' },
  complete: { label: 'Complete', color: 'bg-emerald-500' },
};

export type GroupBy = 'status' | 'time' | 'priority';

interface TaskListViewProps {
  tasks: Task[];
  statusGroups: { key: string; label: string }[];
  isLoading: boolean;
  isCreating: boolean;
  newTaskTitle: string;
  newTaskRef: RefObject<HTMLInputElement>;
  onNewTaskChange: (v: string) => void;
  onNewTaskKeyDown: (e: KeyboardEvent) => void;
  onNewTaskCreate: () => void;
  onCancelCreate: () => void;
  onSelectTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  selectedTaskId: string | null;
  groupBy?: GroupBy;
  selectedTaskIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function getTimeGroups(tasks: Task[]) {
  const today = startOfDay(new Date());
  const groups = [
    { key: 'overdue', label: '🔴 Overdue', tasks: [] as Task[] },
    { key: 'today', label: '📌 Today', tasks: [] as Task[] },
    { key: 'tomorrow', label: 'Tomorrow', tasks: [] as Task[] },
    { key: 'this_week', label: 'This Week', tasks: [] as Task[] },
    { key: 'upcoming', label: 'Upcoming', tasks: [] as Task[] },
    { key: 'no_date', label: 'No Due Date', tasks: [] as Task[] },
  ];

  tasks.forEach(t => {
    if (t.status === 'complete') {
      // completed tasks go to upcoming by default
      groups[4].tasks.push(t);
      return;
    }
    if (!t.due_date) {
      groups[5].tasks.push(t);
      return;
    }
    const d = new Date(t.due_date + 'T00:00:00');
    if (isPast(d) && !isToday(d)) groups[0].tasks.push(t);
    else if (isToday(d)) groups[1].tasks.push(t);
    else if (isTomorrow(d)) groups[2].tasks.push(t);
    else if (isThisWeek(d, { weekStartsOn: 1 })) groups[3].tasks.push(t);
    else groups[4].tasks.push(t);
  });

  return groups.filter(g => g.tasks.length > 0);
}

function getPriorityGroups(tasks: Task[]) {
  const order = ['urgent', 'high', 'medium', 'low'];
  return order.map(key => ({
    key,
    label: PRIORITY_CONFIG[key]?.label || key,
    tasks: tasks.filter(t => t.priority === key),
  })).filter(g => g.tasks.length > 0);
}

function fireCelebration() {
  confetti({
    particleCount: 60,
    spread: 55,
    origin: { y: 0.7 },
    colors: ['#10b981', '#059669', '#34d399'],
    disableForReducedMotion: true,
  });
}

export function TaskListView({
  tasks, statusGroups, isLoading, isCreating, newTaskTitle, newTaskRef,
  onNewTaskChange, onNewTaskKeyDown, onNewTaskCreate, onCancelCreate,
  onSelectTask, onUpdateTask, onDeleteTask, selectedTaskId,
  groupBy = 'status', selectedTaskIds, onToggleSelect,
}: TaskListViewProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find tasks and swap positions
    const activeTask = tasks.find(t => t.id === active.id);
    const overTask = tasks.find(t => t.id === over.id);
    if (!activeTask || !overTask) return;

    // If dragged to different status section, update status
    if (activeTask.status !== overTask.status) {
      onUpdateTask(activeTask.id, { status: overTask.status } as any);
    }

    // Update position
    onUpdateTask(activeTask.id, { position: overTask.position } as any);
  };

  const handleCompleteWithCelebration = useCallback((taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'complete' ? 'not_started' : 'complete';
    onUpdateTask(taskId, { status: newStatus } as any);
    if (newStatus === 'complete') {
      fireCelebration();
    }
  }, [onUpdateTask]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  // Build groups based on groupBy mode
  let groups: { key: string; label: string; tasks: Task[] }[];
  if (groupBy === 'time') {
    groups = getTimeGroups(tasks);
  } else if (groupBy === 'priority') {
    groups = getPriorityGroups(tasks);
  } else {
    groups = statusGroups.map(g => ({
      key: g.key,
      label: g.label,
      tasks: tasks.filter(t => t.status === g.key),
    }));
  }

  const allTaskIds = tasks.map(t => t.id);
  const draggedTask = dragActiveId ? tasks.find(t => t.id === dragActiveId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="divide-y">
        {/* Column header */}
        <div className="grid grid-cols-[20px_auto_1fr_120px_100px_100px_40px] gap-2 items-center px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/30 sticky top-0 z-10">
          <div />
          <div className="w-5" />
          <div>Task name</div>
          <div>Due date</div>
          <div>Priority</div>
          <div>Status</div>
          <div />
        </div>

        <SortableContext items={allTaskIds} strategy={verticalListSortingStrategy}>
          {groups.map(group => {
            const isCollapsed = collapsedSections.has(group.key);

            return (
              <div key={group.key}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(group.key)}
                  className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/40 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {groupBy === 'status' && (
                    <div className={cn('h-2 w-2 rounded-full', STATUS_CONFIG[group.key]?.color)} />
                  )}
                  <span className="text-xs font-semibold">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">({group.tasks.length})</span>
                </button>

                {!isCollapsed && (
                  <>
                    {group.tasks.map(task => (
                      <SortableTaskRow
                        key={task.id}
                        task={task}
                        isSelected={selectedTaskId === task.id}
                        isMultiSelected={selectedTaskIds?.has(task.id) || false}
                        onSelect={() => onSelectTask(task.id)}
                        onUpdate={(updates) => onUpdateTask(task.id, updates)}
                        onDelete={() => onDeleteTask(task.id)}
                        onToggleComplete={() => handleCompleteWithCelebration(task.id, task.status)}
                        onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
                      />
                    ))}

                    {/* Inline add for first section */}
                    {group === groups[0] && (
                      <>
                        {isCreating ? (
                          <div className="grid grid-cols-[20px_auto_1fr_120px_100px_100px_40px] gap-2 items-center px-4 py-1.5">
                            <div />
                            <div className="w-5" />
                            <Input
                              ref={newTaskRef as any}
                              value={newTaskTitle}
                              onChange={e => onNewTaskChange(e.target.value)}
                              onKeyDown={onNewTaskKeyDown}
                              placeholder="Task name... (Enter to create, Esc to cancel)"
                              className="h-7 text-sm border-primary"
                              autoFocus
                            />
                            <div />
                            <div />
                            <div />
                            <div />
                          </div>
                        ) : (
                          <button
                            onClick={() => onNewTaskChange('')}
                            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add task
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </SortableContext>

        {tasks.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Task" to get started</p>
          </div>
        )}
      </div>

      <DragOverlay>
        {draggedTask && (
          <div className="bg-card border rounded-md shadow-lg px-4 py-2 text-sm opacity-90">
            {draggedTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Quick date shortcuts component
function QuickDatePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextMon = format(nextMonday(new Date()), 'yyyy-MM-dd');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs hover:bg-muted/40 rounded px-1.5 py-0.5 transition-colors">
          {value ? (
            <span className={cn(
              value < today ? 'text-destructive font-medium' : 'text-muted-foreground'
            )}>
              {format(new Date(value + 'T00:00:00'), 'MMM d')}
            </span>
          ) : (
            <span className="text-muted-foreground/40">No date</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        <div className="space-y-0.5">
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
            onClick={() => onChange(today)}
          >
            <Sun className="h-3 w-3 text-orange-500" /> Today
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
            onClick={() => onChange(tomorrow)}
          >
            <Sunrise className="h-3 w-3 text-amber-500" /> Tomorrow
          </button>
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
            onClick={() => onChange(nextMon)}
          >
            <ArrowRight className="h-3 w-3 text-primary" /> Next Monday
          </button>
          <div className="border-t my-1" />
          <Input
            type="date"
            value={value || ''}
            onChange={e => onChange(e.target.value || null)}
            className="h-7 text-xs"
          />
          {value && (
            <>
              <div className="border-t my-1" />
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-destructive transition-colors"
                onClick={() => onChange(null)}
              >
                Remove date
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Inline priority picker
function InlinePriorityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const conf = PRIORITY_CONFIG[value] || PRIORITY_CONFIG.medium;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-5 text-[10px] border-none bg-transparent px-0 w-[80px] focus:ring-0">
        <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', conf.className)}>
          {conf.label}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="urgent" className="text-xs">🔴 Urgent</SelectItem>
        <SelectItem value="high" className="text-xs">🟠 High</SelectItem>
        <SelectItem value="medium" className="text-xs">🔵 Medium</SelectItem>
        <SelectItem value="low" className="text-xs">⚪ Low</SelectItem>
      </SelectContent>
    </Select>
  );
}

// Sortable task row with drag handle and inline editing
function SortableTaskRow({ task, isSelected, isMultiSelected, onSelect, onUpdate, onDelete, onToggleComplete, onToggleSelect }: {
  task: Task;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  onToggleSelect?: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);

  const isComplete = task.status === 'complete';

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== task.title) {
      onUpdate({ title: titleValue.trim() } as any);
    }
    setEditingTitle(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'grid grid-cols-[20px_auto_1fr_120px_100px_100px_40px] gap-2 items-center px-4 py-1.5 hover:bg-muted/30 cursor-pointer transition-colors group',
        isSelected && 'bg-primary/5 border-r-2 border-r-primary',
        isMultiSelected && 'bg-primary/10',
        isDragging && 'z-50',
      )}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <Checkbox
        checked={isComplete}
        onCheckedChange={() => onToggleComplete()}
        onClick={e => e.stopPropagation()}
        className={cn('h-4 w-4 rounded-full transition-all', isComplete && 'bg-emerald-500 border-emerald-500')}
      />

      {/* Title - inline editable */}
      <div className="min-w-0" onClick={e => e.stopPropagation()}>
        {editingTitle ? (
          <Input
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false); }
            }}
            className="h-7 text-sm"
            autoFocus
          />
        ) : (
          <span
            className={cn(
              'text-sm truncate block cursor-text hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors',
              isComplete && 'line-through text-muted-foreground'
            )}
            onDoubleClick={() => { setTitleValue(task.title); setEditingTitle(true); }}
            onClick={onSelect}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Due date - quick picker */}
      <div onClick={e => e.stopPropagation()}>
        <QuickDatePicker
          value={task.due_date}
          onChange={v => onUpdate({ due_date: v } as any)}
        />
      </div>

      {/* Priority - inline picker */}
      <div onClick={e => e.stopPropagation()}>
        <InlinePriorityPicker
          value={task.priority}
          onChange={v => onUpdate({ priority: v } as any)}
        />
      </div>

      {/* Status */}
      <div onClick={e => e.stopPropagation()}>
        <Select
          value={task.status}
          onValueChange={v => {
            onUpdate({ status: v } as any);
            if (v === 'complete') fireCelebration();
          }}
        >
          <SelectTrigger className="h-6 text-[10px] border-none bg-transparent px-1 w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
            <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
            <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
            <SelectItem value="complete" className="text-xs">Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDelete} className="text-destructive text-xs">
              <Trash2 className="h-3 w-3 mr-2" />
              Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
