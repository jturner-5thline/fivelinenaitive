import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, Mail, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export interface CreateTaskFromEmailSource {
  messageId: string;
  threadId?: string | null;
  subject?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  snippet?: string | null;
  /** Optional pre-resolved deal/contact context. */
  dealId?: string | null;
  contactId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: CreateTaskFromEmailSource | null;
}

type Priority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Lightweight task-creation modal triggered from the email context menu.
 * Prefills title/description/due date from the source email and persists the
 * email message + thread IDs on the task so downstream views can navigate
 * back to the originating message.
 */
export function CreateTaskFromEmailDialog({ open, onOpenChange, email }: Props) {
  const { user } = useAuth();
  const teamMembers = useTeamMembers();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !email) return;
    setTitle(email.subject?.trim() || 'Follow up on email');
    const lines = [
      email.fromName || email.fromEmail
        ? `From: ${email.fromName || ''}${email.fromEmail ? ` <${email.fromEmail}>` : ''}`.trim()
        : '',
      email.subject ? `Subject: ${email.subject}` : '',
      email.snippet ? `\n${email.snippet.trim()}` : '',
    ].filter(Boolean);
    setDescription(lines.join('\n'));
    setAssignee(user?.id || '');
    setDueDate(new Date());
    setPriority('medium');
  }, [open, email, user?.id]);

  const linkedLabel = useMemo(() => {
    if (!email) return '';
    const who = email.fromName || email.fromEmail || 'Unknown sender';
    const subj = email.subject?.trim() || '(No subject)';
    return `${who} · ${subj}`;
  }, [email]);

  const handleSubmit = async () => {
    if (!email || !user) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('Task name is required');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        title: trimmed,
        description: description.trim() || null,
        assigned_to: assignee || user.id,
        assigned_by: user.id,
        created_by: user.id,
        priority,
        status: 'not_started',
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        deal_id: email.dealId || null,
        contact_id: email.contactId || null,
        source_email_message_id: email.messageId,
        source_email_thread_id: email.threadId || null,
        source_email_subject: email.subject || null,
        source_email_from:
          email.fromName || email.fromEmail
            ? `${email.fromName || ''}${email.fromEmail ? ` <${email.fromEmail}>` : ''}`.trim()
            : null,
      } as any);
      if (error) throw error;
      toast.success('Task created from email');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[CreateTaskFromEmail] insert failed', err);
      toast.error(err?.message || 'Could not create task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Create Task from Email
          </DialogTitle>
        </DialogHeader>

        {email && (
          <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-xs">
            <Link2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                Linked to email
              </div>
              <div className="truncate text-foreground">{linkedLabel}</div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className="text-xs">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc" className="text-xs">Notes</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs">Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                <SelectContent>
                  {user && (
                    <SelectItem value={user.id}>
                      {(user.user_metadata as any)?.full_name || user.email || 'Me'} (you)
                    </SelectItem>
                  )}
                  {teamMembers
                    .filter((m) => m.id !== user?.id)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs">Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start font-normal', !dueDate && 'text-muted-foreground')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dueDate ? format(dueDate, 'MMM d, yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}