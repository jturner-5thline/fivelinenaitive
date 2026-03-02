import { useState, useRef, KeyboardEvent, useCallback, useMemo, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useMyTasks, type Task, type TaskOwnerFilter } from '@/hooks/useTasks';
import { TaskListView, type GroupBy } from '@/components/tasks/TaskListView';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { TaskReportingView } from '@/components/tasks/TaskReportingView';
import { TaskBulkActionBar } from '@/components/tasks/TaskBulkActionBar';
import { useTaskNotifications } from '@/hooks/useTaskNotifications';
import { useTaskSavedViews, type TaskSavedView } from '@/hooks/useTaskSavedViews';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useTaskTemplates } from '@/hooks/useTaskTemplates';
import { useTaskLabels } from '@/hooks/useTaskLabels';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  ListTodo, LayoutGrid, Calendar, Plus, Search, Filter,
  SlidersHorizontal, Group, Trash2, BarChart3, Bell,
  Bookmark, BookmarkPlus, Download, FileDown, Star, MoreVertical,
  Zap, Tag, ClipboardList, GripVertical, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { isToday, isPast, addDays } from 'date-fns';
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, TouchSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent, DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type ViewMode = 'list' | 'board' | 'calendar' | 'reporting' | 'focus';
type FilterStatus = 'all' | 'incomplete' | 'not_started' | 'in_progress' | 'blocked' | 'complete';
type SortBy = 'due_date' | 'priority' | 'created_at' | 'title';

