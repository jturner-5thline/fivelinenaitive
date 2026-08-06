import { useState, useRef, type KeyboardEvent, type ComponentType, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useUndoStack } from '@/hooks/useUndoStack';
import { ClaapRoutingTasksBadge } from '@/components/integrations/claap/ClaapRoutingTasksBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { useMyTasks, type Task, type TaskOwnerFilter } from '@/hooks/useTasks';
import {
  TaskListView,
  type GroupBy,
  OPTIONAL_TASK_COLUMNS,
  DEFAULT_TASK_COLUMNS,
  type TaskColumnId,
} from '@/components/tasks/TaskListView';
import { useUiPreference } from '@/hooks/useUiPreference';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
// Lazy-load heavy tab views so they don't ship with the initial Tasks bundle
const TaskCalendarView = lazy(() =>
  import('@/components/tasks/TaskCalendarView').then(m => ({ default: m.TaskCalendarView }))
);
const TaskReportingView = lazy(() =>
  import('@/components/tasks/TaskReportingView').then(m => ({ default: m.TaskReportingView }))
);
import { TaskBulkActionBar } from '@/components/tasks/TaskBulkActionBar';
import { QuickCreateTaskDialog } from '@/components/tasks/QuickCreateTaskDialog';
import { findSimilarTaskGroups } from '@/lib/taskSimilarity';
const TaskFocusMode = lazy(() =>
  import('@/components/tasks/TaskFocusMode').then(m => ({ default: m.TaskFocusMode }))
);
import { useTaskNotifications } from '@/hooks/useTaskNotifications';
import { useTaskSavedViews, type TaskSavedView } from '@/hooks/useTaskSavedViews';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useTaskTemplates } from '@/hooks/useTaskTemplates';
import { useTaskLabels } from '@/hooks/useTaskLabels';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent,
} from '@/components/ui/sheet';
import {
  ListTodo, LayoutGrid, Calendar, Plus, Search, Filter,
  SlidersHorizontal, Group, Trash2, BarChart3,
  Bookmark, BookmarkPlus, FileDown, Star, MoreVertical,
  Tag, ClipboardList, Users, Briefcase, Building2, CalendarDays, X,
  Pencil, Copy as CopyIcon, Check,
  Link2, Pin, PinOff, Repeat, ChevronDown,
  Columns3, Undo2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDueBoundaries } from '@/hooks/useDueBoundaries';
import { bucketDueDate, isOverdue as isOverdueFn } from '@/lib/taskDateGrouping';
import { invalidateAllTaskCaches } from '@/lib/taskCache';
import { cn } from '@/lib/utils';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
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
type SortBy = 'due_date' | 'priority' | 'created_at' | 'title' | 'deal';
type FilterDueDate = 'all' | 'overdue' | 'today' | 'this_week' | 'no_date';
type FilterRecurring = 'all' | 'recurring' | 'paused';
// Priority has been simplified to a single Urgent flag — a task is either
// urgent (priority === 'urgent') or has no priority (null).
type TaskPriority = 'urgent';
const URGENT_COLOR = '#e57373';
const ACTIVE_DEAL_INACTIVE_STAGES = new Set(['closed-won', 'closed-lost', 'on-hold']);
// Deals are restricted to these stages by default in the Tasks deal picker;
// the "Show all deals (incl. closed/on-hold)" checkbox lifts the restriction.
const ACTIVE_DEAL_STAGES = new Set(['pipeline', 'development_pipeline']);

function buildTaskUndoPatch(task: Task, updates: Partial<Task>): Partial<Task> {
  const prev: Record<string, unknown> = {};
  const taskRecord = task as unknown as Record<string, unknown>;
  for (const key of Object.keys(updates)) prev[key] = taskRecord[key] ?? null;
  if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
    prev.completed_at = task.completed_at ?? null;
    prev.completed_by = task.completed_by ?? null;
  }
  return prev as Partial<Task>;
}

function toRestorableTaskRow(task: Task): Record<string, unknown> {
  const row: Record<string, unknown> = { ...(task as unknown as Record<string, unknown>) };
  delete row.assignee_profile;
  delete row.creator_profile;
  delete row.deal;
  delete row.contact;
  delete row.crm_company;
  delete row.project;
  delete row.subtasks;
  row.updated_at = new Date().toISOString();
  return row;
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px]"
      style={{
        backgroundColor: 'rgba(126,184,247,0.12)',
        border: '1px solid rgba(126,184,247,0.28)',
        color: '#cfe3ff',
      }}
    >
      <span className="truncate max-w-[180px]">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="hover:text-white transition-colors -mr-1 p-0.5"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

const STATUS_LABELS: Record<FilterStatus, string> = {
  all: 'All',
  incomplete: 'Incomplete',
  complete: 'Complete',
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
};
const DUE_LABELS: Record<FilterDueDate, string> = {
  all: 'Any due date',
  overdue: 'Overdue',
  today: 'Due today',
  this_week: 'Due this week',
  no_date: 'No due date',
};
const PRIORITY_LABEL_MAP: Record<TaskPriority, string> = {
  urgent: 'Urgent',
};

