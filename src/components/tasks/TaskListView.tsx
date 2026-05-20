import { KeyboardEvent, RefObject, useState, useCallback, useMemo } from 'react';
import { TaskAssociationChips } from '@/components/tasks/TaskAssociationChips';
import { Link } from 'react-router-dom';
import { type Task } from '@/hooks/useTasks';
import { useTaskCollaboratorsBatch } from '@/hooks/useTaskCollaborators';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Calendar as CalendarIcon, Sun, Sunrise, ArrowRight, Star, AlertTriangle, Building2, User, Repeat, Columns3, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSourceEmailUrl } from '@/lib/sourceEmailLink';
import { SourceEmailLink } from '@/components/tasks/SourceEmailLink';
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
import { addDays, format, nextMonday } from 'date-fns';
import { useDueBoundaries } from '@/hooks/useDueBoundaries';
import {
  bucketDueDate,
  daysFromToday,
  isOverdue as isOverdueFn,
  normalizeDueDate,
  type DueBoundaries,
} from '@/lib/taskDateGrouping';

/**
 * Optional columns the user can toggle on/off. The 5 leading utility cells
 * (drag, expand, select, complete, star), the task title, and the trailing
 * row-actions cell are always rendered. The default view shows only the
 * key triage columns (priority + status) so the page opens clean; users can
 * reveal more columns from the toolbar.
 */
export const OPTIONAL_TASK_COLUMNS = [
  { id: 'owner',    label: 'Owner',         template: '140px' },
  { id: 'collab',   label: 'Collaborators', template: '60px'  },
  { id: 'deal',     label: 'Deal',          template: '180px' },
  { id: 'due',      label: 'Due date',      template: '120px' },
  { id: 'priority', label: 'Priority',      template: '100px' },
  { id: 'status',   label: 'Status',        template: '120px' },
] as const;

export type TaskColumnId = typeof OPTIONAL_TASK_COLUMNS[number]['id'];

/** Default columns shown to first-time users — fast triage view. */
export const DEFAULT_TASK_COLUMNS: TaskColumnId[] = ['priority', 'status'];

const LEADING_TEMPLATE = '20px 20px 20px 20px 20px minmax(240px,1fr)';
const TRAILING_TEMPLATE = '32px';

/** Build the gridTemplateColumns CSS value from the active column set. */
function buildGridTemplate(visible: Set<TaskColumnId>): string {
  const middle = OPTIONAL_TASK_COLUMNS
    .filter(c => visible.has(c.id))
    .map(c => c.template)
    .join(' ');
  return [LEADING_TEMPLATE, middle, TRAILING_TEMPLATE].filter(Boolean).join(' ');
}

/** Convenience: ordered list of currently visible optional columns. */
function getVisibleColumns(visible: Set<TaskColumnId>) {
  return OPTIONAL_TASK_COLUMNS.filter(c => visible.has(c.id));
}

/** Locked row height — every data row, header row, and add-row uses this. */
const TASK_ROW_MIN_H = 'min-h-[44px]';
/** Pill column constants (kept as className tokens). */
const PRIORITY_PILL_MIN_W = 'min-w-[72px]';
const STATUS_PILL_MIN_W = 'min-w-[96px]';

const STATUS_COLORS: Record<string, { label: string; bg: string; dot: string }> = {
  not_started: { label: 'Not Started', bg: '#7a8194', dot: '#7a8194' },
  in_progress: { label: 'In Progress', bg: '#7eb8f7', dot: '#7eb8f7' },
  blocked: { label: 'Blocked', bg: '#e57373', dot: '#e57373' },
  complete: { label: 'Complete', bg: '#7fc89a', dot: '#7fc89a' },
};

const PRIORITY_PILL: Record<string, { label: string; bg: string }> = {
  urgent: { label: 'Urgent', bg: '#e57373' },
  high: { label: 'High', bg: '#e89b6c' },
  medium: { label: 'Medium', bg: '#d4a45a' },
  low: { label: 'Low', bg: '#7a8194' },
};

export type GroupBy = 'status' | 'time' | 'priority' | 'focus' | 'none';

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
  onSelectAll?: () => void;
  onToggleStar?: (id: string, current: boolean) => void;
  focusedTaskIndex?: number;
  taskNameWarning?: string;
  visibleColumnIds?: TaskColumnId[];
}

