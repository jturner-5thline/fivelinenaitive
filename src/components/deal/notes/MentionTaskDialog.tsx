import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Bell } from 'lucide-react';

interface MentionTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mentionedUserName: string;
  mentionedUserId: string;
  dealName?: string;
  onNotifyOnly: () => void;
  onCreateTask: (task: { title: string; description: string; due_date?: string }) => void;
}

export function MentionTaskDialog({
  open,
  onOpenChange,
  mentionedUserName,
  dealName,
  onNotifyOnly,
  onCreateTask,
}: MentionTaskDialogProps) {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleCreateTask = () => {
    onCreateTask({
      title: taskTitle,
      description: taskDescription,
      due_date: dueDate || undefined,
    });
    setTaskTitle('');
    setTaskDescription('');
    setDueDate('');
  };

  const handleNotifyOnly = () => {
    onNotifyOnly();
    setTaskTitle('');
    setTaskDescription('');
    setDueDate('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            You mentioned @{mentionedUserName}
          </DialogTitle>
        </DialogHeader>
        
        <p className="text-sm text-muted-foreground">
          {dealName && <span className="text-foreground font-medium">{dealName}</span>}
          {dealName && ' — '}
          Would you like to notify them or assign a task?
        </p>

        <div className="space-y-3 pt-2">
          <div>
            <Label htmlFor="task-title">Task title (optional)</Label>
            <Input
              id="task-title"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Review lender terms"
            />
          </div>
          <div>
            <Label htmlFor="task-desc">Description (optional)</Label>
            <Textarea
              id="task-desc"
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Add details..."
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="task-due">Due date (optional)</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleNotifyOnly} className="gap-2">
            <Bell className="h-4 w-4" />
            Notify only
          </Button>
          <Button onClick={handleCreateTask} disabled={!taskTitle.trim()} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Assign task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
