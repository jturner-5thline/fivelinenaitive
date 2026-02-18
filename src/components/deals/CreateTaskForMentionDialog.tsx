import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CalendarIcon } from 'lucide-react';

export interface MentionedUser {
  id: string;
  label: string;
  avatarUrl?: string;
}

interface CreateTaskForMentionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mentionedUsers: MentionedUser[];
  dealId?: string;
  noteContext?: string;
}

/** Strip HTML tags, remove @mentions, and trim to get plain text */
function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('[data-type="mention"]').forEach(el => el.remove());
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function CreateTaskForMentionDialog({
  open,
  onOpenChange,
  mentionedUsers,
  dealId,
  noteContext,
}: CreateTaskForMentionDialogProps) {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-populate title from noteContext when dialog opens
  useEffect(() => {
    if (open && noteContext) {
      setTitle(htmlToPlainText(noteContext));
    }
  }, [open, noteContext]);

  const currentUser = mentionedUsers[currentIndex];
  if (!currentUser) return null;

  const initials = currentUser.label
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const handleSkip = () => {
    if (currentIndex < mentionedUsers.length - 1) {
      setCurrentIndex((i) => i + 1);
      resetForm();
    } else {
      onOpenChange(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
  };

  const handleCreate = async () => {
    if (!title.trim() || !user) return;
    setIsSubmitting(true);

    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      assigned_to: currentUser.id,
      assigned_by: user.id,
      deal_id: dealId || null,
    } as any);

    setIsSubmitting(false);

    if (error) {
      toast.error('Failed to create task');
      console.error(error);
      return;
    }

    toast.success(`Task assigned to ${currentUser.label}`);

    if (currentIndex < mentionedUsers.length - 1) {
      setCurrentIndex((i) => i + 1);
      resetForm();
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a task?</DialogTitle>
          <DialogDescription>
            You mentioned {currentUser.label}. Would you like to assign them a task?
            {mentionedUsers.length > 1 && (
              <span className="ml-1 text-xs">({currentIndex + 1} of {mentionedUsers.length})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={currentUser.avatarUrl || undefined} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-foreground">{currentUser.label}</span>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="task-title" className="text-xs">Task title</Label>
            <Input
              id="task-title"
              placeholder="e.g. Review the latest financials"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="task-desc" className="text-xs">Description (optional)</Label>
            <Textarea
              id="task-desc"
              placeholder="Add any extra details…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 min-h-[60px]"
            />
          </div>
          <div>
            <Label htmlFor="task-due" className="text-xs">Due date (optional)</Label>
            <div className="relative mt-1">
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Extract mentioned user IDs and labels from TipTap HTML output */
export function extractMentionsFromHtml(html: string): MentionedUser[] {
  if (!html) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const mentionElements = doc.querySelectorAll('[data-type="mention"]');
  const seen = new Set<string>();
  const mentions: MentionedUser[] = [];

  mentionElements.forEach((el) => {
    const id = el.getAttribute('data-id');
    const label = el.getAttribute('data-label') || el.textContent?.replace('@', '') || '';
    if (id && !seen.has(id)) {
      seen.add(id);
      mentions.push({ id, label });
    }
  });

  return mentions;
}
