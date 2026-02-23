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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers';
import { toast } from 'sonner';

interface CreateLenderTaskButtonProps {
  dealId: string;
  lenderId: string;
  lenderName: string;
}

export function CreateLenderTaskButton({ dealId, lenderId, lenderName }: CreateLenderTaskButtonProps) {
  const { user } = useAuth();
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
    if (!title.trim() || !assignedTo || !user) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          deal_id: dealId,
          lender_id: lenderId,
          assigned_to: assignedTo,
          assigned_by: user.id,
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
        } as any);
      if (error) throw error;
      const member = memberMap.get(assignedTo);
      toast.success(`Task assigned to ${member?.display_name || 'team member'} for ${lenderName}`);
      resetForm();
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating lender task:', error);
      toast.error('Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        title={`Create task for ${lenderName}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Lender</Label>
              <p className="mt-1 text-sm text-foreground font-medium">{lenderName}</p>
            </div>
            <div>
              <Label htmlFor="lender-task-title" className="text-xs">Task title</Label>
              <Input
                id="lender-task-title"
                placeholder="e.g. Follow up on term sheet"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="lender-task-assignee" className="text-xs">Assign to</Label>
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
              <Label htmlFor="lender-task-desc" className="text-xs">Description (optional)</Label>
              <Textarea
                id="lender-task-desc"
                placeholder="Add any extra details…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 min-h-[60px]"
              />
            </div>
            <div>
              <Label htmlFor="lender-task-due" className="text-xs">Due date (optional)</Label>
              <Input
                id="lender-task-due"
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
