import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, MessageSquare, Paperclip, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface StatusEmailFlowSelection {
  mode: 'new' | 'thread';
  threadId?: string;
  latestMessageId?: string;
  subject: string;
  to: string[];
}

interface ThreadOption {
  thread_id: string;
  latest_message_id: string;
  subject: string;
  from: string;
  participants: string[];
  received_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId?: string | null;
  dealName: string;
  defaultSubject: string;
  defaultRecipients: string[];
  /** Plain-text body preview (greeting). */
  bodyPreview: string;
  /** Name of the generated PDF that will be attached. */
  attachmentName?: string;
  onContinue: (selection: StatusEmailFlowSelection) => void;
}

function shortDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Lightweight stepper shown after "Generate Status Email" — lets the user pick
 * an existing matching client thread or start a fresh one before the editable
 * composer (`DraftAndSendDialog`) takes over.
 */
export function StatusEmailFlowPicker({
  open,
  onOpenChange,
  dealId,
  dealName,
  defaultSubject,
  defaultRecipients,
  bodyPreview,
  attachmentName,
  onContinue,
}: Props) {
  const [threads, setThreads] = useState<ThreadOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('new');

  useEffect(() => {
    let cancelled = false;
    if (!open || !dealId) {
      setThreads([]);
      setSelected('new');
      setThreadError(null);
      return;
    }
    setLoading(true);
    setThreadError(null);
    setSelected('new');
    (async () => {
      try {
        const { data: links } = await supabase
          .from('deal_emails')
          .select('gmail_message_id')
          .eq('deal_id', dealId);
        const ids = (links || []).map((l: any) => l.gmail_message_id).filter(Boolean);
        if (ids.length === 0) {
          if (!cancelled) {
            setThreads([]);
            setLoading(false);
          }
          return;
        }
        const { data: msgs } = await supabase
          .from('gmail_messages')
          .select('gmail_message_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, received_at')
          .in('gmail_message_id', ids);
        const byThread = new Map<string, ThreadOption>();
        for (const m of (msgs || []) as any[]) {
          if (!m.thread_id) continue;
          const existing = byThread.get(m.thread_id);
          const ts = m.received_at ? new Date(m.received_at).getTime() : 0;
          const existingTs = existing?.received_at ? new Date(existing.received_at).getTime() : 0;
          const participants = Array.from(
            new Set(
              [
                m.from_email,
                ...(Array.isArray(m.to_emails) ? m.to_emails : []),
                ...(Array.isArray(m.cc_emails) ? m.cc_emails : []),
              ]
                .filter(Boolean)
                .map((e: string) => String(e).toLowerCase()),
            ),
          );
          if (!existing || ts >= existingTs) {
            byThread.set(m.thread_id, {
              thread_id: m.thread_id,
              latest_message_id: m.gmail_message_id,
              subject: m.subject || '(no subject)',
              from: m.from_name || m.from_email || '',
              participants,
              received_at: m.received_at,
            });
          }
        }
        const list = Array.from(byThread.values()).sort((a, b) => {
          const at = a.received_at ? new Date(a.received_at).getTime() : 0;
          const bt = b.received_at ? new Date(b.received_at).getTime() : 0;
          return bt - at;
        });
        if (!cancelled) {
          setThreads(list.slice(0, 15));
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setThreadError(e?.message || 'Could not load prior threads');
          setThreads([]);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, dealId]);

  const selectedThread = useMemo(
    () => (selected === 'new' ? null : threads.find((t) => t.thread_id === selected) || null),
    [selected, threads],
  );

  const previewSubject = useMemo(() => {
    if (!selectedThread) return defaultSubject;
    const subj = selectedThread.subject.trim();
    return /^re:\s/i.test(subj) ? subj : `Re: ${subj}`;
  }, [selectedThread, defaultSubject]);

  const previewRecipients = useMemo(() => {
    if (!selectedThread) return defaultRecipients;
    // Prefer thread participants, exclude any obvious self addresses (best-effort).
    return selectedThread.participants.length > 0
      ? selectedThread.participants
      : defaultRecipients;
  }, [selectedThread, defaultRecipients]);

  const handleContinue = () => {
    onContinue({
      mode: selectedThread ? 'thread' : 'new',
      threadId: selectedThread?.thread_id,
      latestMessageId: selectedThread?.latest_message_id,
      subject: previewSubject,
      to: previewRecipients,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[92vw] p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            Send Status Update
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose whether to reply into an existing thread with the client or start a fresh email. You can still edit everything before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* New thread option */}
          <button
            type="button"
            onClick={() => setSelected('new')}
            className={cn(
              'w-full text-left rounded-lg border p-3 transition-colors',
              selected === 'new'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/40',
            )}
          >
            <div className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium">Start new email</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Fresh draft prefilled from the deal's primary client contact.
            </p>
          </button>

          {/* Existing-thread options */}
          <div>
            <div className="flex items-center gap-2 px-1 mb-1.5">
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Existing client threads
              </span>
              {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            {threadError && (
              <p className="text-[11px] text-destructive px-1">
                {threadError} — you can still start a new email.
              </p>
            )}
            {!loading && !threadError && threads.length === 0 && (
              <p className="text-[11px] text-muted-foreground px-1">
                No prior threads linked to this deal — defaulting to a new email.
              </p>
            )}
            <div className="space-y-1.5">
              {threads.map((t) => (
                <button
                  key={t.thread_id}
                  type="button"
                  onClick={() => setSelected(t.thread_id)}
                  className={cn(
                    'w-full text-left rounded-lg border p-2.5 transition-colors',
                    selected === t.thread_id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.subject}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {t.from}
                        {t.participants.length > 0 && (
                          <span> · {t.participants.slice(0, 2).join(', ')}{t.participants.length > 2 ? '…' : ''}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {shortDate(t.received_at)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview block */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Draft preview
            </div>
            <div className="text-xs"><span className="text-muted-foreground">To:</span> {previewRecipients.length > 0 ? previewRecipients.join(', ') : <span className="italic">add a recipient in the next step</span>}</div>
            <div className="text-xs"><span className="text-muted-foreground">Subject:</span> {previewSubject || dealName}</div>
            <div className="text-xs"><span className="text-muted-foreground">Message:</span> {bodyPreview}</div>
            {attachmentName && (
              <div className="flex items-center gap-1.5 pt-1">
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[220px] truncate">{attachmentName}</span>
                </Badge>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="liquid-glass" size="sm" onClick={handleContinue}>
            Continue to compose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}