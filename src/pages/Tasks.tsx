import { useState, useRef, KeyboardEvent, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useMyTasks, type Task } from '@/hooks/useTasks';
import { TaskListView, type GroupBy } from '@/components/tasks/TaskListView';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { TaskReportingView } from '@/components/tasks/TaskReportingView';
import { useTaskNotifications } from '@/hooks/useTaskNotifications';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ListTodo, LayoutGrid, Calendar, GanttChart, Plus, Search, Filter,
  SlidersHorizontal, Group, Trash2, CheckSquare, BarChart3, Bell,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ViewMode = 'list' | 'board' | 'calendar' | 'reporting';
type FilterStatus = 'all' | 'not_started' | 'in_progress' | 'blocked' | 'complete';
type SortBy = 'due_date' | 'priority' | 'created_at' | 'title';

export default function Tasks() {
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useMyTasks();
  const { overdueCount, dueTodayCount } = useTaskNotifications();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortBy>('due_date');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const newTaskRef = useRef<HTMLInputElement>(null);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  // Filter and sort
  const filtered = tasks
    .filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'due_date':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        case 'priority': {
          const order = { urgent: 0, high: 1, medium: 2, low: 3 };
          return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
        }
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) return;
    createTask.mutate({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
    setTimeout(() => newTaskRef.current?.focus(), 50);
  };

  const handleNewTaskKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateTask();
    }
    if (e.key === 'Escape') {
      setIsCreating(false);
      setNewTaskTitle('');
    }
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkAction = (action: 'complete' | 'delete') => {
    selectedTaskIds.forEach(id => {
      if (action === 'complete') updateTask.mutate({ id, status: 'complete' });
      if (action === 'delete') deleteTask.mutate(id);
    });
    setSelectedTaskIds(new Set());
  };

  const statusGroups = [
    { key: 'not_started', label: 'Not Started' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'complete', label: 'Complete' },
  ];

  return (
    <>
      <Helmet><title>Tasks | 5thLine</title></Helmet>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">My Tasks</h1>
            <span className="text-sm text-muted-foreground">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''}
            </span>
            {(overdueCount > 0 || dueTodayCount > 0) && (
              <div className="flex items-center gap-1.5">
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-5 px-1.5 gap-1">
                    <Bell className="h-2.5 w-2.5" /> {overdueCount} overdue
                  </Badge>
                )}
                {dueTodayCount > 0 && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 border-amber-500/30 text-amber-600">
                    {dueTodayCount} due today
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="list" className="text-xs gap-1 px-2 h-7">
                  <ListTodo className="h-3.5 w-3.5" /> List
                </TabsTrigger>
                <TabsTrigger value="board" className="text-xs gap-1 px-2 h-7">
                  <LayoutGrid className="h-3.5 w-3.5" /> Board
                </TabsTrigger>
                <TabsTrigger value="calendar" className="text-xs gap-1 px-2 h-7">
                  <Calendar className="h-3.5 w-3.5" /> Calendar
                </TabsTrigger>
                <TabsTrigger value="reporting" className="text-xs gap-1 px-2 h-7">
                  <BarChart3 className="h-3.5 w-3.5" /> Reports
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-2 border-b bg-muted/20">
          <div className="relative flex-1 max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="h-8 text-xs pl-8"
            />
          </div>
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <Filter className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All statuses</SelectItem>
              <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
              <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
              <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
              <SelectItem value="complete" className="text-xs">Complete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SlidersHorizontal className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_date" className="text-xs">Due date</SelectItem>
              <SelectItem value="priority" className="text-xs">Priority</SelectItem>
              <SelectItem value="created_at" className="text-xs">Created</SelectItem>
              <SelectItem value="title" className="text-xs">Name</SelectItem>
            </SelectContent>
          </Select>

          {/* Group by */}
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Group className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status" className="text-xs">By Status</SelectItem>
              <SelectItem value="time" className="text-xs">By Due Date</SelectItem>
              <SelectItem value="priority" className="text-xs">By Priority</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {/* Bulk actions */}
          {selectedTaskIds.size > 0 && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-xs text-muted-foreground">{selectedTaskIds.size} selected</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => handleBulkAction('complete')}
              >
                <CheckSquare className="h-3 w-3" /> Complete
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive"
                onClick={() => handleBulkAction('delete')}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedTaskIds(new Set())}
              >
                Clear
              </Button>
            </div>
          )}

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => { setIsCreating(true); setTimeout(() => newTaskRef.current?.focus(), 50); }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </Button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {viewMode === 'list' && (
              <TaskListView
                tasks={filtered}
                statusGroups={statusGroups}
                isLoading={isLoading}
                isCreating={isCreating}
                newTaskTitle={newTaskTitle}
                newTaskRef={newTaskRef}
                onNewTaskChange={setNewTaskTitle}
                onNewTaskKeyDown={handleNewTaskKeyDown}
                onNewTaskCreate={handleCreateTask}
                onCancelCreate={() => { setIsCreating(false); setNewTaskTitle(''); }}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={(id, updates) => updateTask.mutate({ id, ...updates })}
                onDeleteTask={id => deleteTask.mutate(id)}
                selectedTaskId={selectedTaskId}
                groupBy={groupBy}
                selectedTaskIds={selectedTaskIds}
                onToggleSelect={handleToggleSelect}
              />
            )}
            {viewMode === 'board' && (
              <TaskBoardView
                tasks={filtered}
                statusGroups={statusGroups}
                isCreating={isCreating}
                newTaskTitle={newTaskTitle}
                newTaskRef={newTaskRef}
                onNewTaskChange={setNewTaskTitle}
                onNewTaskKeyDown={handleNewTaskKeyDown}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={(id, updates) => updateTask.mutate({ id, ...updates })}
                selectedTaskId={selectedTaskId}
              />
            )}
            {viewMode === 'calendar' && (
              <TaskCalendarView
                tasks={filtered}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={(id, updates) => updateTask.mutate({ id, ...updates })}
                selectedTaskId={selectedTaskId}
              />
            )}
            {viewMode === 'reporting' && (
              <TaskReportingView tasks={tasks} />
            )}
          </div>

          {selectedTask && (
            <TaskDetailDrawer
              task={selectedTask}
              onClose={() => setSelectedTaskId(null)}
              onUpdate={(updates) => updateTask.mutate({ id: selectedTask.id, ...updates })}
              onDelete={() => { deleteTask.mutate(selectedTask.id); setSelectedTaskId(null); }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// Board view component (inline)
function TaskBoardView({ tasks, statusGroups, isCreating, newTaskTitle, newTaskRef, onNewTaskChange, onNewTaskKeyDown, onSelectTask, onUpdateTask, selectedTaskId }: {
  tasks: Task[];
  statusGroups: { key: string; label: string }[];
  isCreating: boolean;
  newTaskTitle: string;
  newTaskRef: React.RefObject<HTMLInputElement>;
  onNewTaskChange: (v: string) => void;
  onNewTaskKeyDown: (e: KeyboardEvent) => void;
  onSelectTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  selectedTaskId: string | null;
}) {
  const priorityColors: Record<string, string> = {
    urgent: 'border-l-destructive',
    high: 'border-l-orange-500',
    medium: 'border-l-primary',
    low: 'border-l-muted-foreground/30',
  };

  return (
    <div className="flex gap-4 p-4 overflow-x-auto h-full">
      {statusGroups.map(group => {
        const groupTasks = tasks.filter(t => t.status === group.key);
        return (
          <div key={group.key} className="flex flex-col min-w-[280px] w-[280px] bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between px-3 py-2.5 border-b">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{group.label}</span>
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                  {groupTasks.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
              {groupTasks.map(task => (
                <div
                  key={task.id}
                  className={`rounded-md border bg-card p-3 cursor-pointer hover:shadow-sm transition-all border-l-[3px] ${priorityColors[task.priority] || ''} ${
                    selectedTaskId === task.id ? 'ring-1 ring-primary' : ''
                  }`}
                  onClick={() => onSelectTask(task.id)}
                >
                  <p className={`text-sm font-medium ${task.status === 'complete' ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {task.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {task.assignee_profile && (
                      <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[100px]">
                        {task.assignee_profile.display_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