export default function Tasks() {
  const [ownerFilter, setOwnerFilter] = useState<TaskOwnerFilter>('mine');
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useMyTasks(ownerFilter);
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const { notifications } = useTaskNotifications();
  const { savedViews, saveView, deleteView } = useTaskSavedViews();
  const { templates, applyTemplate } = useTaskTemplates();
  const teamMembers = useTeamMembers();
  const { labels, createLabel } = useTaskLabels();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortBy>('due_date');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366f1');
  const newTaskRef = useRef<HTMLInputElement>(null);
  const [focusedTaskIndex, setFocusedTaskIndex] = useState<number>(-1);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  // Focus view: today's tasks + overdue + high priority
  const focusTasks = tasks.filter(t => {
    if (t.status === 'complete') return false;
    if (t.due_date && isToday(new Date(t.due_date + 'T00:00:00'))) return true;
    if (t.due_date && isPast(new Date(t.due_date + 'T23:59:59')) && !isToday(new Date(t.due_date + 'T00:00:00'))) return true;
    if (t.priority === 'urgent' || t.priority === 'high') return true;
    return false;
  });

  // Filter and sort (starred items float to top)
  const filtered = (viewMode === 'focus' ? focusTasks : tasks)
    .filter(t => {
      if (filterStatus === 'incomplete' && t.status === 'complete') return false;
      if (filterStatus !== 'all' && filterStatus !== 'incomplete' && t.status !== filterStatus) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      // Starred tasks always first
      if (a.is_starred && !b.is_starred) return -1;
      if (!a.is_starred && b.is_starred) return 1;

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
    if (e.key === 'Enter') { e.preventDefault(); handleCreateTask(); }
    if (e.key === 'Escape') { setIsCreating(false); setNewTaskTitle(''); }
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkUpdate = useCallback((updates: Record<string, any>) => {
    const promises = Array.from(selectedTaskIds).map(id =>
      updateTask.mutateAsync({ id, ...updates })
    );
    Promise.all(promises).then(() => {
      toast.success(`Updated ${selectedTaskIds.size} task(s)`);
      setSelectedTaskIds(new Set());
    });
  }, [selectedTaskIds, updateTask]);

  const handleBulkDelete = useCallback(() => {
    const count = selectedTaskIds.size;
    const ids = Array.from(selectedTaskIds);
    const promises = ids.map(id => deleteTask.mutateAsync(id));
    Promise.all(promises).then(() => {
      setSelectedTaskIds(new Set());
      toast.success(`Deleted ${count} task(s)`, {
        action: { label: 'Undo is not available for bulk delete', onClick: () => {} },
      });
    });
  }, [selectedTaskIds, deleteTask]);

  // Undo-aware single task complete
  const handleCompleteWithUndo = useCallback((taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'complete' ? 'not_started' : 'complete';
    updateTask.mutate({ id: taskId, status: newStatus } as any);
    if (newStatus === 'complete') {
      toast.success('Task completed! 🎉', {
        action: {
          label: 'Undo',
          onClick: () => updateTask.mutate({ id: taskId, status: currentStatus } as any),
        },
        duration: 5000,
      });
    }
  }, [updateTask]);

  // Undo-aware single task delete
  const handleDeleteWithUndo = useCallback((taskId: string) => {
    // We can't truly undo a delete, but we can archive instead
    deleteTask.mutate(taskId);
    toast.success('Task deleted');
  }, [deleteTask]);

  // Toggle star
  const handleToggleStar = useCallback((taskId: string, currentlyStarred: boolean) => {
    updateTask.mutate({ id: taskId, is_starred: !currentlyStarred } as any);
  }, [updateTask]);

  // Select all visible tasks
  const handleSelectAll = useCallback(() => {
    if (selectedTaskIds.size === filtered.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filtered.map(t => t.id)));
    }
  }, [filtered, selectedTaskIds]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (selectedTaskId) return; // Don't interfere with detail drawer

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setFocusedTaskIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setFocusedTaskIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedTaskIndex >= 0) {
        e.preventDefault();
        const task = filtered[focusedTaskIndex];
        if (task) setSelectedTaskId(task.id);
      } else if (e.key === ' ' && focusedTaskIndex >= 0) {
        e.preventDefault();
        const task = filtered[focusedTaskIndex];
        if (task) handleCompleteWithUndo(task.id, task.status);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && focusedTaskIndex >= 0) {
        e.preventDefault();
        const task = filtered[focusedTaskIndex];
        if (task) handleDeleteWithUndo(task.id);
      } else if (e.key === 'x' && focusedTaskIndex >= 0) {
        e.preventDefault();
        const task = filtered[focusedTaskIndex];
        if (task) handleToggleSelect(task.id);
      } else if (e.key === 's' && focusedTaskIndex >= 0) {
        e.preventDefault();
        const task = filtered[focusedTaskIndex];
        if (task) handleToggleStar(task.id, task.is_starred);
      } else if (e.key === 'Escape') {
        setSelectedTaskIds(new Set());
        setFocusedTaskIndex(-1);
      } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSelectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, focusedTaskIndex, selectedTaskId, handleCompleteWithUndo, handleDeleteWithUndo, handleToggleSelect, handleToggleStar, handleSelectAll]);

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    saveView.mutate({
      name: newViewName.trim(),
      view_config: { viewMode, filterStatus, sortBy, groupBy, search },
    });
    setNewViewName('');
    setShowSaveViewDialog(false);
  };

  const handleLoadView = (view: TaskSavedView) => {
    const c = view.view_config;
    if (c.viewMode) setViewMode(c.viewMode as ViewMode);
    if (c.filterStatus) setFilterStatus(c.filterStatus as FilterStatus);
    if (c.sortBy) setSortBy(c.sortBy as SortBy);
    if (c.groupBy) setGroupBy(c.groupBy as GroupBy);
    if (c.search !== undefined) setSearch(c.search);
    toast.success(`Loaded view: ${view.name}`);
  };

  const handleExportCSV = () => {
    const headers = ['Title', 'Status', 'Priority', 'Due Date', 'Assignee', 'Created'];
    const rows = filtered.map(t => [
      t.title,
      t.status,
      t.priority,
      t.due_date || '',
      t.assignee_profile?.display_name || '',
      t.created_at.split('T')[0],
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Tasks exported');
  };

  const handleCreateLabel = () => {
    if (!newLabelName.trim()) return;
    createLabel.mutate({ name: newLabelName.trim(), color: newLabelColor });
    setNewLabelName('');
  };

  const [customSections, setCustomSections] = useState<{ key: string; label: string }[]>([]);

  const statusGroups = [
    { key: 'not_started', label: 'Not Started' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'complete', label: 'Complete' },
  ];

  const allBoardColumns = [...statusGroups, ...customSections];

  const handleAddSection = (name: string) => {
    const key = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
    setCustomSections(prev => [...prev, { key, label: name }]);
  };

  const handleRemoveSection = (key: string) => {
    setCustomSections(prev => prev.filter(s => s.key !== key));
  };

  return (
    <>
      <Helmet><title>Tasks | 5thLine</title></Helmet>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              {viewMode === 'focus' ? '🎯 My Focus' : ownerFilter === 'mine' ? 'My Tasks' : ownerFilter === 'others' ? "Others' Tasks" : 'All Tasks'}
            </h1>
            <span className="text-sm text-muted-foreground">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''}
            </span>
            {(() => {
              const visibleOverdue = filtered.filter(t => !t.due_date ? false : (isPast(new Date(t.due_date + 'T23:59:59')) && !isToday(new Date(t.due_date + 'T00:00:00')) && t.status !== 'complete')).length;
              const visibleDueToday = filtered.filter(t => !t.due_date ? false : (isToday(new Date(t.due_date + 'T00:00:00')) && t.status !== 'complete')).length;
              return (visibleOverdue > 0 || visibleDueToday > 0) ? (
                <div className="flex items-center gap-2">
                  {visibleOverdue > 0 && (
                    <span className="text-sm text-destructive/80 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
                      </svg>
                      {visibleOverdue} overdue
                    </span>
                  )}
                  {visibleDueToday > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {visibleDueToday} due today
                    </span>
                  )}
                </div>
              ) : null;
            })()}
          </div>
          <HintTooltip
            hint="Switch between Focus, List, Board, Calendar, and Reports to view your tasks the way you prefer."
            visible={isHintVisible('tasks-views')}
            onDismiss={() => dismissHint('tasks-views')}
            side="bottom"
          >
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="focus" className="text-xs gap-1 px-2 h-7">
                    <Star className="h-3.5 w-3.5" /> Focus
                  </TabsTrigger>
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
          </HintTooltip>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-2 border-b bg-muted/20">
          <div className="relative flex-1 max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="h-8 text-xs pl-8" />
          </div>
          <Select value={ownerFilter} onValueChange={v => setOwnerFilter(v as TaskOwnerFilter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Users className="h-3 w-3 mr-1.5" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine" className="text-xs">My Tasks</SelectItem>
              <SelectItem value="others" className="text-xs">Others' Tasks</SelectItem>
              <SelectItem value="all" className="text-xs">All Tasks</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <Filter className="h-3 w-3 mr-1.5" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All statuses</SelectItem>
              <SelectItem value="incomplete" className="text-xs">Incomplete</SelectItem>
              <SelectItem value="complete" className="text-xs">Complete</SelectItem>
              <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
              <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
              <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SlidersHorizontal className="h-3 w-3 mr-1.5" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_date" className="text-xs">Due date</SelectItem>
              <SelectItem value="priority" className="text-xs">Priority</SelectItem>
              <SelectItem value="created_at" className="text-xs">Created</SelectItem>
              <SelectItem value="title" className="text-xs">Name</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <Group className="h-3 w-3 mr-1.5" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status" className="text-xs">By Status</SelectItem>
              <SelectItem value="time" className="text-xs">By Due Date</SelectItem>
              <SelectItem value="priority" className="text-xs">By Priority</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {/* Saved Views */}
          {savedViews.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                  <Bookmark className="h-3 w-3" /> Views
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Saved Views</DropdownMenuLabel>
                {savedViews.map(v => (
                  <DropdownMenuItem key={v.id} className="text-xs flex items-center justify-between" onClick={() => handleLoadView(v)}>
                    {v.name}
                    <button onClick={e => { e.stopPropagation(); deleteView.mutate(v.id); }} className="ml-2 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Bulk actions */}
          {selectedTaskIds.size > 0 && (
            <TaskBulkActionBar
              count={selectedTaskIds.size}
              teamMembers={teamMembers}
              onBulkUpdate={handleBulkUpdate}
              onBulkDelete={handleBulkDelete}
              onClear={() => setSelectedTaskIds(new Set())}
            />
          )}

          {/* More menu: Save view, Export, Templates, Labels */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuItem className="text-xs gap-2" onClick={() => setShowSaveViewDialog(true)}>
                <BookmarkPlus className="h-3.5 w-3.5" /> Save current view
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs gap-2" onClick={handleExportCSV}>
                <FileDown className="h-3.5 w-3.5" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Templates</DropdownMenuLabel>
              {templates.map(t => (
                <DropdownMenuItem key={t.id} className="text-xs gap-2" onClick={() => applyTemplate.mutate(t.id)}>
                  <ClipboardList className="h-3.5 w-3.5" /> {t.name}
                </DropdownMenuItem>
              ))}
              {templates.length === 0 && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">No templates yet</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Labels</DropdownMenuLabel>
              {labels.map(l => (
                <DropdownMenuItem key={l.id} className="text-xs gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <HintTooltip
            hint="Click here to create a new task. You can assign it to a deal, set a due date, and add details."
            visible={isHintVisible('tasks-add')}
            onDismiss={() => dismissHint('tasks-add')}
            side="bottom"
          >
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => { setIsCreating(true); setTimeout(() => newTaskRef.current?.focus(), 50); }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Task
            </Button>
          </HintTooltip>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          <div
            className="overflow-auto"
            style={{
              flex: selectedTask ? '1 1 0%' : '1 1 100%',
              transition: 'flex 200ms ease',
              minWidth: 0,
            }}
          >
            {(viewMode === 'list' || viewMode === 'focus') && (
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
                onDeleteTask={id => handleDeleteWithUndo(id)}
                selectedTaskId={selectedTaskId}
                groupBy={viewMode === 'focus' ? 'time' : groupBy}
                selectedTaskIds={selectedTaskIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                onToggleStar={handleToggleStar}
                focusedTaskIndex={focusedTaskIndex}
              />
            )}
            {viewMode === 'board' && (
              <TaskBoardView
                tasks={filtered}
                statusGroups={allBoardColumns}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={(id, updates) => updateTask.mutate({ id, ...updates })}
                onCreateTask={(title, status) => createTask.mutate({ title, status })}
                selectedTaskId={selectedTaskId}
                onAddSection={handleAddSection}
                onRemoveSection={handleRemoveSection}
                customSectionKeys={customSections.map(s => s.key)}
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

        {/* Save View Dialog */}
        <Dialog open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Save Current View</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={newViewName}
                onChange={e => setNewViewName(e.target.value)}
                placeholder="View name..."
                className="text-sm"
                onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); }}
                autoFocus
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Will save: {viewMode} view, {filterStatus} filter, {sortBy} sort, {groupBy} group</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSaveViewDialog(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveView}>Save</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

// Board view component with drag-and-drop
function TaskBoardView({ tasks, statusGroups, onSelectTask, onUpdateTask, onCreateTask, selectedTaskId, onAddSection, onRemoveSection, customSectionKeys }: {
  tasks: Task[];
  statusGroups: { key: string; label: string }[];
  onSelectTask: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onCreateTask: (title: string, status: string) => void;
  selectedTaskId: string | null;
  onAddSection: (name: string) => void;
  onRemoveSection: (key: string) => void;
  customSectionKeys: string[];
}) {
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const sectionInputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const priorityColors: Record<string, string> = {
    urgent: 'border-l-destructive',
    high: 'border-l-orange-500',
    medium: 'border-l-primary',
    low: 'border-l-muted-foreground/30',
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Group tasks by status, sorted by position
  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const group of statusGroups) {
      map[group.key] = tasks
        .filter(t => t.status === group.key)
        .sort((a, b) => a.position - b.position);
    }
    return map;
  }, [tasks, statusGroups]);

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Handled in dragEnd
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !active) return;

    const activeTaskId = active.id as string;
    const task = tasks.find(t => t.id === activeTaskId);
    if (!task) return;

    const overId = over.id as string;

    // Determine target column: if dropped on a column droppable or on another task
    let targetStatus: string;
    let overTask: Task | undefined;

    // Check if over is a column ID
    const isColumn = statusGroups.some(g => g.key === overId);
    if (isColumn) {
      targetStatus = overId;
    } else {
      overTask = tasks.find(t => t.id === overId);
      targetStatus = overTask?.status || task.status;
    }

    const sourceStatus = task.status;
    const targetTasks = tasksByStatus[targetStatus] || [];

    if (sourceStatus === targetStatus) {
      // Reorder within the same column
      if (!overTask || activeTaskId === overId) return;
      const oldIndex = targetTasks.findIndex(t => t.id === activeTaskId);
      const newIndex = targetTasks.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(targetTasks, oldIndex, newIndex);
      reordered.forEach((t, i) => {
        if (t.position !== i) {
          onUpdateTask(t.id, { position: i });
        }
      });
    } else {
      // Move to different column
      let newPosition = 0;
      if (overTask) {
        const overIndex = targetTasks.findIndex(t => t.id === overId);
        newPosition = overIndex >= 0 ? overIndex : targetTasks.length;
      } else {
        newPosition = targetTasks.length;
      }
      // Shift positions of tasks below in target column
      targetTasks.forEach((t, i) => {
        if (i >= newPosition) {
          onUpdateTask(t.id, { position: i + 1 });
        }
      });
      onUpdateTask(activeTaskId, { status: targetStatus, position: newPosition });
    }
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) { setIsAddingSection(false); return; }
    onAddSection(newSectionName.trim());
    setNewSectionName('');
    setIsAddingSection(false);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-4 overflow-x-auto h-full">
        {statusGroups.map(group => (
          <BoardColumn
            key={group.key}
            groupKey={group.key}
            label={group.label}
            tasks={tasksByStatus[group.key] || []}
            priorityColors={priorityColors}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onCreateTask={onCreateTask}
            isCustom={customSectionKeys.includes(group.key)}
            onRemove={() => onRemoveSection(group.key)}
          />
        ))}
        {/* Add Section column */}
        {isAddingSection ? (
          <div className="flex flex-col min-w-[280px] w-[280px] bg-muted/30 rounded-lg">
            <div className="px-3 py-2.5 border-b">
              <Input
                ref={sectionInputRef}
                value={newSectionName}
                onChange={e => setNewSectionName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddSection(); }
                  if (e.key === 'Escape') { setIsAddingSection(false); setNewSectionName(''); }
                }}
                onBlur={handleAddSection}
                placeholder="Section name..."
                className="h-8 text-sm"
                autoFocus
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setIsAddingSection(true); setNewSectionName(''); }}
            className="flex flex-col items-center justify-center min-w-[280px] w-[280px] rounded-lg border border-dashed border-border/50 hover:border-border hover:bg-muted/20 transition-colors gap-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm">Add Section</span>
          </button>
        )}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className={`rounded-md border bg-card p-3 shadow-lg border-l-[3px] opacity-90 w-[260px] ${priorityColors[activeTask.priority] || ''}`}>
            <p className="text-sm font-medium">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableTaskCard({ task, priorityColors, selectedTaskId, onSelectTask }: {
  task: Task;
  priorityColors: Record<string, string>;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl p-3 cursor-pointer transition-all duration-200 backdrop-blur-xl border border-[hsl(272,100%,80%,0.35)] bg-[linear-gradient(145deg,hsl(222,30%,18%)_0%,hsl(230,25%,14%)_50%,hsl(238,22%,11%)_100%)] shadow-[inset_0_1px_2px_hsl(272,100%,80%,0.15),inset_0_-1px_1px_hsl(0,0%,0%,0.2),0_0_12px_hsl(272,100%,70%,0.1),0_6px_28px_hsl(0,0%,0%,0.5)] hover:border-[hsl(272,100%,80%,0.55)] hover:bg-[linear-gradient(145deg,hsl(222,30%,21%)_0%,hsl(230,25%,17%)_50%,hsl(238,22%,14%)_100%)] hover:shadow-[inset_0_1px_2px_hsl(272,100%,85%,0.2),inset_0_-1px_1px_hsl(0,0%,0%,0.25),0_0_20px_hsl(272,100%,70%,0.18),0_10px_40px_hsl(0,0%,0%,0.6)] hover:-translate-y-0.5 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(272,80%,75%,0.08)_0%,transparent_40%,hsl(268,60%,50%,0.04)_100%)] relative overflow-hidden border-l-[3px] ${priorityColors[task.priority] || ''} ${
        selectedTaskId === task.id ? 'ring-1 ring-primary' : ''
      }`}
      onClick={() => onSelectTask(task.id)}
    >
      <div className="flex items-start gap-1.5">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
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
      </div>
    </div>
  );
}

function BoardColumn({ groupKey, label, tasks: groupTasks, priorityColors, selectedTaskId, onSelectTask, onCreateTask, isCustom, onRemove }: {
  groupKey: string;
  label: string;
  tasks: Task[];
  priorityColors: Record<string, string>;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onCreateTask: (title: string, status: string) => void;
  isCustom?: boolean;
  onRemove?: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { setNodeRef, isOver } = useDroppable({ id: groupKey });

  const taskIds = useMemo(() => groupTasks.map(t => t.id), [groupTasks]);

  const startAdding = () => {
    setIsAdding(true);
    setNewTitle('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = () => {
    if (!newTitle.trim()) { setIsAdding(false); return; }
    onCreateTask(newTitle.trim(), groupKey);
    setNewTitle('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); }
  };

  return (
    <div className={`flex flex-col min-w-[280px] w-[280px] bg-muted/30 rounded-lg transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
            {groupTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isCustom && onRemove && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startAdding}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div ref={setNodeRef} className="flex-1 overflow-auto p-2 space-y-2 min-h-[60px]">
        {isAdding && (
          <div className="rounded-md border bg-card p-2">
            <Input
              ref={inputRef}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSubmit}
              placeholder="Task name..."
              className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-1"
            />
          </div>
        )}
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {groupTasks.map(task => (
            <SortableTaskCard
              key={task.id}
              task={task}
              priorityColors={priorityColors}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
            />
          ))}
        </SortableContext>
        {!isAdding && (
          <button
            onClick={startAdding}
            className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
          >
            <Plus className="h-3 w-3" /> Add task
          </button>
        )}
      </div>
    </div>
  );
}
