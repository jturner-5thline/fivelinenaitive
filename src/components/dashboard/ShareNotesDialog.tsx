import { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Share2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SavedNote { id: string; text: string; at: string }

interface ShareNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  eventStartISO?: string | null;
  savedNotes: SavedNote[];
  currentDraft?: string;
  claapSummary?: string | null;
  claapUrl?: string | null;
  defaultRecipients?: string[];
}

function composeBody(opts: {
  eventTitle: string;
  eventStartISO?: string | null;
  savedNotes: SavedNote[];
  currentDraft?: string;
  claapSummary?: string | null;
  claapUrl?: string | null;
}) {
  const lines: string[] = [];
  lines.push(`Notes from: ${opts.eventTitle}`);
  if (opts.eventStartISO) {
    try {
      const d = new Date(opts.eventStartISO);
      if (!Number.isNaN(d.getTime())) {
        lines.push(d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }));
      }
    } catch { /* noop */ }
  }
  lines.push('');
  if (opts.claapSummary?.trim()) {
    lines.push('— Claap summary —');
    lines.push(opts.claapSummary.trim());
    if (opts.claapUrl) lines.push(`Recording: ${opts.claapUrl}`);
    lines.push('');
  }
  if (opts.savedNotes.length) {
    lines.push('— Notes —');
    opts.savedNotes.forEach((n, i) => {
      lines.push(`${i + 1}. ${n.text}`);
    });
    lines.push('');
  }
  if (opts.currentDraft?.trim()) {
    lines.push('— Draft (unsaved) —');
    lines.push(opts.currentDraft.trim());
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function ShareNotesDialog({
  open, onOpenChange, eventTitle, eventStartISO, savedNotes,
  currentDraft, claapSummary, claapUrl, defaultRecipients = [],
}: ShareNotesDialogProps) {
  const defaultBody = useMemo(
    () => composeBody({ eventTitle, eventStartISO, savedNotes, currentDraft, claapSummary, claapUrl }),
    [eventTitle, eventStartISO, savedNotes, currentDraft, claapSummary, claapUrl],
  );
  const defaultRecipientsKey = defaultRecipients.join(',');
  const [to, setTo] = useState(defaultRecipients.join(', '));
  const [subject, setSubject] = useState(`Notes: ${eventTitle}`);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(defaultRecipientsKey ? defaultRecipientsKey.split(',').join(', ') : '');
      setSubject(`Notes: ${eventTitle}`);
      setBody(defaultBody);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSend = async () => {
    const recipients = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) {
      toast.error('Add at least one recipient');
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body are required');
      return;
    }
    setSending(true);
    try {
      const html = body
        .split('\n')
        .map((l) => l ? `<div>${l.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : '<div><br/></div>')
        .join('');
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: { action: 'send', to: recipients, subject: subject.trim(), body, html },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Notes shared');
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send failed';
      toast.error('Could not send', { description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl z-[1310]" overlayClassName="z-[1300]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            Share notes
          </DialogTitle>
          <DialogDescription>
            Review the draft, add recipients, and send. Notes are pulled from Claap and any notes you've saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">To (comma-separated)</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, other@example.com" className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 min-h-[260px] text-sm leading-relaxed font-mono"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={sending || !to.trim()} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ShareNotesDialog;