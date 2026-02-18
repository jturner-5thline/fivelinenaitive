import { useState, useMemo } from 'react';
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
import { Plus, Trash2, CalendarIcon, CheckCircle2, Circle, Clock } from 'lucide-react';
import { useDealTasks } from '@/hooks/useDealTasks';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Build a lookup for team member display names
  const memberMap = useMemo(() => {
    const map = new Map<string, TeamMember>();
    teamMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [teamMembers]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setAssignedTo('');
  };

  const handleCreate = async () => {
    if (!title.trim() || !assignedTo) return;
    setIsSubmitting(true);
    const result = await createTask({
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate || undefined,
      assigned_to: assignedTo,
    });
    setIsSubmitting(false);
    if (result) {
      const member = memberMap.get(assignedTo);
      toast.success(`Task assigned to ${member?.display_name || 'team member'}`);
      resetForm();
      setIsCreateOpen(false);
    } else {
      toast.error('Failed to create task');
    }
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    const ok = await updateTaskStatus(taskId, newStatus);
    if (!ok) toast.error('Failed to update task');
  };

  const handleDelete = async (taskId: string) => {
    const ok = await deleteTask(taskId);
    if (ok) {
      toast.success('Task deleted');
    } else {
      toast.error('Failed to delete task');
    }
  };

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const getInitials = (member: TeamMember | undefined) => {
    if (!member) return '?';
    return (member.display_name || '')
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Tasks</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Task
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet. Create one to get started.</p>
        ) : (
          <div className="space-y-4">
            {pendingTasks.length > 0 && (
              <div className="space-y-2">
                {pendingTasks.map(task => {
                  const assignee = memberMap.get(task.assigned_to);
                  const assigner = memberMap.get(task.assigned_by);
                  return (
                    <div key={task.id} className="flex items-start gap-3 group rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => handleToggleStatus(task.id, task.status)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {assignee && (
                            <div className="flex items-center gap-1.5">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={assignee.avatar_url || undefined} />
                                <AvatarFallback className="text-[8px]">{getInitials(assignee)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">{assignee.display_name}</span>
                            </div>
                          )}
                          {task.due_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarIcon className="h-3 w-3" />
                              {format(new Date(task.due_date), 'MMM d, yyyy')}
                            </div>
                          )}
                          {task.status === 'in_progress' && (
                            <span className="flex items-center gap-1 text-xs text-primary">
                              <Clock className="h-3 w-3" />
                              In Progress
                            </span>
                          )}
                        </div>
                      </div>
                      {task.assigned_by === user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {completedTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed ({completedTasks.length})</p>
                {completedTasks.map(task => {
                  const assignee = memberMap.get(task.assigned_to);
                  return (
                    <div key={task.id} className="flex items-start gap-3 group rounded-lg border border-border/50 p-3 opacity-60 hover:opacity-100 transition-opacity">
                      <Checkbox
                        checked={true}
                        onCheckedChange={() => handleToggleStatus(task.id, task.status)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground line-through">{task.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {assignee && (
                            <div className="flex items-center gap-1.5">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={assignee.avatar_url || undefined} />
                                <AvatarFallback className="text-[8px]">{getInitials(assignee)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">{assignee.display_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {task.assigned_by === user?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Create Task Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-task-title" className="text-xs">Task title</Label>
              <Input
                id="new-task-title"
                placeholder="e.g. Review the latest financials"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="new-task-assignee" className="text-xs">Assign to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-[8px]">{getInitials(member)}</AvatarFallback>
                        </Avatar>
                        {member.display_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-task-desc" className="text-xs">Description (optional)</Label>
              <Textarea
                id="new-task-desc"
                placeholder="Add any extra details…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 min-h-[60px]"
              />
            </div>
            <div>
              <Label htmlFor="new-task-due" className="text-xs">Due date (optional)</Label>
              <Input
                id="new-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetForm(); setIsCreateOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || !assignedTo || isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
