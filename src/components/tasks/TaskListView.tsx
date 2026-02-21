import { KeyboardEvent, RefObject } from 'react';
import { type Task } from '@/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus, MoreHorizontal, Trash2, Calendar as CalendarIcon, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';

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
}

export function TaskListView({
  tasks, statusGroups, isLoading, isCreating, newTaskTitle, newTaskRef,
  onNewTaskChange, onNewTaskKeyDown, onNewTaskCreate, onCancelCreate,
  onSelectTask, onUpdateTask, onDeleteTask, selectedTaskId,
}: TaskListViewProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['complete']));

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y">
      {/* Column header */}
      <div className="grid grid-cols-[auto_1fr_120px_100px_100px_40px] gap-2 items-center px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/30 sticky top-0 z-10">
        <div className="w-6" />
        <div>Task name</div>
        <div>Due date</div>
        <div>Priority</div>
        <div>Status</div>
        <div />
      </div>

      {statusGroups.map(group => {
        const groupTasks = tasks.filter(t => t.status === group.key);
        const isCollapsed = collapsedSections.has(group.key);
        if (groupTasks.length === 0 && group.key !== 'not_started') return null;

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
              <div className={cn('h-2 w-2 rounded-full', STATUS_CONFIG[group.key]?.color)} />
              <span className="text-xs font-semibold">{group.label}</span>
              <span className="text-[10px] text-muted-foreground ml-1">({groupTasks.length})</span>
            </button>

            {!isCollapsed && (
              <>
                {groupTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onSelect={() => onSelectTask(task.id)}
                    onUpdate={(updates) => onUpdateTask(task.id, updates)}
                    onDelete={() => onDeleteTask(task.id)}
                  />
                ))}

                {/* Inline add for "Not Started" section */}
                {group.key === 'not_started' && (
                  <>
                    {isCreating ? (
                      <div className="grid grid-cols-[auto_1fr_120px_100px_100px_40px] gap-2 items-center px-4 py-1.5">
                        <div className="w-6" />
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
                        onClick={() => {
                          onNewTaskChange('');
                          // Trigger isCreating via parent
                        }}
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
  );
}

function TaskRow({ task, isSelected, onSelect, onUpdate, onDelete }: {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const isComplete = task.status === 'complete';
  const priorityConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const initials = task.assignee_profile?.display_name?.slice(0, 2).toUpperCase() || '??';

  const handleToggleComplete = () => {
    onUpdate({ status: isComplete ? 'not_started' : 'complete' } as any);
  };

  const formattedDue = task.due_date
    ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const isOverdue = task.due_date && !isComplete && new Date(task.due_date) < new Date(new Date().toISOString().split('T')[0]);

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_120px_100px_100px_40px] gap-2 items-center px-4 py-1.5 hover:bg-muted/30 cursor-pointer transition-colors group',
        isSelected && 'bg-primary/5 border-r-2 border-r-primary'
      )}
      onClick={onSelect}
    >
      <Checkbox
        checked={isComplete}
        onCheckedChange={() => handleToggleComplete()}
        onClick={e => e.stopPropagation()}
        className="h-4 w-4"
      />
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn(
          'text-sm truncate',
          isComplete && 'line-through text-muted-foreground'
        )}>
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {formattedDue ? (
          <span className={cn(
            'text-xs',
            isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}>
            {formattedDue}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">No date</span>
        )}
      </div>
      <div>
        <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', priorityConf.className)}>
          {priorityConf.label}
        </Badge>
      </div>
      <div onClick={e => e.stopPropagation()}>
        <Select
          value={task.status}
          onValueChange={v => onUpdate({ status: v } as any)}
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
