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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Convert plain-note text to HTML preserving line breaks exactly as displayed
// in the Notes section (which uses `whitespace-pre-wrap`).
function textToHtml(text: string) {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function composeHtml(opts: {
  eventTitle: string;
  eventStartISO?: string | null;
  savedNotes: SavedNote[];
  currentDraft?: string;
  claapSummary?: string | null;
  claapUrl?: string | null;
}) {
  const parts: string[] = [];
  parts.push(
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#111827;">`,
  );
  parts.push(
    `<div style="font-weight:600;font-size:15px;margin-bottom:4px;">Notes from: ${escapeHtml(opts.eventTitle)}</div>`,
  );
  if (opts.eventStartISO) {
    try {
      const d = new Date(opts.eventStartISO);
      if (!Number.isNaN(d.getTime())) {
        parts.push(
          `<div style="color:#6b7280;font-size:12px;margin-bottom:16px;">${escapeHtml(
            d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }),
          )}</div>`,
        );
      }
    } catch { /* noop */ }
  }

  if (opts.claapSummary?.trim()) {
    parts.push(
      `<div style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;color:#6b7280;font-weight:600;margin:18px 0 6px;">Claap summary</div>`,
    );
    parts.push(
      `<div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;">${textToHtml(
        opts.claapSummary.trim(),
      )}</div>`,
    );
    if (opts.claapUrl) {
      parts.push(
        `<div style="font-size:12px;margin-top:6px;"><a href="${escapeHtml(
          opts.claapUrl,
        )}" style="color:#2563eb;">View recording</a></div>`,
      );
    }
  }

  if (opts.savedNotes.length) {
    parts.push(
      `<div style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;color:#6b7280;font-weight:600;margin:18px 0 6px;">Notes</div>`,
    );
    for (const n of opts.savedNotes) {
      parts.push(
        `<div style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:8px;">${textToHtml(
          n.text,
        )}</div>`,
      );
    }
  }

  if (opts.currentDraft?.trim()) {
    parts.push(
      `<div style="text-transform:uppercase;letter-spacing:.05em;font-size:11px;color:#6b7280;font-weight:600;margin:18px 0 6px;">Draft (unsaved)</div>`,
    );
    parts.push(
      `<div style="white-space:pre-wrap;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;">${textToHtml(
        opts.currentDraft.trim(),
      )}</div>`,
    );
  }

  parts.push(`</div>`);
  return parts.join('');
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
    opts.savedNotes.forEach((n) => {
      lines.push(n.text);
      lines.push('');
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
      // If the user hasn't edited the auto-generated body, send the rich HTML
      // version so formatting (spacing, note separation, links) matches the
      // Notes section. Otherwise preserve their edits as line-wrapped HTML.
      const html = body === defaultBody
        ? composeHtml({ eventTitle, eventStartISO, savedNotes, currentDraft, claapSummary, claapUrl })
        : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(body)}</div>`;
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