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
import { cn } from '@/lib/utils';

interface CreateLenderTaskButtonProps {
  dealId: string;
  lenderId: string;
  lenderName: string;
  /** 'icon' (default) renders the compact square button; 'labeled' renders a full-width "+ Create Task" button. */
  variant?: 'icon' | 'labeled';
  className?: string;
}

export function CreateLenderTaskButton({
  dealId,
  lenderId,
  lenderName,
  variant = 'icon',
  className,
}: CreateLenderTaskButtonProps) {
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
      {variant === 'labeled' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-7 w-full justify-start text-xs', className)}
          onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
          title={`Create task for ${lenderName}`}
        >
          <Plus className="h-3 w-3 mr-1.5" />
          Create Task
        </Button>
      ) : (
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
        className={cn("relative overflow-hidden h-8 w-8 flex items-center justify-center rounded-md border border-[hsl(272,100%,80%,0.35)] bg-[linear-gradient(145deg,hsl(272,40%,18%,0.5)_0%,hsl(260,30%,12%,0.6)_100%)] text-[hsl(272,100%,85%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(272,80%,75%,0.15),0_2px_12px_hsl(272,60%,35%,0.2)] hover:border-[hsl(272,100%,80%,0.55)] hover:bg-[linear-gradient(145deg,hsl(272,45%,22%,0.6)_0%,hsl(260,35%,16%,0.7)_100%)] hover:shadow-[inset_0_1px_1px_hsl(272,80%,80%,0.25),0_4px_20px_hsl(272,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(272,80%,80%,0.12)_0%,transparent_50%,hsl(272,70%,55%,0.06)_100%)] transition-all", className)}
        title={`Create task for ${lenderName}`}
      >
        <Plus className="h-4 w-4" />
      </button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md z-[10000]" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Funding Source</Label>
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
