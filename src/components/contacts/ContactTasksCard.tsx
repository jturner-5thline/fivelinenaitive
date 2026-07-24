import { useState, useEffect, useMemo } from 'react';
import { CheckSquare, Plus, Circle, CheckCircle2, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useContactTasks, useMyTasks } from '@/hooks/useTasks';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TaskAssociationChips } from '@/components/tasks/TaskAssociationChips';
import { TaskFilterSortBar, applyTaskFilters, DEFAULT_TASK_FILTERS, type TaskFilters } from '@/components/tasks/TaskFilterSortBar';

interface ContactTasksCardProps {
  contactId: string;
  contactName: string;
  crmCompanyId?: string | null;
  externalShowCreate?: boolean;
  onExternalShowCreateChange?: (v: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];


export function ContactTasksCard({ contactId, contactName, crmCompanyId, externalShowCreate, onExternalShowCreateChange }: ContactTasksCardProps) {
  const { data: tasks = [], isLoading } = useContactTasks(contactId);
  const { createTask, updateTask } = useMyTasks();
  const teamMembers = useTeamMembers();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('not_started');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);

  useEffect(() => {
    if (externalShowCreate) {
      setIsCreateOpen(true);
      onExternalShowCreateChange?.(false);
    }
  }, [externalShowCreate]);

  // Default assignee to current user
  useEffect(() => {
    if (user && !assignedTo) {
      setAssignedTo(user.id);
    }
  }, [user]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAssignedTo(user?.id || '');
    setDueDate('');
    setPriority('');
    setStatus('not_started');
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsSubmitting(true);
    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_to: assignedTo || undefined,
        contact_id: contactId,
        crm_company_id: crmCompanyId || undefined,
        priority,
        due_date: dueDate || undefined,
        status,
      },
      {
        onSuccess: () => {
          toast.success('Task created');
          resetForm();
          setIsCreateOpen(false);
          setIsSubmitting(false);
        },
        onError: () => {
          setIsSubmitting(false);
        },
      }
    );
  };

  const handleToggle = (task: any) => {
    const newStatus = task.status === 'complete' ? 'not_started' : 'complete';
    updateTask.mutate({ id: task.id, status: newStatus });
  };

  const memberMap = useMemo(() => {
    const map = new Map<string, any>();
    teamMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [teamMembers]);

  const getInitials = (member: any) => {
    if (!member) return '?';
    return (member.display_name || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  };

  const filteredTasks = useMemo(() => applyTaskFilters(tasks, filters), [tasks, filters]);
  const showCompletedSection = filters.status === 'all';
  const activeTasks = showCompletedSection ? filteredTasks.filter(t => t.status !== 'complete') : filteredTasks;
  const completedTasks = showCompletedSection ? filteredTasks.filter(t => t.status === 'complete') : [];

  return (
    <>
      <Card className="border-primary/25 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4" /> Tasks ({activeTasks.length})
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-3 w-3" /> Add Task
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length > 0 && (
            <TaskFilterSortBar tasks={tasks} filters={filters} onChange={setFilters} />
          )}
          {activeTasks.length === 0 && completedTasks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>
          )}

          {activeTasks.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {activeTasks.map(task => {
                const assignee = memberMap.get(task.assigned_to);
                return (
                  <div key={task.id} className="flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/30 group">
                    <button
                      onClick={() => handleToggle(task)}
                      className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Circle className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-medium cursor-pointer hover:text-primary truncate"
                        onClick={() => navigate(`/tasks?task=${task.id}`)}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {assignee && (
                          <div className="flex items-center gap-1">
                            <Avatar className="h-3.5 w-3.5">
                              <AvatarImage src={assignee.avatar_url || undefined} />
                              <AvatarFallback className="text-[7px]">{getInitials(assignee)}</AvatarFallback>
                            </Avatar>
                            <span className="text-[10px] text-muted-foreground">{assignee.display_name}</span>
                          </div>
                        )}
                        {task.due_date && (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(task.due_date), 'MMM d')}
                          </span>
                        )}
                        {task.priority === 'urgent' && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-red-400">
                            Urgent
                          </Badge>
                        )}
                        {task.status !== 'not_started' && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                            {STATUS_OPTIONS.find(s => s.value === task.status)?.label || task.status}
                          </Badge>
                        )}
                      </div>
                      <TaskAssociationChips task={task} className="mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="space-y-1 mb-2 opacity-60">
              {completedTasks.slice(0, 3).map(task => (
                <div key={task.id} className="flex items-center gap-2 p-1.5 rounded-md">
                  <button
                    onClick={() => handleToggle(task)}
                    className="flex-shrink-0 text-green-500 hover:text-muted-foreground transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-xs line-through text-muted-foreground truncate">{task.title}</p>
                </div>
              ))}
              {completedTasks.length > 3 && (
                <p className="text-[10px] text-muted-foreground text-center">+{completedTasks.length - 3} more completed</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Create Task Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsCreateOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Task for {contactName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Task title</Label>
              <Input
                placeholder="e.g. Follow up with contact"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                placeholder="Add any extra details…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="mt-1 min-h-[60px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Assign to</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select member" />
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
                <Label className="text-xs">Due date (optional)</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Priority</Label>
                <label className="mt-1 flex items-center gap-2 text-xs h-9 px-2 rounded-md border border-input cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={priority === 'urgent'}
                    onChange={(e) => setPriority(e.target.checked ? 'urgent' : '')}
                    className="h-3.5 w-3.5"
                  />
                  Mark as Urgent
                </label>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetForm(); setIsCreateOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