function getTimeGroups(tasks: Task[], boundaries: DueBoundaries) {
  const groups = [
    { key: 'overdue', label: '🔴 Overdue', tasks: [] as Task[] },
    { key: 'today', label: '📌 Today', tasks: [] as Task[] },
    { key: 'tomorrow', label: 'Tomorrow', tasks: [] as Task[] },
    { key: 'this_week', label: 'This Week', tasks: [] as Task[] },
    { key: 'upcoming', label: 'Upcoming', tasks: [] as Task[] },
    { key: 'no_date', label: 'No Due Date', tasks: [] as Task[] },
  ];
  tasks.forEach(t => {
    // Completed tasks should never count as overdue regardless of due date.
    if (t.status === 'complete') { groups[4].tasks.push(t); return; }
    const bucket = bucketDueDate(t.due_date, boundaries);
    switch (bucket) {
      case 'overdue':   groups[0].tasks.push(t); break;
      case 'today':     groups[1].tasks.push(t); break;
      case 'tomorrow':  groups[2].tasks.push(t); break;
      case 'this_week': groups[3].tasks.push(t); break;
      case 'upcoming':  groups[4].tasks.push(t); break;
      case 'no_date':   groups[5].tasks.push(t); break;
    }
  });
  return groups.filter(g => g.tasks.length > 0);
}

function getPriorityGroups(tasks: Task[]) {
  const order = ['urgent', 'high', 'medium', 'low'];
  return order.map(key => ({
    key,
    label: PRIORITY_PILL[key]?.label || key,
    tasks: tasks.filter(t => t.priority === key),
  })).filter(g => g.tasks.length > 0);
}

function getFocusGroups(tasks: Task[], boundaries: DueBoundaries) {
  const groups = [
    { key: 'overdue', label: '🔴 Overdue', tasks: [] as Task[] },
    { key: 'due_today', label: '🟠 Due Today', tasks: [] as Task[] },
    { key: 'due_this_week', label: '🔵 Due This Week', tasks: [] as Task[] },
    { key: 'high_priority_not_started', label: '🟣 High Priority — Not Started', tasks: [] as Task[] },
  ];
  tasks.forEach(t => {
    if (t.status === 'complete') return;
    const bucket = bucketDueDate(t.due_date, boundaries);
    let placed = false;
    if (bucket === 'overdue')        { groups[0].tasks.push(t); placed = true; }
    else if (bucket === 'today')     { groups[1].tasks.push(t); placed = true; }
    else if (bucket === 'tomorrow' || bucket === 'this_week') {
      groups[2].tasks.push(t); placed = true;
    }
    if ((t.priority === 'urgent' || t.priority === 'high') && t.status === 'not_started' && !placed) {
      groups[3].tasks.push(t);
    }
  });
  return groups;
}

function fireCelebration() {
  confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, colors: ['#10b981', '#059669', '#34d399'], disableForReducedMotion: true });
}