type InlineSelectOption<T extends string> = {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

function InlineFilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
}: {
  id: string;
  label: string;
  value: T;
  options: InlineSelectOption<T>[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: T) => void;
}) {
  const listboxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) listboxRef.current?.focus();
  }, [isOpen]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onToggle();
      return;
    }

    const currentIndex = options.findIndex(option => option.value === value);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = options[(currentIndex + 1 + options.length) % options.length];
      onSelect(next.value);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = options[(currentIndex - 1 + options.length) % options.length];
      onSelect(next.value);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      onToggle();
    }
  };

  const selected = options.find(option => option.value === value) ?? options[0];
  const SelectedIcon = selected.icon;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">{label}</label>
      <button
        id={`${id}-trigger`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        className="flex h-8 w-full items-center justify-between rounded-md border px-3 text-xs transition-colors hover:bg-muted/60"
        style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="flex min-w-0 items-center gap-2">
          {SelectedIcon ? <SelectedIcon className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
          <span className="truncate">{selected.label}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div
          id={`${id}-listbox`}
          ref={listboxRef}
          role="listbox"
          tabIndex={0}
          aria-labelledby={`${id}-trigger`}
          aria-activedescendant={`${id}-option-${selected.value}`}
          className="rounded-md border p-1"
          style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}
          onKeyDown={handleListKeyDown}
        >
          {options.map((option) => {
            const OptionIcon = option.icon;
            const selectedOption = option.value === value;

            return (
              <button
                key={option.value}
                id={`${id}-option-${option.value}`}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors hover:bg-muted/70"
                style={{
                  backgroundColor: selectedOption ? 'rgba(126,184,247,0.12)' : 'transparent',
                  color: selectedOption ? '#cfe3ff' : undefined,
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(option.value);
                  onToggle();
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {OptionIcon ? <OptionIcon className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
                  <span className="truncate">{option.label}</span>
                </span>
                {selectedOption ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface TasksProps {
  overlayMode?: boolean;
}

export default function Tasks({ overlayMode = false }: TasksProps = {}) {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState<TaskOwnerFilter>('mine');
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useMyTasks(ownerFilter);
  // 5th Line teammates — surfaced in the owner filter so a user can quickly
  // pivot from "My tasks" to any other naitive teammate's task list.
  const { user: _currentUserForTeam } = useAuth();
  const { data: fifthLineTeammates = [] } = useQuery({
    queryKey: ['fifth-line-teammates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, email')
        .ilike('email', '%@5thline.co')
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data || []).filter((p: any) => !!p.user_id);
    },
    staleTime: 5 * 60 * 1000,
  });
  // Restrict the teammate picker to the specific 5th Line roster requested
  // by leadership. Match against the first token of display_name OR the
  // email local-part so display names like "John Turner" or emails like
  // "jturner@5thline.co" both resolve.
  const ALLOWED_TEAMMATE_FIRST_NAMES = useMemo(
    () => ['flor', 'john', 'mark', 'makenzie', 'scott', 'niki', 'paz'],
    [],
  );
  const allowedTeammates = useMemo(() => {
    const first = (p: any) => {
      const dn = (p.display_name || '').trim().toLowerCase();
      if (dn) return dn.split(/\s+/)[0];
      const local = (p.email || '').split('@')[0].toLowerCase();
      return local;
    };
    // Map first-letter of email local part → first name so "jturner" → "john".
    const emailPrefixMap: Record<string, string> = {
      fmartinez: 'flor', ffustinoni: 'flor',
      jturner: 'john', jmoffitt: 'john',
      mclark: 'mark',
      mmarshall: 'makenzie', makenzie: 'makenzie',
      swilliams: 'scott',
      nheikali: 'niki',
      ppina: 'paz',
    };
    return fifthLineTeammates.filter((p: any) => {
      const dnFirst = first(p);
      const localFull = (p.email || '').split('@')[0].toLowerCase();
      if (ALLOWED_TEAMMATE_FIRST_NAMES.includes(dnFirst)) return true;
      if (emailPrefixMap[localFull]) return true;
      return false;
    });
  }, [fifthLineTeammates, ALLOWED_TEAMMATE_FIRST_NAMES]);
  const selectedTeammateIds = useMemo(() => {
    if (typeof ownerFilter !== 'string') return [] as string[];
    if (ownerFilter.startsWith('users:')) return ownerFilter.slice('users:'.length).split(',').filter(Boolean);
    if (ownerFilter.startsWith('user:')) return [ownerFilter.slice('user:'.length)];
    return [];
  }, [ownerFilter]);
  const toggleTeammate = (userId: string) => {
    const next = selectedTeammateIds.includes(userId)
      ? selectedTeammateIds.filter(id => id !== userId)
      : [...selectedTeammateIds, userId];
    if (next.length === 0) setOwnerFilter('mine');
    else setOwnerFilter(`users:${next.join(',')}` as TaskOwnerFilter);
  };
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const { notifications } = useTaskNotifications();
  const { savedViews, saveView, deleteView, renameView, duplicateView, togglePinView } = useTaskSavedViews();
  const { templates, applyTemplate } = useTaskTemplates();
  const teamMembers = useTeamMembers();
  const { labels, createLabel } = useTaskLabels();

  // Owner-filter people list: everyone in the current workspace (falls back to
  // the 5th Line roster if the workspace member lookup returns nothing), so a
  // user can toggle between "My tasks", "All tasks", and any named teammate.
  const [teammateSearch, setTeammateSearch] = useState('');
  const teammateOptions = useMemo(() => {
    const fromWorkspace = (teamMembers || [])
      .filter(m => !!m.id)
      .map(m => ({
        user_id: m.id,
        display_name: m.display_name,
        email: m.email,
      }));
    const base = fromWorkspace.length > 0
      ? fromWorkspace
      : (allowedTeammates as any[]).map(p => ({
          user_id: p.user_id,
          display_name: p.display_name,
          email: p.email,
        }));
    const seen = new Set<string>();
    return base
      .filter(p => (seen.has(p.user_id) ? false : (seen.add(p.user_id), true)))
      .sort((a, b) =>
        (a.display_name || a.email || '').localeCompare(b.display_name || b.email || ''),
      );
  }, [teamMembers, allowedTeammates]);
  const filteredTeammateOptions = useMemo(() => {
    const q = teammateSearch.trim().toLowerCase();
    if (!q) return teammateOptions;
    return teammateOptions.filter(
      p =>
        (p.display_name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q),
    );
  }, [teammateOptions, teammateSearch]);
  const selectedTeammates = useMemo(
    () => teammateOptions.filter(p => selectedTeammateIds.includes(p.user_id)),
    [teammateOptions, selectedTeammateIds],
  );
  const teammateLabel = useMemo(() => {
    if (selectedTeammates.length === 0) return null;
    if (selectedTeammates.length === 1) {
      const p = selectedTeammates[0];
      const name = p.display_name || p.email || 'Teammate';
      return name.split(/\s+/)[0];
    }
    return `${selectedTeammates.length} teammates`;
  }, [selectedTeammates]);

  // Per-user persistence namespace for filter / view preferences.
  // Falls back to a shared key before auth resolves; useLocalStorageState
  // re-hydrates when the key flips so the user's saved prefs load in.
  const { user: _authUserForPrefs } = useAuth();
  const _prefsNs = _authUserForPrefs?.id ? `tasks:${_authUserForPrefs.id}` : 'tasks:anon';
  const undoStack = useUndoStack();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // Tracks whether the user explicitly dismissed the detail pane so the
  // auto-select effect below doesn't immediately re-open the first task.
  const [detailDismissed, setDetailDismissed] = useState(false);
  const [viewMode, setViewMode] = useLocalStorageState<ViewMode>(`${_prefsNs}:viewMode`, 'list');

  const updateTaskWithUndo = useCallback((taskId: string, updates: Partial<Task>, label = 'Task change') => {
    const snapshot = tasks.find(t => t.id === taskId);
    if (snapshot) {
      const undoPatch = buildTaskUndoPatch(snapshot, updates);
      undoStack.push({
        label,
        undo: () => updateTask.mutate({ id: taskId, ...undoPatch }),
      });
    }
    updateTask.mutate({ id: taskId, ...updates } as Partial<Task> & { id: string });
  }, [tasks, undoStack, updateTask]);

  const restoreDeletedTask = useCallback(async (task: Task) => {
    const { error } = await supabase.from('tasks').upsert(toRestorableTaskRow(task) as never);
    if (error) throw error;
    invalidateAllTaskCaches(queryClient);
  }, [queryClient]);

  // Auto-open task from ?task= query parameter (e.g. from email deep link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Accept both ?task=<id> (legacy) and ?taskId=<id>&view=mine (new email deep-link)
    const taskParam = params.get('task') || params.get('taskId');
    if (taskParam && tasks.length > 0) {
      const found = tasks.find(t => t.id === taskParam);
      if (found) {
        setSelectedTaskId(taskParam);
        // Scroll the task row into view after a short delay for DOM render
        setTimeout(() => {
          document.querySelector(`[data-task-id="${taskParam}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
      // Clear the query param so it doesn't persist on refresh
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [tasks]);
  const [search, setSearch] = useState('');
  // Default to incomplete — completed tasks would otherwise dominate the
  // view and trigger the misleading "Xd overdue" badge on done rows.
  // Subtask 5 of Asana 1215035328425908.
  const [filterStatus, setFilterStatus] = useLocalStorageState<FilterStatus>(`${_prefsNs}:filterStatus`, 'incomplete');
  const [sortBy, setSortBy] = useLocalStorageState<SortBy>(`${_prefsNs}:sortBy`, 'due_date');
  const [groupBy, setGroupBy] = useLocalStorageState<GroupBy>(`${_prefsNs}:groupBy`, 'status');
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const newTaskRef = useRef<HTMLInputElement>(null);
  const [focusedTaskIndex, setFocusedTaskIndex] = useState<number>(-1);
  const [filterDealIds, setFilterDealIds] = useState<Set<string>>(new Set());
  const [urgentOnly, setUrgentOnly] = useLocalStorageState<boolean>(`${_prefsNs}:urgentOnly`, false);
  const [showAllDeals, setShowAllDeals] = useLocalStorageState<boolean>(`${_prefsNs}:showAllDeals`, false);
  const [filterLabelIds, setFilterLabelIds] = useState<Set<string>>(new Set());
  const [filterDueDate, setFilterDueDate] = useLocalStorageState<FilterDueDate>(`${_prefsNs}:filterDueDate`, 'all');
  const [filterRecurring, setFilterRecurring] = useLocalStorageState<FilterRecurring>(`${_prefsNs}:filterRecurring`, 'all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openInlineFilter, setOpenInlineFilter] = useState<'dueDate' | 'sortBy' | 'groupBy' | 'recurring' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const quickCreateTriggerRef = useRef<HTMLElement | null>(null);
  const [similarMode, setSimilarMode] = useState(false);

  // Visible task list columns — default = priority + status only (clean
  // triage view). Saved per-user so customizations persist.
  const [visibleTaskColumns, setVisibleTaskColumns] = useUiPreference<TaskColumnId[]>(
    'task_list_visible_columns',
    DEFAULT_TASK_COLUMNS,
  );
  const toggleTaskColumn = (id: TaskColumnId) => {
    const set = new Set(visibleTaskColumns);
    if (set.has(id)) set.delete(id); else set.add(id);
    setVisibleTaskColumns(Array.from(set));
  };

  // Fetch label assignments for all tasks for filtering
  const { data: allLabelAssignments = [] } = useQuery({
    queryKey: ['all-task-label-assignments'],
    enabled: !!tasks.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_label_assignments')
        .select('task_id, label_id');
      if (error) throw error;
      return data || [];
    },
  });

  const taskLabelMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allLabelAssignments.forEach(a => {
      if (!map.has(a.task_id)) map.set(a.task_id, new Set());
      map.get(a.task_id)!.add(a.label_id);
    });
    return map;
  }, [allLabelAssignments]);

  // Unique deals across tasks for the deal filter
  const uniqueDeals = useMemo(() => {
    const dealMap = new Map<string, string>();
    tasks.forEach(t => {
      if (t.deal_id && t.deal?.company) {
        dealMap.set(t.deal_id, t.deal.company);
      }
    });
    return Array.from(dealMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  // All RLS-visible deals — used so the Deal filter can target deals that
  // don't yet appear on any task in the current view (uniqueDeals only
  // surfaces deals already linked to a loaded task).
  const { deals: allDeals } = useDealsContext();
  const allDealOptions = useMemo(() => {
    const merged = new Map<string, string>();
    const dealById = new Map(allDeals.map(d => [d.id, d] as const));
    // Default: only deals on the active boards ('pipeline' or
    // 'development_pipeline'). The "Show all deals" checkbox lifts this.
    uniqueDeals.forEach(([id, name]) => {
      if (showAllDeals) { merged.set(id, name); return; }
      const d = dealById.get(id);
      if (!d || (typeof d.stage === 'string' && ACTIVE_DEAL_STAGES.has(d.stage))) {
        merged.set(id, name);
      }
    });
    allDeals.forEach(d => {
      if (d.status === 'archived') return;
      if (!showAllDeals) {
        if (typeof d.stage !== 'string' || !ACTIVE_DEAL_STAGES.has(d.stage)) return;
      }
      if (!merged.has(d.id)) merged.set(d.id, d.company || d.name);
    });
    return Array.from(merged.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allDeals, uniqueDeals, showAllDeals]);
  const [dealFilterQuery, setDealFilterQuery] = useState('');

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  // ── URL query-param persistence ──────────────────────────────────────
  // Sync status / due / priority / deal filters with the URL so links are
  // shareable and refresh-safe. Read once on mount, then write on change.
  const urlHydrated = useRef(false);
  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const params = new URLSearchParams(window.location.search);
    const s = params.get('status') as FilterStatus | null;
    if (s && ['all','incomplete','complete','not_started','in_progress','blocked'].includes(s)) {
      setFilterStatus(s);
    }
    const d = params.get('due') as FilterDueDate | null;
    if (d && ['all','overdue','today','this_week','no_date'].includes(d)) {
      setFilterDueDate(d);
    }
    const p = params.get('priority');
    if (p === 'urgent' || p === '1' || p === 'true') setUrgentOnly(true);
    const deals = params.get('deal');
    if (deals) {
      const ids = deals.split(',').filter(Boolean);
      if (ids.length) setFilterDealIds(new Set(ids));
    }
  }, []);

  useEffect(() => {
    if (!urlHydrated.current) return;
    const params = new URLSearchParams(window.location.search);
    if (filterStatus !== 'incomplete') params.set('status', filterStatus); else params.delete('status');
    if (filterDueDate !== 'all') params.set('due', filterDueDate); else params.delete('due');
    if (urgentOnly) params.set('priority', 'urgent'); else params.delete('priority');
    if (filterDealIds.size) params.set('deal', Array.from(filterDealIds).join(',')); else params.delete('deal');
    const qs = params.toString();
    const next = window.location.pathname + (qs ? `?${qs}` : '');
    window.history.replaceState({}, '', next);
  }, [filterStatus, filterDueDate, urgentOnly, filterDealIds]);

  const clearAllFilters = useCallback(() => {
    setFilterStatus('incomplete');
    setFilterDueDate('all');
    setUrgentOnly(false);
    setFilterDealIds(new Set());
    setFilterLabelIds(new Set());
    setFilterRecurring('all');
  }, []);

  // Live filter apply from the Copilot ("what do I have going on today"
  // dispatches naitive:apply-tasks-filter after opening the overlay).
  // Handles the case where TasksPage is already mounted from a previous
  // open and would otherwise skip URL-based hydration.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ due?: FilterDueDate; status?: FilterStatus }>).detail || {};
      if (detail.due && ['all','overdue','today','this_week','no_date'].includes(detail.due)) {
        setFilterDueDate(detail.due);
      }
      if (detail.status && ['all','incomplete','complete','not_started','in_progress','blocked'].includes(detail.status)) {
        setFilterStatus(detail.status);
      }
    };
    window.addEventListener('naitive:apply-tasks-filter', handler as EventListener);
    return () => window.removeEventListener('naitive:apply-tasks-filter', handler as EventListener);
  }, []);

  const hasActiveFilters = filterStatus !== 'incomplete'
    || filterDueDate !== 'all'
    || urgentOnly
    || filterDealIds.size > 0
    || filterLabelIds.size > 0
    || filterRecurring !== 'all';

  // ── Unified task filter state ────────────────────────────────────────
  // Single shared object that the status dropdown, the Filters popover,
  // and the Search input all bind to. The individual `useState`s above
  // remain the storage layer (URL hydration, saved-presets, etc. all
  // already read/write them) — `taskFilters` is a read-only aggregator
  // and `patchFilters` is the unified setter the UI calls. This lets the
  // list and the "N open" header count stay in sync from a single source.
  const taskFilters = useMemo(() => ({
    status: filterStatus,
    dueDate: filterDueDate,
    sortBy,
    groupBy,
    recurring: filterRecurring,
    urgentOnly,
    deals: Array.from(filterDealIds),
    showClosedDeals: showAllDeals,
    search,
  }), [filterStatus, filterDueDate, sortBy, groupBy, filterRecurring, urgentOnly, filterDealIds, showAllDeals, search]);

  const dueDateOptions = useMemo<InlineSelectOption<FilterDueDate>[]>(() => [
    { value: 'all', label: 'Any due date', icon: CalendarDays },
    { value: 'overdue', label: 'Overdue', icon: CalendarDays },
    { value: 'today', label: 'Due today', icon: CalendarDays },
    { value: 'this_week', label: 'Due this week', icon: CalendarDays },
    { value: 'no_date', label: 'No due date', icon: CalendarDays },
  ], []);
  const sortByOptions = useMemo<InlineSelectOption<SortBy>[]>(() => [
    { value: 'due_date', label: 'Due date' },
    { value: 'created_at', label: 'Created date' },
    { value: 'priority', label: 'Priority' },
    { value: 'title', label: 'Name' },
    { value: 'deal', label: 'Deal' },
  ], []);
  const groupByOptions = useMemo<InlineSelectOption<GroupBy>[]>(() => [
    { value: 'status', label: 'Status' },
    { value: 'time', label: 'Due date' },
    { value: 'priority', label: 'Priority' },
  ], []);
  const recurringOptions = useMemo<InlineSelectOption<FilterRecurring>[]>(() => [
    { value: 'all', label: 'All tasks', icon: Repeat },
    { value: 'recurring', label: 'Recurring only', icon: Repeat },
    { value: 'paused', label: 'Paused only', icon: Repeat },
  ], []);

  type TaskFilters = typeof taskFilters;
  const patchFilters = useCallback((patch: Partial<TaskFilters>) => {
    if (patch.status !== undefined) setFilterStatus(patch.status);
    if (patch.dueDate !== undefined) setFilterDueDate(patch.dueDate);
    if (patch.sortBy !== undefined) setSortBy(patch.sortBy);
    if (patch.groupBy !== undefined) setGroupBy(patch.groupBy);
    if (patch.recurring !== undefined) setFilterRecurring(patch.recurring);
    if (patch.urgentOnly !== undefined) setUrgentOnly(patch.urgentOnly);
    if (patch.deals !== undefined) setFilterDealIds(new Set(patch.deals));
    if (patch.showClosedDeals !== undefined) setShowAllDeals(patch.showClosedDeals);
    if (patch.search !== undefined) setSearch(patch.search);
  }, []);

  // 250ms debounce on the search input so each keystroke doesn't refilter
  // the entire task set (which would also re-fire the "N open" count).
  const debouncedSearch = useDebouncedValue(taskFilters.search, 250);

  // Single source of truth for "today" / "this week" boundaries — auto-rolls
  // at local midnight so overdue/today/upcoming stay correct without reload.
  const dueBoundaries = useDueBoundaries();

  // Focus view: today's tasks + overdue + this-week + high priority
  const focusTasks = tasks.filter(t => {
    if (t.status === 'complete') return false;
    const bucket = bucketDueDate(t.due_date, dueBoundaries);
    if (bucket === 'overdue' || bucket === 'today' || bucket === 'tomorrow' || bucket === 'this_week') return true;
    if (t.priority === 'urgent' && t.status === 'not_started') return true;
    return false;
  });

  // Get user for tab filtering
  const { user } = useAuth();
  const tabFilteredTasks = viewMode === 'focus' ? focusTasks : tasks;

  // Filter and sort (starred items float to top)
  const filtered = tabFilteredTasks
    .filter(t => {
      if (filterStatus === 'incomplete' && t.status === 'complete') return false;
      if (filterStatus !== 'all' && filterStatus !== 'incomplete' && t.status !== filterStatus) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const inTitle = t.title.toLowerCase().includes(q);
        const dealName = (t.deal?.company || t.crm_company?.name || '').toLowerCase();
        const inDeal = dealName.includes(q);
        if (!inTitle && !inDeal) return false;
      }
      if (filterDealIds.size > 0 && (!t.deal_id || !filterDealIds.has(t.deal_id))) return false;
      if (urgentOnly && t.priority !== 'urgent') return false;
      if (filterLabelIds.size > 0) {
        const taskLabels = taskLabelMap.get(t.id);
        if (!taskLabels || ![...filterLabelIds].some(lid => taskLabels.has(lid))) return false;
      }
      if (filterDueDate !== 'all') {
        const bucket = bucketDueDate(t.due_date, dueBoundaries);
        if (filterDueDate === 'no_date') {
          if (bucket !== 'no_date') return false;
        } else if (bucket === 'no_date') {
          return false;
        } else if (filterDueDate === 'overdue') {
          if (bucket !== 'overdue' || t.status === 'complete') return false;
        } else if (filterDueDate === 'today') {
          if (bucket !== 'today') return false;
        } else if (filterDueDate === 'this_week') {
          if (bucket !== 'today' && bucket !== 'tomorrow' && bucket !== 'this_week') return false;
        }
      }
      if (filterRecurring !== 'all') {
        const recurringTask = t as Task & { is_recurring?: boolean; recurrence_end_date?: string | null };
        const isRec = !!t.recurrence_rule || !!recurringTask.is_recurring;
        if (!isRec) return false;
        if (filterRecurring === 'paused') {
          const seriesEnd = recurringTask.recurrence_end_date;
          const todayStr = dueBoundaries.today;
          const isPaused = !!seriesEnd && seriesEnd <= todayStr;
          if (!isPaused) return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
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
        case 'deal': {
          const aDeal = a.deal?.company || '';
          const bDeal = b.deal?.company || '';
          if (!aDeal && !bDeal) return 0;
          if (!aDeal) return 1;
          if (!bDeal) return -1;
          return aDeal.localeCompare(bDeal);
        }
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const effectiveVisibleTaskColumns = overlayMode
    ? DEFAULT_TASK_COLUMNS
    : visibleTaskColumns;

  // Similar-tasks view: cluster the currently-filtered list into fuzzy
  // duplicate groups, then reorder so group members render adjacently.
  // Tasks that don't cluster with any peer are hidden while the mode is on.
  const similarGroups = useMemo(
    () => (similarMode ? findSimilarTaskGroups(filtered) : []),
    [similarMode, filtered],
  );
  const similarOrdered = useMemo(() => {
    if (!similarMode) return filtered;
    const byId = new Map(filtered.map(t => [t.id, t]));
    const out: typeof filtered = [];
    for (const g of similarGroups) {
      for (const id of g.taskIds) {
        const t = byId.get(id);
        if (t) out.push(t);
      }
    }
    return out;
  }, [similarMode, similarGroups, filtered]);
  const listTasks = similarMode ? similarOrdered : filtered;

  // Auto-select the first visible task so the right-pane detail panel is
  // always populated with a row from the current list, not a stale hidden task.
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedTaskId) setSelectedTaskId(null);
      return;
    }
    if (detailDismissed) return;
    if (!selectedTaskId || !filtered.some(t => t.id === selectedTaskId)) {
      setSelectedTaskId(filtered[0].id);
    }
  }, [filtered, selectedTaskId, detailDismissed]);

  const JUNK_NAMES = ['test', 'asdf', 'aaa', 'abc', 'xxx', 'zzz', 'asd', 'qwe', 'foo', 'bar'];
  const [taskNameWarning, setTaskNameWarning] = useState('');
  const [taskNameConfirmed, setTaskNameConfirmed] = useState(false);

  const handleCreateTask = () => {
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    if (!taskNameConfirmed && (trimmed.length < 3 || JUNK_NAMES.includes(trimmed.toLowerCase()))) {
      setTaskNameWarning('Please enter a descriptive task name (at least 3 characters).');
      setTaskNameConfirmed(true);
      return;
    }
    createTask.mutate({ title: trimmed });
    setNewTaskTitle('');
    setTaskNameWarning('');
    setTaskNameConfirmed(false);
    setTimeout(() => newTaskRef.current?.focus(), 50);
  };

  const handleNewTaskKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCreateTask(); }
    if (e.key === 'Escape') { setIsCreating(false); setNewTaskTitle(''); setTaskNameWarning(''); setTaskNameConfirmed(false); }
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkUpdate = useCallback((updates: Partial<Task>) => {
    const snapshots = Array.from(selectedTaskIds)
      .map(id => tasks.find(t => t.id === id))
      .filter(Boolean) as Task[];
    if (snapshots.length > 0) {
      undoStack.push({
        label: `Bulk update ${snapshots.length} task${snapshots.length === 1 ? '' : 's'}`,
        undo: () => Promise.all(snapshots.map(task => (
          updateTask.mutateAsync({ id: task.id, ...buildTaskUndoPatch(task, updates) } as Partial<Task> & { id: string })
        ))).then(() => undefined),
      });
    }
    const promises = Array.from(selectedTaskIds).map(id =>
      updateTask.mutateAsync({ id, ...updates } as Partial<Task> & { id: string })
    );
    Promise.all(promises).then(() => {
      toast.success(`Updated ${selectedTaskIds.size} task(s)`);
      setSelectedTaskIds(new Set());
    });
  }, [selectedTaskIds, tasks, undoStack, updateTask]);

  const handleBulkDelete = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const confirmBulkDelete = useCallback(() => {
    const count = selectedTaskIds.size;
    const ids = Array.from(selectedTaskIds);
    const snapshots = ids.map(id => tasks.find(t => t.id === id)).filter(Boolean) as Task[];
    const promises = ids.map(id => deleteTask.mutateAsync(id));
    Promise.all(promises).then(() => {
      setSelectedTaskIds(new Set());
      setShowDeleteConfirm(false);
      if (snapshots.length > 0) {
        undoStack.push({
          label: `Delete ${snapshots.length} task${snapshots.length === 1 ? '' : 's'}`,
          undo: () => Promise.all(snapshots.map(restoreDeletedTask)).then(() => undefined),
        });
      }
      toast.success(`Deleted ${count} task(s)`);
    });
  }, [selectedTaskIds, tasks, deleteTask, undoStack, restoreDeletedTask]);

  const handleCompleteWithUndo = useCallback((taskId: string, currentStatus: string) => {
    const snapshot = tasks.find(t => t.id === taskId);
    const newStatus = currentStatus === 'complete' ? 'not_started' : 'complete';
    updateTask.mutate({ id: taskId, status: newStatus });
    if (snapshot) {
      const undoPatch = buildTaskUndoPatch(snapshot, { status: newStatus });
      undoStack.push({
        label: newStatus === 'complete' ? 'Complete task' : 'Reopen task',
        undo: () => updateTask.mutate({ id: taskId, ...undoPatch }),
      });
    }
    if (newStatus === 'complete') {
      toast.success('Task completed! 🎉', {
        action: { label: 'Undo', onClick: () => updateTask.mutate({ id: taskId, status: currentStatus }) },
        duration: 5000,
      });
    }
  }, [tasks, updateTask, undoStack]);

  const handleDeleteWithUndo = useCallback((taskId: string) => {
    const snapshot = tasks.find(t => t.id === taskId);
    deleteTask.mutate(taskId);
    if (snapshot) {
      undoStack.push({
        label: 'Delete task',
        undo: () => restoreDeletedTask(snapshot),
      });
    }
    toast.success('Task deleted');
  }, [deleteTask, tasks, undoStack, restoreDeletedTask]);

  const handleToggleStar = useCallback((taskId: string, currentlyStarred: boolean) => {
    updateTaskWithUndo(taskId, { is_starred: !currentlyStarred }, currentlyStarred ? 'Unstar task' : 'Star task');
  }, [updateTaskWithUndo]);

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
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (selectedTaskId) return;
      // Cmd/Ctrl+Z — pop the most recent reversible action.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (undoStack.canUndo) {
          e.preventDefault();
          const action = undoStack.pop();
          if (action) {
            Promise.resolve(action.undo()).then(() => toast.success(`Undone: ${action.label}`));
          }
        }
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsCreating(true);
        setTimeout(() => newTaskRef.current?.focus(), 50);
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
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
  }, [filtered, focusedTaskIndex, selectedTaskId, handleCompleteWithUndo, handleDeleteWithUndo, handleToggleSelect, handleToggleStar, handleSelectAll, undoStack]);

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    saveView.mutate({
      name: newViewName.trim(),
      view_config: {
        viewMode,
        filterStatus,
        sortBy,
        groupBy,
        search,
        ownerFilter,
        filterDealIds: Array.from(filterDealIds),
        filterLabelIds: Array.from(filterLabelIds),
        urgentOnly,
        showAllDeals,
        filterDueDate,
        filterRecurring,
      },
    });
    setNewViewName('');
    setShowSaveViewDialog(false);
  };

  // Build a smart default preset name based on current filters. Examples:
  //   "My overdue tasks (board)"
  //   "Team — High priority · This week (3 deals)"
  //   "All open tasks grouped by deal"
  const suggestPresetName = useCallback((): string => {
    const parts: string[] = [];
    // Scope
    if (ownerFilter === 'mine') parts.push('My');
    else if (ownerFilter === 'all') parts.push('Team');
    else if (selectedTeammates.length === 1) parts.push(`${((selectedTeammates[0] as any).display_name || (selectedTeammates[0] as any).email || '').split(/\s+/)[0]}'s`);
    else if (selectedTeammates.length > 1) parts.push(`${selectedTeammates.length} teammates'`);
    // Due / status
    if (filterDueDate === 'overdue') parts.push('overdue');
    else if (filterDueDate === 'today') parts.push('due today');
    else if (filterDueDate === 'this_week') parts.push('this week');
    else if (filterDueDate === 'no_date') parts.push('undated');
    if (filterStatus && filterStatus !== 'incomplete') {
      parts.push(filterStatus.replace(/_/g, ' '));
    }
    parts.push('tasks');
    // Refinements
    const refinements: string[] = [];
    if (filterDealIds.size > 0) refinements.push(`${filterDealIds.size} deal${filterDealIds.size === 1 ? '' : 's'}`);
    if (filterLabelIds.size > 0) refinements.push(`${filterLabelIds.size} label${filterLabelIds.size === 1 ? '' : 's'}`);
    if (search.trim()) refinements.push(`"${search.trim().slice(0, 24)}"`);
    if (groupBy && groupBy !== 'status') refinements.push(`by ${groupBy}`);
    if (viewMode && viewMode !== 'list') refinements.push(viewMode);

    let label = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    label = label.charAt(0).toUpperCase() + label.slice(1);
    if (refinements.length) label += ` · ${refinements.join(' · ')}`;

    // Disambiguate against existing names
    const existing = new Set(savedViews.map(v => v.name.toLowerCase()));
    if (!existing.has(label.toLowerCase())) return label;
    let n = 2;
    while (existing.has(`${label} (${n})`.toLowerCase())) n++;
    return `${label} (${n})`;
  }, [ownerFilter, filterDueDate, filterStatus, filterDealIds, filterLabelIds, search, groupBy, viewMode, savedViews]);

  // Auto-suggest a name when the Save dialog opens (only if user hasn't typed one).
  useEffect(() => {
    if (showSaveViewDialog && !newViewName.trim()) {
      setNewViewName(suggestPresetName());
    }
    // Intentionally not depending on newViewName — we only want to auto-fill on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSaveViewDialog]);

  const handleLoadView = (view: TaskSavedView) => {
    const c = view.view_config;
    if (c.viewMode) setViewMode(c.viewMode as ViewMode);
    if (c.filterStatus) setFilterStatus(c.filterStatus as FilterStatus);
    if (c.sortBy) setSortBy(c.sortBy as SortBy);
    if (c.groupBy) setGroupBy(c.groupBy as GroupBy);
    if (c.search !== undefined) setSearch(c.search);
    if (c.ownerFilter) setOwnerFilter(c.ownerFilter as TaskOwnerFilter);
    if (Array.isArray(c.filterDealIds)) setFilterDealIds(new Set(c.filterDealIds));
    if (Array.isArray(c.filterLabelIds)) setFilterLabelIds(new Set(c.filterLabelIds));
    if (typeof c.urgentOnly === 'boolean') {
      setUrgentOnly(c.urgentOnly);
    } else if (Array.isArray(c.filterPriorities)) {
      // Back-compat: any priority preset that previously included 'urgent'
      // now maps to the simplified urgent-only flag; everything else is dropped.
      setUrgentOnly(c.filterPriorities.includes('urgent'));
    }
    if (typeof c.showAllDeals === 'boolean') {
      setShowAllDeals(c.showAllDeals);
    }
    if (c.filterDueDate) setFilterDueDate(c.filterDueDate as FilterDueDate);
    if (c.filterRecurring) setFilterRecurring(c.filterRecurring as FilterRecurring);
    toast.success(`Loaded view: ${view.name}`);
  };

  // ── Shareable preset links ────────────────────────────────────────────
  // Encode a preset's full config (plus name) into a URL-safe base64 token so
  // teammates can open the same filtered view directly via link, even if they
  // don't have it saved on their account.
  const encodePreset = useCallback((view: TaskSavedView): string => {
    const payload = { n: view.name, c: view.view_config };
    const json = JSON.stringify(payload);
    // base64url
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = new URL(window.location.origin + '/tasks');
    url.searchParams.set('preset', b64);
    return url.toString();
  }, []);

  const handleCopyPresetLink = useCallback(async (view: TaskSavedView) => {
    try {
      const link = encodePreset(view);
      await navigator.clipboard.writeText(link);
      toast.success('Preset link copied — share it with teammates');
    } catch {
      toast.error('Could not copy link');
    }
  }, [encodePreset]);

  // Auto-load shared preset from URL on mount
  const presetParamLoaded = useRef(false);
  useEffect(() => {
    if (presetParamLoaded.current) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('preset');
    if (!token) return;
    presetParamLoaded.current = true;
    try {
      const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(escape(atob(b64)));
      const payload = JSON.parse(json) as { n?: string; c?: TaskSavedView['view_config'] };
      if (payload?.c) {
        handleLoadView({
          id: 'shared-link',
          user_id: '',
          name: payload.n || 'Shared preset',
          view_config: payload.c,
          is_default: false,
          position: 0,
          created_at: '',
        });
      }
      // Clean the param from the URL (keep history clean, avoid re-triggering)
      params.delete('preset');
      const next = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', next);
    } catch {
      toast.error('That preset link looked invalid');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Determine which preset (if any) is currently active for highlight
  const activePresetId = useMemo(() => {
    for (const v of savedViews) {
      const c = v.view_config || {};
      if (
        (c.viewMode ?? viewMode) === viewMode &&
        (c.filterStatus ?? filterStatus) === filterStatus &&
        (c.sortBy ?? sortBy) === sortBy &&
        (c.groupBy ?? groupBy) === groupBy &&
        (c.search ?? search) === search &&
        (c.ownerFilter ?? ownerFilter) === ownerFilter &&
        (c.filterDueDate ?? filterDueDate) === filterDueDate &&
        (c.filterRecurring ?? filterRecurring) === filterRecurring &&
        JSON.stringify((c.filterDealIds ?? []).slice().sort()) === JSON.stringify(Array.from(filterDealIds).sort()) &&
        JSON.stringify((c.filterLabelIds ?? []).slice().sort()) === JSON.stringify(Array.from(filterLabelIds).sort())
      ) return v.id;
    }
    return null;
  }, [savedViews, viewMode, filterStatus, sortBy, groupBy, search, ownerFilter, filterDueDate, filterDealIds, filterLabelIds]);

  const handleExportCSV = () => {
    const headers = ['Title', 'Status', 'Priority', 'Due Date', 'Assignee', 'Created'];
    const rows = filtered.map(t => [
      t.title, t.status, t.priority, t.due_date || '',
      t.assignee_profile?.display_name || '', t.created_at.split('T')[0],
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

  // Overdue count for badge — shares the same boundaries as the grouped views
  // so the header summary always matches what's rendered below.
  const overdueCount = useMemo(() => {
    return tasks.filter(t => isOverdueFn(t.due_date, t.status, dueBoundaries)).length;
  }, [tasks, dueBoundaries]);

  // Focus mode
  if (showFocusMode) {
    return (
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading focus mode…</div>}>
        <TaskFocusMode
          tasks={filtered}
          onExit={() => setShowFocusMode(false)}
          onUpdate={(id, updates) => updateTaskWithUndo(id, updates)}
        />
      </Suspense>
    );
  }

  const viewTabs = [
    { key: 'list', label: 'List', icon: ListTodo, disabled: false },
    { key: 'board', label: 'Board', icon: LayoutGrid, disabled: false },
  ] as const;

  return (
    <>
      <Helmet><title>Tasks | 5thLine</title></Helmet>
      {/*
        Page surface — matches the Dashboard and Deals glass language:
        transparent base so the AppLayout's ambient backdrop shows through.
        Previously this used a hardcoded solid #0f1216 slab which made the
        Tasks page read as a flat, visually separate module from the rest
        of the platform. Keeping `flex flex-col h-full` preserves the
        existing internal layout/scroll behavior unchanged.
      */}
      <div className={cn("flex flex-col h-full bg-transparent", overlayMode && "tasks-reference-popup")}>
        {/*
          Header — title + muted summary + primary navigation.
          Layout zones (left | center-right tabs | reserved right gutter):
          the trailing `pr-16` reserves a guaranteed clear zone on the right
          edge so the page/modal close "X" (rendered by the shell above this
          surface) never sits on top of the rightmost tab ("Meeting Tasks")
          or the Claap routing badge. Tabs may shrink/scroll before they
          ever reach into this reserved gutter.
        */}
        <div className="flex items-center px-6 pt-5 pb-3 min-w-0 gap-3 flex-wrap border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <div className="min-w-0 shrink-0">
            <h1 className="text-[22px] font-semibold tracking-tight leading-none" style={{ color: '#eef1f6' }}>
              {ownerFilter === 'mine'
                ? 'My Tasks'
                : ownerFilter === 'all'
                  ? 'All Tasks'
                  : selectedTeammates.length === 1
                    ? `${(((selectedTeammates[0] as any).display_name) || (selectedTeammates[0] as any).email || 'Teammate')}'s Tasks`
                    : selectedTeammates.length > 1
                      ? `${selectedTeammates.length} Teammates' Tasks`
                      : 'Tasks'}
            </h1>
            <p className="mt-1.5 text-[12px] tabular-nums" style={{ color: '#8a93a6' }}>
              {(() => {
                const openCount = filtered.filter(t => t.status !== 'complete').length;
                const completedCount = filtered.filter(t => t.status === 'complete').length;
                const showingCompleted = filterStatus === 'all' || filterStatus === 'complete';
                return (
                  <>
                    <span>{openCount} open</span>
                    {showingCompleted && completedCount > 0 && (
                      <>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span style={{ color: '#7fc89a' }}>{completedCount} completed</span>
                      </>
                    )}
                    {overdueCount > 0 && (
                      <>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span style={{ color: '#ef8a8a' }}>{overdueCount} overdue</span>
                      </>
                    )}
                  </>
                );
              })()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-nowrap shrink-0">
          {/* Primary navigation tabs — List / Board */}
          <div
            className="flex items-center rounded-lg p-[3px] border flex-nowrap shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            {viewTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = viewMode === tab.key;
              const isDisabled = tab.disabled;
              return (
                <button
                  key={tab.key}
                  onClick={() => { if (!isDisabled) setViewMode(tab.key as ViewMode); }}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  tabIndex={isDisabled ? -1 : 0}
                  title={isDisabled ? 'Coming soon' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 px-3 h-[26px] text-[12px] font-medium rounded-md transition-all',
                    isDisabled && 'cursor-not-allowed opacity-40 pointer-events-none',
                  )}
                  style={{
                    backgroundColor: isActive && !isDisabled ? 'rgba(255,255,255,0.07)' : 'transparent',
                    color: isActive && !isDisabled ? '#eef1f6' : '#8a93a6',
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          {/* Meeting Tasks — last item in the tab rail, then transitions into controls */}
          <div className="shrink-0">
            <ClaapRoutingTasksBadge />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center h-8 w-[190px] px-3 rounded-md border text-[12px] text-[#b3bccc] justify-between"
                style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <span className="inline-flex items-center min-w-0">
                  <Users className="h-3 w-3 mr-1.5 shrink-0" />
                  <span className="truncate">
                    {ownerFilter === 'mine'
                      ? 'My tasks'
                      : ownerFilter === 'all'
                        ? 'All tasks'
                        : teammateLabel || 'Teammates'}
                  </span>
                </span>
                <ChevronDown className="h-3 w-3 opacity-60 shrink-0 ml-1" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1.5 z-[1400]">
              <button
                type="button"
                className={cn(
                  'flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-muted/50 text-left',
                  ownerFilter === 'mine' && 'bg-muted/40',
                )}
                onClick={() => setOwnerFilter('mine')}
              >
                My tasks
              </button>
              <button
                type="button"
                className={cn(
                  'flex items-center w-full px-2 py-1.5 text-xs rounded hover:bg-muted/50 text-left',
                  ownerFilter === 'all' && 'bg-muted/40',
                )}
                onClick={() => setOwnerFilter('all')}
              >
                All tasks
              </button>
              {allowedTeammates.length > 0 && (
                <>
                  <div className="mt-1.5 mb-1 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    5th Line teammates
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {allowedTeammates.map((p: any) => {
                      const isSelected = selectedTeammateIds.includes(p.user_id);
                      return (
                        <button
                          key={p.user_id}
                          type="button"
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted/50 text-left"
                          onClick={() => toggleTeammate(p.user_id)}
                        >
                          <Checkbox checked={isSelected} className="pointer-events-none h-3.5 w-3.5" />
                          <span className="truncate">{p.display_name || p.email}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
          <Select value={taskFilters.status} onValueChange={v => patchFilters({ status: v as FilterStatus })}>
            <SelectTrigger aria-label="Status: All" className="h-8 w-[110px] text-[12px] text-[#b3bccc]" style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <Filter className="h-3 w-3 mr-1.5" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All</SelectItem>
              <SelectItem value="incomplete" className="text-xs">Incomplete</SelectItem>
              <SelectItem value="complete" className="text-xs">Complete</SelectItem>
            </SelectContent>
          </Select>

          {/* Advanced filters collapsed behind a single entry point */}
          <Popover
            open={filtersOpen}
            onOpenChange={(open) => {
              setFiltersOpen(open);
              if (!open) setOpenInlineFilter(null);
            }}
            modal={true}
          >
            <PopoverTrigger asChild>
              {(() => {
                const activeCount = filterDealIds.size + filterLabelIds.size
                  + (urgentOnly ? 1 : 0)
                  + (filterRecurring !== 'all' ? 1 : 0)
                  + (filterDueDate !== 'all' ? 1 : 0);
                const isActive = activeCount > 0;
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12px] gap-1.5"
                    style={{
                      borderColor: isActive ? 'rgba(126,184,247,0.35)' : 'rgba(255,255,255,0.06)',
                      backgroundColor: 'rgba(255,255,255,0.025)',
                      color: isActive ? '#cfe3ff' : '#b3bccc',
                    }}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    Filters
                    {isActive && (
                      <span className="text-[10px] px-1.5 rounded-full tabular-nums min-w-[20px] text-center"
                        style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                        {activeCount}
                      </span>
                    )}
                  </Button>
                );
              })()}
            </PopoverTrigger>
            <PopoverContent
              className="w-[320px] p-3 space-y-3"
              align="end"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <InlineFilterSelect
                id="task-filters-due-date"
                label="Due date"
                value={taskFilters.dueDate}
                options={dueDateOptions}
                isOpen={openInlineFilter === 'dueDate'}
                onToggle={() => setOpenInlineFilter(current => current === 'dueDate' ? null : 'dueDate')}
                onSelect={(value) => patchFilters({ dueDate: value })}
              />
              <InlineFilterSelect
                id="task-filters-sort-by"
                label="Sort by"
                value={taskFilters.sortBy}
                options={sortByOptions}
                isOpen={openInlineFilter === 'sortBy'}
                onToggle={() => setOpenInlineFilter(current => current === 'sortBy' ? null : 'sortBy')}
                onSelect={(value) => patchFilters({ sortBy: value })}
              />
              <InlineFilterSelect
                id="task-filters-group-by"
                label="Group by"
                value={taskFilters.groupBy}
                options={groupByOptions}
                isOpen={openInlineFilter === 'groupBy'}
                onToggle={() => setOpenInlineFilter(current => current === 'groupBy' ? null : 'groupBy')}
                onSelect={(value) => patchFilters({ groupBy: value })}
              />
              <InlineFilterSelect
                id="task-filters-recurring"
                label="Recurring"
                value={taskFilters.recurring}
                options={recurringOptions}
                isOpen={openInlineFilter === 'recurring'}
                onToggle={() => setOpenInlineFilter(current => current === 'recurring' ? null : 'recurring')}
                onSelect={(value) => patchFilters({ recurring: value })}
              />
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Priority</label>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted"
                  onClick={() => patchFilters({ urgentOnly: !urgentOnly })}
                >
                  <Checkbox checked={urgentOnly} className="h-3.5 w-3.5" />
                  <span aria-hidden className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: URGENT_COLOR }} />
                  <span>Urgent only</span>
                </button>
              </div>
              {allDealOptions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Deals</label>
                    {filterDealIds.size > 0 && (
                      <button className="text-[10px] text-destructive hover:underline" onClick={() => patchFilters({ deals: [] })}>Clear</button>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
                    <Checkbox
                      checked={taskFilters.showClosedDeals}
                      onCheckedChange={(c) => patchFilters({ showClosedDeals: !!c })}
                      className="h-3.5 w-3.5"
                    />
                    Show all deals (incl. closed / on-hold)
                  </label>
                  <Input
                    value={dealFilterQuery}
                    onChange={(e) => setDealFilterQuery(e.target.value)}
                    placeholder="Search deals…"
                    className="h-7 text-xs"
                  />
                  <div className="max-h-[160px] overflow-auto rounded border border-white/[0.05]">
                    {(() => {
                      const q = dealFilterQuery.trim().toLowerCase();
                      const visible = allDealOptions.filter(([id, name]) =>
                        filterDealIds.has(id) || (!q || name.toLowerCase().includes(q))
                      );
                      if (visible.length === 0) return <div className="px-2 py-3 text-[11px] text-center text-muted-foreground">No deals match.</div>;
                      // Sort options alphabetically by deal name.
                      const sorted = [...visible].sort((a, b) => a[1].localeCompare(b[1]));
                      return sorted.map(([id, name]) => (
                        <button key={id} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted"
                          onClick={() => {
                            const next = new Set(filterDealIds);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            patchFilters({ deals: Array.from(next) });
                          }}>
                          <Checkbox checked={filterDealIds.has(id)} className="h-3.5 w-3.5" />
                          <span className="truncate">{name}</span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}
              {labels.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Labels</label>
                    {filterLabelIds.size > 0 && (
                      <button className="text-[10px] text-destructive hover:underline" onClick={() => setFilterLabelIds(new Set())}>Clear</button>
                    )}
                  </div>
                  <div className="max-h-[140px] overflow-auto rounded border border-white/[0.05]">
                    {labels.map(l => (
                      <button key={l.id} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted"
                        onClick={() => {
                          setFilterLabelIds(prev => {
                            const next = new Set(prev);
                            if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                            return next;
                          });
                        }}>
                        <Checkbox checked={filterLabelIds.has(l.id)} className="h-3.5 w-3.5" />
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        <span className="truncate">{l.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/[0.06]">
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => { clearAllFilters(); patchFilters({ search: '' }); setDealFilterQuery(''); }}
                >
                  Clear filters
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[11px] px-3"
                  onClick={() => setFiltersOpen(false)}
                >
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {(hasActiveFilters || taskFilters.search) && (
            <button
              type="button"
              onClick={() => { clearAllFilters(); patchFilters({ search: '' }); }}
              className="h-8 px-2 text-[11px] underline-offset-2 hover:underline shrink-0"
              style={{ color: '#ef8a8a' }}
              data-testid="clear-filters-link"
            >
              Clear filters
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.025)', color: '#b3bccc' }}>
                <Bookmark className="h-3 w-3" /> Presets
                {activePresetId && <span className="h-1.5 w-1.5 rounded-full bg-[#7eb8f7]" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[240px]">
              <DropdownMenuLabel className="text-xs">Saved presets</DropdownMenuLabel>
              {savedViews.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">None saved yet.</div>
              )}
              {savedViews.map(v => (
                <DropdownMenuItem
                  key={v.id}
                  className={cn("text-xs flex items-center justify-between gap-2", activePresetId === v.id && "bg-white/5")}
                  onClick={() => handleLoadView(v)}
                >
                  <span className="truncate flex-1">{v.name}</span>
                  <button onClick={e => { e.stopPropagation(); handleCopyPresetLink(v); }} className="text-muted-foreground hover:text-foreground" title="Copy link">
                    <Link2 className="h-3 w-3" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteView.mutate(v.id); }} className="text-muted-foreground hover:text-destructive" title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs gap-2" onClick={() => setShowSaveViewDialog(true)}>
                <BookmarkPlus className="h-3.5 w-3.5" /> Save current as preset
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedTaskIds.size > 0 && (
            <TaskBulkActionBar
              count={selectedTaskIds.size}
              teamMembers={teamMembers}
              onBulkUpdate={handleBulkUpdate}
              onBulkDelete={handleBulkDelete}
              onClear={() => setSelectedTaskIds(new Set())}
            />
          )}

        </div>
          <div className="shrink-0 flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant={similarMode ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-[12px]"
              title="Filter list to potentially similar tasks (fuzzy title + shared deal/contact/company)"
              onClick={() => setSimilarMode(v => !v)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{similarMode ? 'Exit similar' : 'Find similar'}</span>
            </Button>
            {undoStack.canUndo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-[12px]"
                title="Undo last action (⌘Z)"
                onClick={() => {
                  const action = undoStack.pop();
                  if (action) {
                    Promise.resolve(action.undo()).then(() => toast.success(`Undone: ${action.label}`));
                  }
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </Button>
            )}
            <HintTooltip
              hint="Click here to create a new task."
              visible={isHintVisible('tasks-add')}
              onDismiss={() => dismissHint('tasks-add')}
              side="bottom"
            >
              <Button
                type="button"
                variant="liquid-glass"
                size="sm"
                className="gap-2"
                onClick={(e) => {
                  quickCreateTriggerRef.current = e.currentTarget as HTMLElement;
                  setShowQuickCreate(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add Task</span>
              </Button>
            </HintTooltip>
          </div>
        </div>

        {/*
          Two-column body — mirrors the Deal Rundown popup structure:
          left 65% = full task list (tabs, filters, presets, grouped
          sections); right 35% = inline detail panel for the selected
          task. The right panel always renders so a clean empty state
          shows when nothing is selected, instead of collapsing.
        */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col w-[65%] min-w-0 h-full border-r" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>

        {/* Search row — full-width, just below the toolbar (per redesign spec) */}
        <div className="px-6 pt-2 pb-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: '#94a3b8' }} />
            <Input
              value={taskFilters.search}
              onChange={e => patchFilters({ search: e.target.value })}
              placeholder="Search tasks or deals…"
              className="h-9 text-[12px] pl-9 text-white placeholder:text-[#94a3b8] w-full rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
            />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {hasActiveFilters && (
            <div
              className="flex items-center gap-1.5 px-6 py-2 flex-wrap border-b"
              style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.015)' }}
              data-testid="applied-filters-row"
            >
              <span className="text-[10px] uppercase tracking-wide" style={{ color: '#8a93a6' }}>Active:</span>
              {filterStatus !== 'incomplete' && (
                <FilterChip label={`Status: ${STATUS_LABELS[filterStatus]}`} onClear={() => setFilterStatus('incomplete')} />
              )}
              {filterDueDate !== 'all' && (
                <FilterChip label={DUE_LABELS[filterDueDate]} onClear={() => setFilterDueDate('all')} />
              )}
              {urgentOnly && (
                <FilterChip label="Priority: Urgent" onClear={() => setUrgentOnly(false)} />
              )}
              {Array.from(filterDealIds).map(id => {
                const name = allDealOptions.find(([d]) => d === id)?.[1]
                  || uniqueDeals.find(([d]) => d === id)?.[1] || 'Deal';
                return (
                  <FilterChip key={id} label={`Deal: ${name}`} onClear={() => {
                    setFilterDealIds(prev => { const n = new Set(prev); n.delete(id); return n; });
                  }} />
                );
              })}
              {Array.from(filterLabelIds).map(id => {
                const lbl = labels.find(l => l.id === id);
                return (
                  <FilterChip key={id} label={`Label: ${lbl?.name || 'Label'}`} onClear={() => {
                    setFilterLabelIds(prev => { const n = new Set(prev); n.delete(id); return n; });
                  }} />
                );
              })}
              {filterRecurring !== 'all' && (
                <FilterChip label={filterRecurring === 'recurring' ? 'Recurring only' : 'Paused only'} onClear={() => setFilterRecurring('all')} />
              )}
              <button
                onClick={clearAllFilters}
                className="ml-1 text-[11px] underline-offset-2 hover:underline"
                style={{ color: '#ef8a8a' }}
                data-testid="clear-all-filters"
              >
                Clear all
              </button>
            </div>
          )}
           <div className="overflow-auto h-full">
            {similarMode && (
              <div
                className="flex items-center justify-between gap-3 px-6 py-2 border-b text-[12px]"
                style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)', color: '#c8cfdd' }}
              >
                <span>
                  <Sparkles className="inline h-3 w-3 mr-1.5 -mt-0.5" />
                  {similarOrdered.length > 0
                    ? <>Showing {similarOrdered.length} potentially similar tasks in {similarGroups.length} group{similarGroups.length === 1 ? '' : 's'}.</>
                    : <>No potentially similar tasks in the current view.</>}
                </span>
                <button
                  onClick={() => setSimilarMode(false)}
                  className="text-[11px] underline-offset-2 hover:underline"
                  style={{ color: '#94a3b8' }}
                >
                  Exit
                </button>
              </div>
            )}
            {(viewMode === 'list' || viewMode === 'focus') && (
              <TaskListView
                tasks={listTasks}
                statusGroups={statusGroups}
                isLoading={isLoading}
                isCreating={isCreating}
                newTaskTitle={newTaskTitle}
                newTaskRef={newTaskRef}
                onNewTaskChange={(v) => { setNewTaskTitle(v); setTaskNameWarning(''); setTaskNameConfirmed(false); }}
                onNewTaskKeyDown={handleNewTaskKeyDown}
                onNewTaskCreate={handleCreateTask}
                onCancelCreate={() => { setIsCreating(false); setNewTaskTitle(''); setTaskNameWarning(''); setTaskNameConfirmed(false); }}
                taskNameWarning={taskNameWarning}
                onSelectTask={(id) => { setDetailDismissed(false); setSelectedTaskId(id); }}
                onUpdateTask={(id, updates) => updateTaskWithUndo(id, updates)}
                onDeleteTask={id => handleDeleteWithUndo(id)}
                selectedTaskId={selectedTaskId}
                groupBy={viewMode === 'focus' ? 'focus' : 'none'}
                selectedTaskIds={selectedTaskIds}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                onToggleStar={handleToggleStar}
                focusedTaskIndex={focusedTaskIndex}
                visibleColumnIds={effectiveVisibleTaskColumns}
              />
            )}
            {viewMode === 'board' && (
              <TaskBoardView
                tasks={listTasks}
                statusGroups={allBoardColumns}
                onSelectTask={(id) => { setDetailDismissed(false); setSelectedTaskId(id); }}
                onUpdateTask={(id, updates) => updateTaskWithUndo(id, updates)}
                onCreateTask={(title, status) => createTask.mutate({ title, status })}
                selectedTaskId={selectedTaskId}
                onAddSection={handleAddSection}
                onRemoveSection={handleRemoveSection}
                customSectionKeys={customSections.map(s => s.key)}
              />
            )}
            {viewMode === 'calendar' && (
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading calendar…</div>}>
                <TaskCalendarView
                  tasks={listTasks}
                  onSelectTask={(id) => { setDetailDismissed(false); setSelectedTaskId(id); }}
                  onUpdateTask={(id, updates) => updateTaskWithUndo(id, updates)}
                  selectedTaskId={selectedTaskId}
                />
              </Suspense>
            )}
            {viewMode === 'reporting' && (
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading reports…</div>}>
                <TaskReportingView tasks={tasks} />
              </Suspense>
            )}
          </div>
        </div>
        </div>
        {/* Right column — inline task detail (35%). Always rendered so
            the panel does not collapse when nothing is selected. */}
        <div className="w-[35%] min-w-[320px] h-full flex flex-col overflow-hidden bg-transparent">
          {selectedTask ? (
            <TaskDetailDrawer
              task={selectedTask}
              onClose={() => { setDetailDismissed(true); setSelectedTaskId(null); }}
              onUpdate={(updates) => updateTask.mutate({ id: selectedTask.id, ...updates })}
              onDelete={() => { handleDeleteWithUndo(selectedTask.id); setSelectedTaskId(null); }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <ClipboardList className="h-6 w-6" style={{ color: '#8a93a6' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: '#eef1f6' }}>No task selected</p>
              <p className="text-xs mt-1.5 max-w-xs" style={{ color: '#8a93a6' }}>
                Select a task from the list to view its status, priority, assignee, subtasks, and details.
              </p>
            </div>
          )}
        </div>
        </div>

        {/* Save View Dialog */}
        <Dialog open={showSaveViewDialog} onOpenChange={setShowSaveViewDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Save Filter Preset</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Preset name</label>
                  <button
                    type="button"
                    onClick={() => setNewViewName(suggestPresetName())}
                    className="text-[10px] font-medium text-primary hover:underline"
                    title="Generate a name from the current filters"
                  >
                    Suggest from filters
                  </button>
                </div>
                <Input
                  value={newViewName}
                  onChange={e => setNewViewName(e.target.value)}
                  placeholder="e.g. My overdue deal tasks"
                  className="text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); }}
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div className="text-[11px] text-muted-foreground space-y-0.5 rounded-md p-2.5" style={{ backgroundColor: 'rgba(20,24,32,0.6)' }}>
                <p className="font-medium text-foreground mb-1">This preset will remember:</p>
                <p>• Search: {search ? `"${search}"` : '—'}</p>
                <p>• Assignee scope: {ownerFilter}</p>
                <p>• Status: {filterStatus}</p>
                <p>• Due date: {filterDueDate}</p>
                <p>• Type / Deals: {filterDealIds.size > 0 ? `${filterDealIds.size} selected` : 'all'}</p>
                <p>• Labels: {filterLabelIds.size > 0 ? `${filterLabelIds.size} selected` : 'all'}</p>
                <p>• Group by: {groupBy} · Sort by: {sortBy}</p>
                <p>• View: {viewMode}</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSaveViewDialog(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveView} disabled={!newViewName.trim()}>Save preset</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Quick-create task dialog */}
        <QuickCreateTaskDialog
          open={showQuickCreate}
          onClose={() => {
            setShowQuickCreate(false);
            // Restore keyboard focus to the trigger that opened the dialog
            requestAnimationFrame(() => quickCreateTriggerRef.current?.focus());
          }}
          teamMembers={teamMembers}
          currentUserId={user?.id || ''}
          onCreate={async (input) => {
            const created = await createTask.mutateAsync({
              title: input.title,
              priority: input.priority,
              due_date: input.due_date || undefined,
              status: input.status,
              assigned_to: input.assigned_to,
              recurrence_rule: input.recurrence_rule,
              recurrence_end_date: input.recurrence_end_date,
              deal_id: input.deal_id || undefined,
            });
            toast.success(`Task created: "${input.title}"`);
            const newId = (created as { id?: string } | null)?.id;
            // Fire-and-forget duplicate check for the new task — results stream
            // into the drawer panel via realtime. Errors here are non-fatal
            // (the DB trigger also runs as a backup).
            if (newId) {
              supabase.functions.invoke('task-duplicate-check', { body: { task_id: newId } })
                .catch(err => console.warn('[task-duplicate-check] post-create check failed', err));
              // Open the detail drawer so the user can review duplicates before
              // moving on. Falls back to focus restore if the row never mounts.
              setSelectedTaskId(newId);
            }
            if (newId) {
              const tryFocus = (attempt = 0) => {
                const el = document.querySelector<HTMLElement>(`[data-task-id="${newId}"]`);
                if (el) {
                  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  el.focus({ preventScroll: true });
                } else if (attempt < 10) {
                  setTimeout(() => tryFocus(attempt + 1), 60);
                } else {
                  // Fallback: restore focus to the trigger
                  quickCreateTriggerRef.current?.focus();
                }
              };
              requestAnimationFrame(() => tryFocus());
            }
          }}
        />
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

  const STATUS_COLORS: Record<string, string> = {
    not_started: '#6b7280',
    in_progress: '#3b7eff',
    blocked: '#ff4d4d',
    complete: '#22c55e',
  };

  const PRIORITY_PILL: Record<string, { label: string; bg: string }> = {
    urgent: { label: 'Urgent', bg: '#ff4d4d' },
    high: { label: 'High', bg: '#ff4d4d' },
    medium: { label: 'Medium', bg: '#f59e0b' },
    low: { label: 'Low', bg: '#6b7280' },
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const group of statusGroups) {
      map[group.key] = tasks.filter(t => t.status === group.key).sort((a, b) => a.position - b.position);
    }
    return map;
  }, [tasks, statusGroups]);

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
  const handleDragOver = (event: DragOverEvent) => {};

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !active) return;
    const activeTaskId = active.id as string;
    const task = tasks.find(t => t.id === activeTaskId);
    if (!task) return;
    const overId = over.id as string;
    let targetStatus: string;
    let overTask: Task | undefined;
    const isColumn = statusGroups.some(g => g.key === overId);
    if (isColumn) { targetStatus = overId; } else { overTask = tasks.find(t => t.id === overId); targetStatus = overTask?.status || task.status; }
    const sourceStatus = task.status;
    const targetTasks = tasksByStatus[targetStatus] || [];
    if (sourceStatus === targetStatus) {
      if (!overTask || activeTaskId === overId) return;
      const oldIndex = targetTasks.findIndex(t => t.id === activeTaskId);
      const newIndex = targetTasks.findIndex(t => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(targetTasks, oldIndex, newIndex);
      reordered.forEach((t, i) => { if (t.position !== i) onUpdateTask(t.id, { position: i }); });
    } else {
      let newPosition = overTask ? targetTasks.findIndex(t => t.id === overId) : targetTasks.length;
      if (newPosition < 0) newPosition = targetTasks.length;
      targetTasks.forEach((t, i) => { if (i >= newPosition) onUpdateTask(t.id, { position: i + 1 }); });
      onUpdateTask(activeTaskId, { status: targetStatus, position: newPosition });
    }
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) { setIsAddingSection(false); return; }
    onAddSection(newSectionName.trim());
    setNewSectionName('');
    setIsAddingSection(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 p-4 overflow-x-auto h-full">
        {statusGroups.map(group => {
          const groupTasks = tasksByStatus[group.key] || [];
          return (
            <BoardColumn
              key={group.key}
              groupKey={group.key}
              label={group.label}
              tasks={groupTasks}
              statusColor={STATUS_COLORS[group.key] || '#6b7280'}
              priorityPill={PRIORITY_PILL}
              todayStr={todayStr}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              onCreateTask={onCreateTask}
              isCustom={customSectionKeys.includes(group.key)}
              onRemove={() => onRemoveSection(group.key)}
            />
          );
        })}
        {isAddingSection ? (
          <div className="flex flex-col min-w-[280px] w-[280px] rounded-xl" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}>
            <div className="px-3 py-2.5 border-b" style={{ borderColor: '#2a2f3e' }}>
              <Input ref={sectionInputRef} value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSection(); } if (e.key === 'Escape') { setIsAddingSection(false); setNewSectionName(''); } }}
                onBlur={handleAddSection} placeholder="Section name..." className="h-8 text-sm" autoFocus />
            </div>
          </div>
        ) : (
          <button onClick={() => { setIsAddingSection(true); setNewSectionName(''); }}
            className="flex flex-col items-center justify-center min-w-[280px] w-[280px] rounded-xl border border-dashed transition-colors gap-2"
            style={{ borderColor: '#2a2f3e', color: '#8b92a5' }}>
            <Plus className="h-5 w-5" />
            <span className="text-sm">Add Section</span>
          </button>
        )}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="rounded-xl p-4 shadow-lg w-[260px]" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}>
            <p className="text-sm font-semibold" style={{ color: 'white' }}>{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableBoardCard({ task, priorityPill, todayStr, selectedTaskId, onSelectTask }: {
  task: Task;
  priorityPill: Record<string, { label: string; bg: string }>;
  todayStr: string;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const isOverdue = task.due_date && task.due_date < todayStr && task.status !== 'complete';
  const daysOverdue = isOverdue ? Math.ceil((new Date(todayStr).getTime() - new Date(task.due_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isDueToday = task.due_date === todayStr && task.status !== 'complete';
  const pill = priorityPill[task.priority] || priorityPill.medium;

  const getRelativeDate = () => {
    if (!task.due_date) return null;
    if (isOverdue) return { text: `${daysOverdue}d overdue`, color: '#ff4d4d' };
    if (isDueToday) return { text: 'Due today', color: '#f59e0b' };
    const daysUntil = Math.ceil((new Date(task.due_date + 'T00:00:00').getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24));
    return { text: `Due in ${daysUntil}d`, color: '#8b92a5' };
  };

  const relDate = getRelativeDate();

  return (
    <div ref={setNodeRef}
      style={{ ...style, backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}
      className={cn('rounded-xl p-4 cursor-pointer transition-all', selectedTaskId === task.id && 'ring-1 ring-[#3b7eff]')}
      onClick={() => onSelectTask(task.id)}
      {...attributes} {...listeners}
    >
      {/* Top row: title + priority */}
      <div className="flex items-start justify-between gap-2">
        <p className={cn('text-[15px] font-semibold flex-1', task.status === 'complete' && 'line-through')} style={{ color: 'white' }}>
          {task.title}
        </p>
        <span className="text-[10px] px-3 py-1 rounded-full shrink-0 font-medium" style={{ backgroundColor: pill.bg, color: 'white' }}>
          {pill.label}
        </span>
      </div>
      {/* Middle: deal chip */}
      {task.deal_id && task.deal?.company && (
        <Link to={`/deal/${task.deal_id}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold mt-2 hover:brightness-125 transition-all" style={{ backgroundColor: 'rgba(30,58,95,0.6)', color: '#93c5fd' }} onClick={e => e.stopPropagation()}>
          <Building2 className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.deal.company}</span>
        </Link>
      )}
      {/* Bottom: avatar + date */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          {task.assignee_profile && (
            <>
              <div className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: '#3b7eff', color: 'white' }}>
                {task.assignee_profile.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-[11px]" style={{ color: '#8b92a5' }}>
                {task.assignee_profile.display_name?.split(' ')[0]}
              </span>
            </>
          )}
        </div>
        {relDate && (
          <span className="text-[11px] font-medium" style={{ color: relDate.color }}>{relDate.text}</span>
        )}
      </div>
    </div>
  );
}

// ── Saved-preset chip with inline rename + duplicate + delete ───────────────
function PresetChip({
  view, isActive, onLoad, onRename, onDuplicate, onDelete, onCopyLink, onTogglePin,
}: {
  view: TaskSavedView;
  isActive: boolean;
  onLoad: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onTogglePin: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(view.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (!menuOpen) { setRenaming(false); setConfirmDelete(false); setDraftName(view.name); } }, [menuOpen, view.name]);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== view.name) onRename(trimmed);
    setRenaming(false);
    setMenuOpen(false);
  };

  return (
    <div className="group flex items-stretch rounded-md overflow-hidden"
      style={{
        backgroundColor: isActive ? 'rgba(126,184,247,0.12)' : 'rgba(20,24,32,0.65)',
        border: `1px solid ${isActive ? 'rgba(126,184,247,0.28)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {view.pinned_at && (
        <span
          className="flex items-center justify-center pl-1.5"
          style={{ color: '#e8c46c' }}
          title="Pinned preset"
        >
          <Pin className="h-2.5 w-2.5" />
        </span>
      )}
      <button
        onClick={onLoad}
        onDoubleClick={() => { setMenuOpen(true); setRenaming(true); }}
        className={`flex items-center gap-1.5 h-7 ${view.pinned_at ? 'pl-1' : 'pl-2.5'} pr-2 text-[11px] font-medium transition-colors`}
        style={{ color: isActive ? '#cfe3ff' : '#9aa3b6' }}
        title="Load preset · double-click to rename"
      >
        <Bookmark className="h-3 w-3" />
        <span className="max-w-[160px] truncate">{view.name}</span>
      </button>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            className="px-1.5 h-7 flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: '#7a8194', borderLeft: '1px solid rgba(255,255,255,0.05)' }}
            title="Preset actions"
          >
            <MoreVertical className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-56 p-2 border"
          style={{ backgroundColor: '#12151b', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {renaming ? (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Rename preset</label>
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                    if (e.key === 'Escape') { setRenaming(false); setDraftName(view.name); }
                  }}
                  className="h-7 text-xs"
                />
                <Button size="sm" className="h-7 px-2" onClick={commitRename} disabled={!draftName.trim() || draftName.trim() === view.name}>
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : confirmDelete ? (
            <div className="space-y-2">
              <p className="text-[11px]" style={{ color: '#eef1f6' }}>Delete preset <span className="font-semibold">"{view.name}"</span>?</p>
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button size="sm" className="h-7 text-[11px] bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { onDelete(); setMenuOpen(false); }}>Delete</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => { onTogglePin(); setMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#eef1f6' }}
              >
                {view.pinned_at
                  ? (<><PinOff className="h-3 w-3" /> Unpin from bar</>)
                  : (<><Pin className="h-3 w-3" /> Pin to bar</>)}
              </button>
              <button
                onClick={() => setRenaming(true)}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#eef1f6' }}
              >
                <Pencil className="h-3 w-3" /> Rename
              </button>
              <button
                onClick={() => { onDuplicate(); setMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#eef1f6' }}
              >
                <CopyIcon className="h-3 w-3" /> Duplicate
              </button>
              <button
                onClick={() => { onCopyLink(); setMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] hover:bg-[rgba(255,255,255,0.04)]"
                style={{ color: '#eef1f6' }}
              >
                <Link2 className="h-3 w-3" /> Copy preset link
              </button>
              <div className="my-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] hover:bg-[rgba(229,115,115,0.08)]"
                style={{ color: '#e57373' }}
              >
                <X className="h-3 w-3" /> Delete preset
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function BoardColumn({ groupKey, label, tasks: groupTasks, statusColor, priorityPill, todayStr, selectedTaskId, onSelectTask, onCreateTask, isCustom, onRemove }: {
  groupKey: string;
  label: string;
  tasks: Task[];
  statusColor: string;
  priorityPill: Record<string, { label: string; bg: string }>;
  todayStr: string;
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

  const startAdding = () => { setIsAdding(true); setNewTitle(''); setTimeout(() => inputRef.current?.focus(), 50); };
  const handleSubmit = () => { if (!newTitle.trim()) { setIsAdding(false); return; } onCreateTask(newTitle.trim(), groupKey); setNewTitle(''); setTimeout(() => inputRef.current?.focus(), 50); };
  const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } if (e.key === 'Escape') { setIsAdding(false); setNewTitle(''); } };

  return (
    <div className={cn('flex flex-col min-w-[280px] w-[280px] rounded-xl transition-colors', isOver && 'ring-1 ring-[#3b7eff]/30')}
      style={{ backgroundColor: '#0d1117', border: '1px solid #2a2f3e' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #2a2f3e' }}>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
          <span className="text-sm font-semibold" style={{ color: 'white' }}>{label}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: statusColor + '20', color: statusColor }}>
            {groupTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isCustom && onRemove && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}><Trash2 className="h-3 w-3" style={{ color: '#8b92a5' }} /></Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startAdding}><Plus className="h-3.5 w-3.5" style={{ color: '#8b92a5' }} /></Button>
        </div>
      </div>
      <div ref={setNodeRef} className="flex-1 overflow-auto p-3 space-y-2 min-h-[60px]">
        {isAdding && (
          <div className="rounded-xl p-3" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}>
            <Input ref={inputRef} value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={handleKeyDown} onBlur={handleSubmit}
              placeholder="Task name..." className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent text-white" />
          </div>
        )}
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {groupTasks.map(task => (
            <SortableBoardCard key={task.id} task={task} priorityPill={priorityPill} todayStr={todayStr} selectedTaskId={selectedTaskId} onSelectTask={onSelectTask} />
          ))}
        </SortableContext>
        {/* Board column inline "+ Add task" removed — use the column header "+" button. Subtask 2. */}
      </div>
    </div>
  );
}
