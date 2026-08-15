import { useState, useMemo, useEffect } from 'react';
import { SharedTaskDrawer } from '@/components/tasks/SharedTaskDrawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Plus, Trash2, CalendarIcon, CheckCircle2, Clock, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { useDealTasks } from '@/hooks/useDealTasks';
import { isTaskCompleted, TASK_STATUS_COMPLETE, TASK_STATUS_REOPENED } from '@/lib/taskCache';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { useDealManagerId } from '@/hooks/useDealManagerId';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DealTasksPanelProps {
  dealId: string;
}

export function DealTasksPanel({ dealId }: DealTasksPanelProps) {
  const { user } = useAuth();
  const { tasks, isLoading, createTask, updateTaskStatus, deleteTask } = useDealTasks(dealId);
  const teamMembers = useTeamMembers();
  const dealManagerId = useDealManagerId(dealId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Deep link: read ?task=<id> from the *real* browser URL once on mount.
  // We deliberately do NOT use react-router's useSearchParams here because
  // this panel renders inside the deal overlay's synthetic <Routes location>,
  // and setSearchParams from that context navigates the outer router to a
  // path it doesn't know (`/deals/__overlay/:id`) → 404. Local state +
  // window.history.replaceState keeps the URL pretty without re-routing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('task');
    if (t) setOpenTaskId(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const writeTaskParam = (id: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('task', id);
    else url.searchParams.delete('task');
    window.history.replaceState(window.history.state, '', url.toString());
  };

  const handleOpenTask = (id: string) => {
    setOpenTaskId(id);
    writeTaskParam(id);
  };

  const handleCloseTask = () => {
    setOpenTaskId(null);
    writeTaskParam(null);
  };
  const [isOpen, setIsOpen] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'incomplete' | 'completed'>('incomplete');
  const [searchQuery, setSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Default task owner to the deal's Deal Manager (fallback: self) when
  // the create dialog opens and no assignee has been manually picked yet.
  useEffect(() => {
    if (!isCreateOpen) return;
    if (assignedTo) return;
    const fallback = dealManagerId || user?.id || '';
    if (fallback) setAssignedTo(fallback);
  }, [isCreateOpen, dealManagerId, user?.id, assignedTo]);
  
  const memberMap = useMemo(() => {
    const map = new Map<string, TeamMember>();
    teamMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [teamMembers]);

  const resetForm = () => { setTitle(''); setDescription(''); setDueDate(''); setAssignedTo(''); };

  const handleCreate = async () => {
    if (!title.trim() || !assignedTo) return;
    setIsSubmitting(true);
    const result = await createTask({ title: title.trim(), description: description.trim(), due_date: dueDate || undefined, assigned_to: assignedTo });
    setIsSubmitting(false);
    if (result) {
      const member = memberMap.get(assignedTo);
      toast.success(`Task assigned to ${member?.display_name || 'team member'}`);
      resetForm(); setIsCreateOpen(false);
    } else { toast.error('Failed to create task'); }
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    // Canonical literals so the same task row reads as completed from
    // every surface (Tasks page, rundowns, dashboard widgets).
    const newStatus = isTaskCompleted({ status: currentStatus })
      ? TASK_STATUS_REOPENED
      : TASK_STATUS_COMPLETE;
    const ok = await updateTaskStatus(taskId, newStatus);
    if (!ok) toast.error('Failed to update task');
  };

  const handleDelete = async (taskId: string) => {
    const ok = await deleteTask(taskId);
    if (ok) { toast.success('Task deleted'); } else { toast.error('Failed to delete task'); }
  };

  const pendingTasks = tasks.filter(t => !isTaskCompleted(t));
  const completedTasks = tasks.filter(t => isTaskCompleted(t));

  const displayedTasks = (statusFilter === 'incomplete' ? pendingTasks : completedTasks).filter(t => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return `${t.title || ''} ${t.description || ''}`.toLowerCase().includes(q);
  });

  const getInitials = (member: TeamMember | undefined) => {
    if (!member) return '?';
    return (member.display_name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  };

  return (
    <>
      <Card className="h-full w-full flex flex-col">
        {/* ── Header ── fixed height, vertically centered */}
        <CardHeader className="flex flex-row items-center justify-between min-h-[44px] h-[44px] py-0 px-4 space-y-0 shrink-0 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setIsOpen(o => !o)}>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Tasks
            {pendingTasks.length > 0 && !isOpen && (
              <Badge variant="secondary" className="text-[10px] h-5 font-normal">{pendingTasks.length} open</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <ToggleGroup
              type="single"
              value={statusFilter}
              onValueChange={(v) => v && setStatusFilter(v as 'incomplete' | 'completed')}
            >
              <ToggleGroupItem value="incomplete" className="text-[10px] h-6 px-2">Incomplete</ToggleGroupItem>
              <ToggleGroupItem value="completed" className="text-[10px] h-6 px-2">Complete</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" variant="outline" onClick={() => setIsCreateOpen(true)} className="h-7 gap-1 text-xs px-2">
              <Plus className="h-3 w-3" /> Add
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setIsOpen(o => !o)}>
              {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardHeader>

        {/* ── Body ── flex-1 so it fills remaining card height */}
        {isOpen && (
          <CardContent className="flex-1 flex flex-col px-4 pb-4 pt-0 space-y-3 min-h-0">
            {/* Search row — mirrors the Outstanding Items search bar (size + offset)
                so the first task tile lines up with the first outstanding item tile. */}
            <div className="shrink-0 pt-2 pb-[30px]">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery(''); }}
                  className="h-8 w-full pl-7 text-xs"
                />
              </div>
            </div>
            {isLoading && tasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Loading tasks…</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">No tasks yet</p>
              </div>
            ) : displayedTasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No tasks match this filter.</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 pr-2">
                  {displayedTasks.map(task => {
                    const assignee = memberMap.get(task.assigned_to);
                    const isCompleted = isTaskCompleted(task);
                    // Parse date-only strings ("YYYY-MM-DD") as local midnight to
                    // avoid the UTC→local shift that made Jul 15 render as Jul 14.
                    const parseDueDate = (v: string) => {
                      const s = String(v);
                      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
                    };
                    const dueDateObj = task.due_date ? parseDueDate(task.due_date) : null;
                    const isOverdue = !isCompleted && !!dueDateObj && dueDateObj < new Date();
                    return (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenTask(task.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleOpenTask(task.id); }}
                        className={cn(
                          "flex items-center gap-3 group rounded-lg border p-3 transition-colors cursor-pointer",
                          isCompleted
                            ? "border-border/50 opacity-60 hover:opacity-100"
                            : isOverdue
                              ? "border-destructive hover:bg-muted/30"
                              : "border-border hover:bg-muted/30"
                        )}
                      >
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={isCompleted} onCheckedChange={() => handleToggleStatus(task.id, task.status)} className="shrink-0" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium truncate", isCompleted ? "text-muted-foreground line-through" : "text-foreground")}>{task.title}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-nowrap overflow-hidden">
                            {assignee && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Avatar className="h-4 w-4">
                                  <AvatarImage src={assignee.avatar_url || undefined} />
                                  <AvatarFallback className="text-[8px]">{getInitials(assignee)}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground">{assignee.display_name}</span>
                              </div>
                            )}
                            {task.due_date && dueDateObj && (
                              <div className={cn("flex items-center gap-1 text-xs shrink-0", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                                <CalendarIcon className="h-3 w-3" />
                                {format(dueDateObj, 'MMM d, yyyy')}
                              </div>
                            )}
                            {!isCompleted && task.status === 'in_progress' && (
                              <span className="flex items-center gap-1 text-xs text-primary shrink-0">
                                <Clock className="h-3 w-3" /> In Progress
                              </span>
                            )}
                            {!isCompleted && task.description && (
                              <span className="text-xs text-muted-foreground truncate">{task.description}</span>
                            )}
                          </div>
                        </div>
                        {task.assigned_by === user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        )}

        {/* Collapsed spacer — keeps card at full grid height even when collapsed */}
        {!isOpen && <div className="flex-1" />}
      </Card>

      {/* Create Task Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-task-title" className="text-xs">Task title</Label>
              <Input id="new-task-title" placeholder="e.g. Review the latest financials" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="new-task-assignee" className="text-xs">Assign to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5"><AvatarImage src={member.avatar_url || undefined} /><AvatarFallback className="text-[8px]">{getInitials(member)}</AvatarFallback></Avatar>
                        {member.display_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-task-desc" className="text-xs">Description (optional)</Label>
              <Textarea id="new-task-desc" placeholder="Add any extra details…" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 min-h-[60px]" />
            </div>
            <div>
              <Label htmlFor="new-task-due" className="text-xs">Due date (optional)</Label>
              <Input id="new-task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetForm(); setIsCreateOpen(false); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || !assignedTo || isSubmitting}>{isSubmitting ? 'Creating…' : 'Create Task'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SharedTaskDrawer taskId={openTaskId} onClose={handleCloseTask} />
    </>
  );
}