export function TaskListView({
  tasks, statusGroups, isLoading, isCreating, newTaskTitle, newTaskRef,
  onNewTaskChange, onNewTaskKeyDown, onNewTaskCreate, onCancelCreate,
  onSelectTask, onUpdateTask, onDeleteTask, selectedTaskId,
  groupBy = 'status', selectedTaskIds, onToggleSelect, onSelectAll,
  onToggleStar, focusedTaskIndex, taskNameWarning, visibleColumnIds,
}: TaskListViewProps) {
  const visibleSet = useMemo(
    () => new Set<TaskColumnId>((visibleColumnIds && visibleColumnIds.length > 0
      ? visibleColumnIds
      : DEFAULT_TASK_COLUMNS) as TaskColumnId[]),
    [visibleColumnIds],
  );
  const cols = useMemo(() => getVisibleColumns(visibleSet), [visibleSet]);
  const gridStyle = useMemo<React.CSSProperties>(
    () => ({ gridTemplateColumns: buildGridTemplate(visibleSet) }),
    [visibleSet],
  );
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['complete']));
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const collaboratorsMap = useTaskCollaboratorsBatch(taskIds);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExpanded = useCallback((taskId: string) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => setDragActiveId(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeTask = tasks.find(t => t.id === active.id);
    const overTask = tasks.find(t => t.id === over.id);
    if (!activeTask || !overTask) return;
    if (activeTask.status !== overTask.status) onUpdateTask(activeTask.id, { status: overTask.status } as any);
    onUpdateTask(activeTask.id, { position: overTask.position } as any);
  };

  const handleCompleteWithCelebration = useCallback((taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'complete' ? 'not_started' : 'complete';
    onUpdateTask(taskId, { status: newStatus } as any);
    if (newStatus === 'complete') fireCelebration();
  }, [onUpdateTask]);

  // Shared, timezone-aware day boundaries — single source of truth for
  // overdue / today / tomorrow / this week. Auto-rolls at local midnight.
  // IMPORTANT: This hook must be called unconditionally before any early
  // return below (React's Rules of Hooks).
  const boundaries = useDueBoundaries();
  const todayStr = boundaries.today;

  if (isLoading) {
    return <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  // Pinned overdue section uses the same bucket logic as the groupings so
  // a task can never appear simultaneously as Overdue and within its status group.
  const overdueTasks = tasks.filter(t => isOverdueFn(t.due_date, t.status, boundaries));
  const overdueTaskIds = new Set(overdueTasks.map(task => task.id));

  // Build groups based on groupBy mode. `none` renders a single flat list
  // with no section header, no count chip, no collapse toggle, and no
  // pinned Overdue strip — all tasks flow as one continuous list.
  let groups: { key: string; label: string; tasks: Task[] }[];
  if (groupBy === 'none') groups = [{ key: '__flat__', label: '', tasks }];
  else if (groupBy === 'focus') groups = getFocusGroups(tasks, boundaries);
  else if (groupBy === 'time') groups = getTimeGroups(tasks, boundaries);
  else if (groupBy === 'priority') groups = getPriorityGroups(tasks);
  else groups = statusGroups.map(g => ({
    key: g.key,
    label: g.label,
    tasks: tasks.filter(t => t.status === g.key && !overdueTaskIds.has(t.id)),
  }));

  const allTaskIds = tasks.map(t => t.id);
  const draggedTask = dragActiveId ? tasks.find(t => t.id === dragActiveId) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div>
        {/* Column header — uses the SAME grid template as data rows so
            every header label sits directly above its column. */}
        <div
          className={cn(
            'grid',
            'gap-2 items-center px-4 min-h-[36px]',
            'text-[11px] font-medium uppercase tracking-wide sticky top-0 z-10',
            'bg-background/90 backdrop-blur-md border-b border-border/40 text-muted-foreground',
          )}
          style={gridStyle}
        >
          <div aria-hidden />
          <div aria-hidden />
          <div
            className="cursor-pointer flex items-center justify-center"
            onClick={onSelectAll}
            title="Select all (Ctrl+A)"
          >
            <Checkbox
              checked={selectedTaskIds && selectedTaskIds.size > 0 && selectedTaskIds.size === tasks.length}
              onCheckedChange={() => onSelectAll?.()}
              className="h-3.5 w-3.5"
            />
          </div>
          <div aria-hidden />
          <div aria-hidden />
          <div className="truncate">Task name</div>
          {cols.map(c => (
            <div
              key={c.id}
              className={cn(
                'truncate',
                c.id === 'due' && 'text-right tabular-nums',
                (c.id === 'priority' || c.id === 'status') && 'text-center',
                c.id === 'collab' && 'sr-only',
              )}
            >
              {c.id === 'collab' ? '' : c.label}
            </div>
          ))}
          <div aria-hidden />
        </div>

        {/* Pinned Overdue section */}
        {overdueTasks.length > 0 && groupBy === 'status' && (
          <OverdueSection
            tasks={overdueTasks}
            todayStr={todayStr}
            selectedTaskId={selectedTaskId}
            selectedTaskIds={selectedTaskIds}
            focusedTaskIndex={focusedTaskIndex}
            allTasks={tasks}
            onSelectTask={onSelectTask}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            onToggleComplete={handleCompleteWithCelebration}
            onToggleSelect={onToggleSelect}
            onToggleStar={onToggleStar}
            expandedTaskIds={expandedTaskIds}
            onToggleExpanded={toggleExpanded}
            gridStyle={gridStyle}
            cols={cols}
          />
        )}

        <SortableContext items={allTaskIds} strategy={verticalListSortingStrategy}>
          {groups.map(group => {
            const isCollapsed = collapsedSections.has(group.key);
            const statusConf = STATUS_COLORS[group.key];
            const accentColor = statusConf?.dot || '#8b92a5';
            const isFlat = group.key === '__flat__';

            return (
              <div key={group.key}>
                {/* Section header — chevron and dot align with the data-row
                    chevron/checkbox columns by reusing the row grid template. */}
                {!isFlat && (
                <button
                  onClick={() => toggleSection(group.key)}
                  className={cn(
                    'w-full grid',
                    'gap-2 items-center px-4 min-h-[34px] text-left sticky z-[5] transition-colors',
                    'border-b border-border/30',
                  )}
                  style={{
                    top: 36,
                    borderLeft: `2px solid ${accentColor}`,
                    backgroundColor: `${accentColor}10`,
                    backdropFilter: 'blur(6px)',
                    gridTemplateColumns: gridStyle.gridTemplateColumns,
                  }}
                >
                  <div aria-hidden />
                  <div className="flex items-center justify-center">
                    {isCollapsed
                      ? <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                  </div>
                  <div aria-hidden />
                  <div aria-hidden />
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: '#cfd5e0' }}>
                      {group.label}
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                      style={{ backgroundColor: `${accentColor}1f`, color: accentColor }}
                    >
                      {group.tasks.length}
                    </span>
                    {group.key === 'complete' && (
                      <span className="text-[10px] text-muted-foreground">
                        {isCollapsed ? 'Show completed' : 'Hide completed'}
                      </span>
                    )}
                  </div>
                  {/* Spacer cells for remaining columns to keep grid aligned. */}
                  {cols.map(c => <div key={c.id} aria-hidden />)}
                  <div aria-hidden />
                </button>
                )}

                {(isFlat || !isCollapsed) && (
                  <div className="pt-1.5 pb-1 space-y-1 px-2">
                    {group.tasks.map(task => {
                      const globalIndex = tasks.indexOf(task);
                      return (
                        <SortableTaskRow
                          key={task.id}
                          task={task}
                          todayStr={todayStr}
                          isSelected={selectedTaskId === task.id}
                          isMultiSelected={selectedTaskIds?.has(task.id) || false}
                          isFocused={focusedTaskIndex === globalIndex}
                          onSelect={() => onSelectTask(task.id)}
                          onUpdate={(updates) => onUpdateTask(task.id, updates)}
                          onDelete={() => onDeleteTask(task.id)}
                          onToggleComplete={() => handleCompleteWithCelebration(task.id, task.status)}
                          onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
                          onToggleStar={onToggleStar ? () => onToggleStar(task.id, task.is_starred) : undefined}
                          showSelectCheckbox={(selectedTaskIds?.size || 0) > 0}
                          collaborators={collaboratorsMap.get(task.id)}
                          isExpanded={expandedTaskIds.has(task.id)}
                          onToggleExpanded={() => toggleExpanded(task.id)}
                          onOpenFullDetail={() => onSelectTask(task.id)}
                          gridStyle={gridStyle}
                          cols={cols}
                        />
                      );
                    })}

                    {/* Inline add for first section */}
                    {group === groups[0] && (
                      <>
                        {isCreating ? (
                          <>
                            <div
                              className={cn('grid', TASK_ROW_MIN_H, 'gap-2 items-center px-4 py-1')}
                              style={gridStyle}
                            >
                              {/* 5 leading utility columns */}
                              <div /><div /><div /><div /><div />
                              {/* Title input occupies the task-name column */}
                              <Input
                                ref={newTaskRef as any}
                                value={newTaskTitle}
                                onChange={e => onNewTaskChange(e.target.value)}
                                onKeyDown={onNewTaskKeyDown}
                                placeholder="Task name... (Enter to create, Esc to cancel)"
                                className="h-7 text-sm border-[#3b7eff] bg-[#13181f] text-white"
                                autoFocus
                              />
                              {/* trailing column placeholders */}
                              {cols.map(c => <div key={c.id} />)}
                              <div />
                            </div>
                            {taskNameWarning && <p className="text-[11px] px-4 py-1" style={{ color: '#ff4d4d' }}>{taskNameWarning}</p>}
                          </>
                        ) : (
                          <button onClick={() => onNewTaskChange('')} className="w-full flex items-center gap-2 px-4 py-2 text-xs transition-colors" style={{ color: '#8b92a5' }}>
                            <Plus className="h-3.5 w-3.5" /> Add task
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </SortableContext>

        {tasks.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#1a1f2e' }}>
              <Plus className="h-5 w-5" style={{ color: '#8b92a5' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'white' }}>No tasks yet</p>
            <p className="text-xs mt-1" style={{ color: '#8b92a5' }}>Click "Add Task" to get started</p>
          </div>
        )}
      </div>

      <DragOverlay>
        {draggedTask && (
          <div className="rounded-lg shadow-lg px-4 py-2 text-sm opacity-90" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e', color: 'white' }}>
            {draggedTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Pinned Overdue Section
function OverdueSection({ tasks, todayStr, selectedTaskId, selectedTaskIds, focusedTaskIndex, allTasks, onSelectTask, onUpdateTask, onDeleteTask, onToggleComplete, onToggleSelect, onToggleStar, expandedTaskIds, onToggleExpanded, gridStyle, cols }: {
  tasks: Task[];
  todayStr: string;
  selectedTaskId: string | null;
  selectedTaskIds?: Set<string>;
  focusedTaskIndex?: number;
  allTasks: Task[];
  onSelectTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onToggleComplete: (id: string, status: string) => void;
  onToggleSelect?: (id: string) => void;
  onToggleStar?: (id: string, current: boolean) => void;
  expandedTaskIds?: Set<string>;
  onToggleExpanded?: (taskId: string) => void;
  gridStyle: React.CSSProperties;
  cols: typeof OPTIONAL_TASK_COLUMNS[number][];
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'w-full grid',
          'gap-2 items-center px-4 min-h-[34px] text-left sticky z-[5] transition-colors',
          'border-b border-border/30',
        )}
        style={{
          top: 36,
          borderLeft: '2px solid #e57373',
          backgroundColor: 'rgba(229,115,115,0.08)',
          backdropFilter: 'blur(6px)',
          gridTemplateColumns: gridStyle.gridTemplateColumns,
        }}
      >
        <div aria-hidden />
        <div className="flex items-center justify-center">
          {collapsed
            ? <ChevronRight className="h-3 w-3" style={{ color: '#e57373' }} />
            : <ChevronDown className="h-3 w-3" style={{ color: '#e57373' }} />}
        </div>
        <div className="flex items-center justify-center">
          <AlertTriangle className="h-3 w-3" style={{ color: '#e57373' }} />
        </div>
        <div aria-hidden />
        <div aria-hidden />
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: '#e57373' }}>
            Overdue
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: 'rgba(229,115,115,0.18)', color: '#e57373' }}
          >
            {tasks.length}
          </span>
        </div>
        {cols.map(c => <div key={c.id} aria-hidden />)}
        <div aria-hidden />
      </button>
      {!collapsed && tasks.map(task => {
        const globalIndex = allTasks.indexOf(task);
        return (
          <SortableTaskRow
            key={`overdue-${task.id}`}
            task={task}
            todayStr={todayStr}
            isSelected={selectedTaskId === task.id}
            isMultiSelected={selectedTaskIds?.has(task.id) || false}
            isFocused={focusedTaskIndex === globalIndex}
            onSelect={() => onSelectTask(task.id)}
            onUpdate={(updates) => onUpdateTask(task.id, updates)}
            onDelete={() => onDeleteTask(task.id)}
            onToggleComplete={() => onToggleComplete(task.id, task.status)}
            onToggleSelect={onToggleSelect ? () => onToggleSelect(task.id) : undefined}
            onToggleStar={onToggleStar ? () => onToggleStar(task.id, task.is_starred) : undefined}
            showSelectCheckbox={(selectedTaskIds?.size || 0) > 0}
            isExpanded={expandedTaskIds?.has(task.id)}
            onToggleExpanded={onToggleExpanded ? () => onToggleExpanded(task.id) : undefined}
            onOpenFullDetail={() => onSelectTask(task.id)}
            gridStyle={gridStyle}
            cols={cols}
          />
        );
      })}
    </div>
  );
}

// Quick date shortcuts
function QuickDatePicker({ value, onChange, todayStr }: { value: string | null; onChange: (v: string | null) => void; todayStr: string }) {
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextMon = format(nextMonday(new Date()), 'yyyy-MM-dd');

  const getRelativeLabel = () => {
    const due = normalizeDueDate(value);
    if (!due) return null;
    const diff = daysFromToday(due, { today: todayStr, tomorrow: todayStr, weekEnd: todayStr });
    if (diff === null) return null;
    if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: '#ff4d4d', bold: true };
    if (diff === 0) return { text: 'Due today', color: '#f59e0b', bold: true };
    return { text: `Due in ${diff}d`, color: '#8b92a5', bold: false };
  };

  const rel = getRelativeLabel();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs hover:bg-[#1e2433] rounded px-1.5 py-0.5 transition-colors">
          {rel ? (
            <span style={{ color: rel.color, fontWeight: rel.bold ? 600 : 400 }}>
              {rel.text}
            </span>
          ) : (
            <span style={{ color: '#8b92a5' }}>No date</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1" align="start">
        <div className="space-y-0.5">
          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors" onClick={() => onChange(todayStr)}>
            <Sun className="h-3 w-3 text-orange-500" /> Today
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors" onClick={() => onChange(tomorrow)}>
            <Sunrise className="h-3 w-3 text-amber-500" /> Tomorrow
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors" onClick={() => onChange(format(addDays(new Date(), 7), 'yyyy-MM-dd'))}>
            <CalendarIcon className="h-3 w-3 text-primary" /> +1 Week
          </button>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors" onClick={() => onChange(nextMon)}>
            <ArrowRight className="h-3 w-3 text-primary" /> Next Monday
          </button>
          <div className="border-t my-1" />
          <Input type="date" value={value || ''} onChange={e => onChange(e.target.value || null)} className="h-7 text-xs" />
          {value && (
            <>
              <div className="border-t my-1" />
              <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-destructive transition-colors" onClick={() => onChange(null)}>
                Remove date
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Sortable task row
function SortableTaskRow({ task, todayStr, isSelected, isMultiSelected, isFocused, onSelect, onUpdate, onDelete, onToggleComplete, onToggleSelect, onToggleStar, showSelectCheckbox, collaborators, isExpanded, onToggleExpanded, onOpenFullDetail, gridStyle, cols }: {
  task: Task;
  todayStr: string;
  isSelected: boolean;
  isMultiSelected: boolean;
  isFocused?: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  onToggleSelect?: () => void;
  onToggleStar?: () => void;
  showSelectCheckbox?: boolean;
  collaborators?: { user_id: string; display_name: string; avatar_url: string | null }[];
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onOpenFullDetail?: () => void;
  gridStyle: React.CSSProperties;
  cols: typeof OPTIONAL_TASK_COLUMNS[number][];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    gridTemplateColumns: gridStyle.gridTemplateColumns,
  };
  const visibleSet = useMemo(() => new Set(cols.map(c => c.id)), [cols]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const isComplete = task.status === 'complete';

  const handleSaveTitle = () => {
    if (titleValue.trim() && titleValue !== task.title) onUpdate({ title: titleValue.trim() } as any);
    setEditingTitle(false);
  };

  const priorityPill = PRIORITY_PILL[task.priority] || PRIORITY_PILL.medium;
  const statusConf = STATUS_COLORS[task.status] || STATUS_COLORS.not_started;

  // Blocker note (stored as any since it's a new column)
  const blockerNote = (task as any).blocker_note;

  // Source email deep-link (set when the task was created from an email
  // via the right-click → Create Task flow). We surface it as a small
  // inline icon link so users can jump back to the originating message.
  const sourceEmailUrl = buildSourceEmailUrl({
    messageId: (task as any).source_email_message_id,
    threadId: (task as any).source_email_thread_id,
  });
  const sourceEmailTitle =
    (task as any).source_email_subject ||
    (task as any).source_email_from ||
    'Open source email';

  // Build the sub-label string shown under the title (single line, ellipsis).
  const subLabel: { icon: typeof Building2 | typeof User; text: string; href: string } | null =
    task.deal_id && task.deal?.company
      ? { icon: Building2, text: task.deal.company, href: `/deal/${task.deal_id}` }
      : task.contact_id && (task as any).contact?.full_name
        ? { icon: User, text: (task as any).contact.full_name, href: `/contacts/${task.contact_id}` }
        : task.crm_company_id && (task as any).crm_company?.name
          ? { icon: Building2, text: (task as any).crm_company.name, href: `/crm-companies/${task.crm_company_id}` }
          : null;

  return (
    <>
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      tabIndex={-1}
      className={cn(
        // Locked-height glass row — single centerline alignment across all
        // cells regardless of which sub-label / pill content the row holds.
        'grid',
        TASK_ROW_MIN_H,
        'gap-2 items-center px-3 py-1 cursor-pointer group rounded-lg border transition-all duration-150',
        'bg-white/[0.025] dark:bg-white/[0.025] border-white/[0.06] backdrop-blur-md',
        'hover:bg-white/[0.045] hover:border-white/[0.10]',
        'shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]',
        isSelected && '!bg-[rgba(126,184,247,0.09)] !border-[rgba(126,184,247,0.25)]',
        isMultiSelected && '!bg-[rgba(126,184,247,0.06)] !border-[rgba(126,184,247,0.2)]',
        isFocused && 'ring-1 ring-[rgba(126,184,247,0.35)]',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(126,184,247,0.45)]',
        isDragging && 'z-50',
      )}
      style={style}
      onClick={onSelect}
      // Capture-phase selection: many inline cells call e.stopPropagation()
      // on the bubble phase so popovers/inputs don't accidentally trigger
      // selection. Capture runs first, so selecting here guarantees the
      // row always populates the right-panel details — except when the
      // user is interacting with a real text input.
      onClickCapture={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('input, textarea, [contenteditable="true"]')) return;
        onSelect();
      }}
    >
      {/* Drag handle */}
      <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
        <GripVertical className="h-3 w-3" style={{ color: '#7a8194' }} />
      </div>

      {/* Expand toggle */}
      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onToggleExpanded?.()}
          className="h-4 w-4 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          aria-expanded={!!isExpanded}
          aria-label={isExpanded ? 'Hide details' : 'Show details'}
          title={isExpanded ? 'Hide details' : 'Show details'}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" style={{ color: '#cfe3ff' }} />
          ) : (
            <ChevronRight className="h-3 w-3" style={{ color: '#7a8194' }} />
          )}
        </button>
      </div>

      {/* Multi-select */}
      <div className={cn('flex items-center justify-center transition-opacity', showSelectCheckbox ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')} onClick={e => e.stopPropagation()}>
        <Checkbox checked={isMultiSelected} onCheckedChange={() => onToggleSelect?.()} className="h-4 w-4" />
      </div>

      {/* Complete checkbox */}
      <div className="flex items-center justify-center">
        <Checkbox checked={isComplete} onCheckedChange={() => onToggleComplete()} onClick={e => e.stopPropagation()}
          className={cn('h-4 w-4 rounded-full transition-all', isComplete && 'bg-[#7fc89a] border-[#7fc89a]')} />
      </div>

      {/* Star */}
      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <button className={cn('transition-colors', task.is_starred ? 'text-amber-500' : 'text-transparent group-hover:text-[#8b92a5]/40 hover:!text-amber-500')} onClick={() => onToggleStar?.()} title="Star task">
          <Star className={cn('h-3.5 w-3.5', task.is_starred && 'fill-amber-500')} />
        </button>
      </div>

      {/* Title + sub-label stack — vertically centered to row centerline */}
      <div className="min-w-0 overflow-hidden flex flex-col justify-center" onClick={e => e.stopPropagation()}>
        {editingTitle ? (
          <Input value={titleValue} onChange={e => setTitleValue(e.target.value)} onBlur={handleSaveTitle}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false); } }}
            className="h-7 text-sm bg-[#13181f] text-white" autoFocus />
        ) : (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                title={task.title}
                className={cn(
                  'text-[13.5px] font-semibold truncate cursor-text hover:bg-[rgba(255,255,255,0.04)] rounded px-1 -mx-1 py-0.5 transition-colors leading-tight',
                  isComplete && 'line-through',
                )}
                style={{ color: isComplete ? '#7a8194' : '#eef1f6', letterSpacing: '-0.005em' }}
                onDoubleClick={() => { setTitleValue(task.title); setEditingTitle(true); }}
                onClick={onSelect}
              >
                {task.title}
              </span>
              {sourceEmailUrl && (
                <SourceEmailLink
                  href={sourceEmailUrl}
                  subject={(task as any).source_email_subject}
                  from={(task as any).source_email_from}
                  receivedAt={(task as any).source_email_received_at}
                  ariaLabel="Open source email"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 text-primary hover:bg-primary/10 transition-colors"
                >
                  <Mail className="h-2.5 w-2.5" />
                  Email
                </SourceEmailLink>
              )}
              {(task.recurrence_rule || (task as any).is_recurring) && (() => {
              const rule: string | null = task.recurrence_rule;
              const seriesEnd = (task as any).recurrence_end_date as string | null | undefined;
              const isPaused = !!seriesEnd && seriesEnd <= todayStr;
              const label = (() => {
                if (!rule) return 'Recurring';
                if (rule.startsWith('every:')) {
                  const [, n, unit] = rule.split(':');
                  const num = parseInt(n, 10);
                  if (!num || !unit) return rule;
                  return `Every ${num} ${num === 1 ? unit.replace(/s$/, '') : unit}`;
                }
                switch (rule) {
                  case 'daily': return 'Daily';
                  case 'weekdays': return 'Weekdays';
                  case 'weekly': return 'Weekly';
                  case 'biweekly': return 'Every 2 weeks';
                  case 'monthly': return 'Monthly';
                  case 'yearly': return 'Yearly';
                  default: return rule;
                }
              })();
              return (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                  style={{
                    backgroundColor: isPaused ? 'rgba(245,158,11,0.12)' : 'rgba(59,126,255,0.12)',
                    color: isPaused ? '#f59e0b' : '#7eb8f7',
                  }}
                  title={isPaused ? `${label} · Paused` : `Recurring: ${label}`}
                  onClick={e => e.stopPropagation()}
                >
                  <Repeat className="h-2.5 w-2.5" />
                  {label}{isPaused ? ' · Paused' : ''}
                </span>
              );
              })()}
            </div>
            {/* Single-line, ellipsis-clipped sub-label. Uses the uniform
                "text-xs text-muted-foreground" treatment per spec. */}
            {(subLabel || (task.status === 'blocked' && blockerNote)) && (
              <div className="min-w-0 truncate">
                {subLabel ? (
                  <Link
                    to={subLabel.href}
                    title={subLabel.text}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    <subLabel.icon className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{subLabel.text}</span>
                  </Link>
                ) : (
                  <span
                    className="text-xs italic truncate block"
                    style={{ color: '#e57373' }}
                    title={blockerNote}
                  >
                    {blockerNote}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Owner */}
      {visibleSet.has('owner') && (
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        {task.assignee_profile ? (
          <>
            <Avatar className="h-4 w-4">
              {task.assignee_profile.avatar_url && <AvatarImage src={task.assignee_profile.avatar_url} />}
              <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                {task.assignee_profile.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] truncate" style={{ color: '#7a8194' }} title={task.assignee_profile.display_name || ''}>
              {task.assignee_profile.display_name?.split(' ')[0]}
            </span>
          </>
        ) : (
          <span className="text-[11px]" style={{ color: '#5b6173' }}>—</span>
        )}
      </div>
      )}

      {/* Collaborators */}
      {visibleSet.has('collab') && (
      <div className="flex items-center" onClick={e => e.stopPropagation()}>
        {collaborators && collaborators.length > 0 ? (
          <div className="flex items-center -space-x-1.5">
            {collaborators.slice(0, 3).map(c => (
              <Avatar key={c.user_id} className="h-4 w-4 ring-1 ring-[#13181f]">
                {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                <AvatarFallback className="text-[6px]" style={{ backgroundColor: '#6b7280', color: 'white' }}>
                  {c.display_name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {collaborators.length > 3 && (
              <span className="text-[9px] ml-1" style={{ color: '#8b92a5' }}>+{collaborators.length - 3}</span>
            )}
          </div>
        ) : null}
      </div>
      )}


      {/* Deal cell — single-line ellipsis with hover tooltip. */}
      {visibleSet.has('deal') && (
      <div className="min-w-0 overflow-hidden flex items-center" onClick={e => e.stopPropagation()}>
        <TaskAssociationChips task={task} />
      </div>
      )}

      {/* Due date — right-aligned, tabular-nums for stable column width */}
      {visibleSet.has('due') && (
      <div className="flex items-center justify-end tabular-nums" onClick={e => e.stopPropagation()}>
        <QuickDatePicker value={task.due_date} onChange={v => onUpdate({ due_date: v } as any)} todayStr={todayStr} />
      </div>
      )}

      {/* Priority pill */}
      {visibleSet.has('priority') && (
      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <Select value={task.priority} onValueChange={v => onUpdate({ priority: v } as any)}>
          <SelectTrigger className={cn('h-6 text-[10px] border-none bg-transparent px-0 focus:ring-0 [&>svg]:hidden hover:bg-[rgba(255,255,255,0.04)] rounded justify-center', PRIORITY_PILL_MIN_W)}>
            <span
              className={cn('inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-medium text-center', PRIORITY_PILL_MIN_W)}
              style={{ backgroundColor: `${priorityPill.bg}1f`, color: priorityPill.bg, border: `1px solid ${priorityPill.bg}33` }}
            >
              {priorityPill.label}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgent" className="text-xs">Urgent</SelectItem>
            <SelectItem value="high" className="text-xs">High</SelectItem>
            <SelectItem value="medium" className="text-xs">Medium</SelectItem>
            <SelectItem value="low" className="text-xs">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Status pill */}
      {visibleSet.has('status') && (
      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <Select value={task.status} onValueChange={v => { onUpdate({ status: v } as any); if (v === 'complete') fireCelebration(); }}>
          <SelectTrigger className={cn('h-6 text-[10px] border-none bg-transparent px-0 [&>svg]:hidden hover:bg-[rgba(255,255,255,0.04)] rounded justify-center', STATUS_PILL_MIN_W)}>
            <span
              className={cn('inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium text-center', STATUS_PILL_MIN_W)}
              style={{ backgroundColor: `${statusConf.bg}1a`, color: statusConf.bg, border: `1px solid ${statusConf.bg}2e` }}
            >
              <span className="h-1 w-1 rounded-full" style={{ backgroundColor: statusConf.bg }} />
              {statusConf.label}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
            <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
            <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
            <SelectItem value="complete" className="text-xs">Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDelete} className="text-destructive text-xs">
              <Trash2 className="h-3 w-3 mr-2" /> Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {isExpanded && (
      <ExpandedTaskDetails
        task={task}
        onUpdate={onUpdate}
        onOpenFullDetail={onOpenFullDetail || onSelect}
      />
    )}
    </>
  );
}
