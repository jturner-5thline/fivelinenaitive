import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { useDealTasks } from '@/hooks/useDealTasks';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { toast } from 'sonner';

interface CreateTaskButtonProps {
  dealId: string;
  dealName?: string;
}

export function CreateTaskButton({ dealId, dealName }: CreateTaskButtonProps) {
  const { createTask } = useDealTasks(dealId);
  const teamMembers = useTeamMembers();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const memberMap = useMemo(() => {
    const map = new Map<string, TeamMember>();
    teamMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [teamMembers]);

  const getInitials = (member: TeamMember | undefined) => {
    if (!member) return '?';
    return (member.display_name || '')
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';
  };

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
      setIsOpen(false);
    } else {
      toast.error('Failed to create task');
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" />
        Create Task
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {dealName && (
              <div>
                <Label className="text-xs">Deal</Label>
                <p className="mt-1 text-sm text-foreground">{dealName}</p>
              </div>
            )}
            <div>
              <Label htmlFor="create-task-title" className="text-xs">Task title</Label>
              <Input
                id="create-task-title"
                placeholder="e.g. Review the latest financials"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="create-task-assignee" className="text-xs">Assign to</Label>
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
              <Label htmlFor="create-task-desc" className="text-xs">Description (optional)</Label>
              <Textarea
                id="create-task-desc"
                placeholder="Add any extra details…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 min-h-[60px]"
              />
            </div>
            <div>
              <Label htmlFor="create-task-due" className="text-xs">Due date (optional)</Label>
              <Input
                id="create-task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { resetForm(); setIsOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!title.trim() || !assignedTo || isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
