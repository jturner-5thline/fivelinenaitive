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
import { CalendarIcon, Loader2, Mail, Link2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cleanEmailSnippet } from '@/lib/emailNotesCleanup';

export interface CreateTaskFromEmailSource {
  messageId: string;
  threadId?: string | null;
  subject?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  snippet?: string | null;
  /** ISO timestamp of when the source email was received. Persisted on
   *  the task so downstream "Open source email" tooltips can show it
   *  alongside sender + subject. */
  receivedAt?: string | null;
  /** Optional pre-resolved deal/contact context. */
  dealId?: string | null;
  contactId?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: CreateTaskFromEmailSource | null;
}

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
  const [submitting, setSubmitting] = useState(false);

  // Build a stable in-app deep link to the source email/thread. The
  // dashboard inbox is opened via `?widget=email`; we also pass the
  // thread id so future enhancements can scroll directly to the thread.
  const sourceEmailUrl = useMemo(() => {
    if (!email) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({ widget: 'email' });
    if (email.threadId) params.set('thread', email.threadId);
    if (email.messageId) params.set('message', email.messageId);
    return `${origin}/dashboard?${params.toString()}`;
  }, [email]);

  // Strip raw HTML tags / collapse <br> from snippets so the textarea
  // shows clean prose instead of escaped markup. Implementation lives in
  // src/lib/emailNotesCleanup.ts and is unit-tested there.
  const cleanSnippet = cleanEmailSnippet;

  useEffect(() => {
    if (!open || !email) return;
    setTitle(email.subject?.trim() || 'Follow up on email');
    const fromLine =
      email.fromName || email.fromEmail
        ? `From: ${email.fromName || ''}${email.fromEmail ? ` <${email.fromEmail}>` : ''}`.trim()
        : '';
    const subjLine = email.subject ? `Subject: ${email.subject}` : '';
    const snippetLine = email.snippet ? cleanSnippet(email.snippet) : '';
    // Append a clean, plain-text URL so the link is preserved on the
    // saved task and renders as a clickable link wherever the
    // description is auto-linkified.
    const linkLine = sourceEmailUrl ? `\nSource email: ${sourceEmailUrl}` : '';
    setDescription(
      [fromLine, subjLine, snippetLine ? `\n${snippetLine}` : '', linkLine]
        .filter(Boolean)
        .join('\n'),
    );
    setAssignee(user?.id || '');
    setDueDate(new Date());
  }, [open, email, user?.id, sourceEmailUrl]);

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
        // Priority intentionally not set from this flow — DB default applies.
        priority: 'medium',
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
        source_email_received_at: email.receivedAt || null,
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
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
                Linked to email
              </div>
              <div className="truncate text-foreground">{linkedLabel}</div>
            </div>
            {sourceEmailUrl && (
              <a
                href={sourceEmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open email
              </a>
            )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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