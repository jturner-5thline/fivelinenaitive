/**
 * EmailViewerDialog
 * -----------------
 * Lightweight "open email" popup used from the Deal Communications tab.
 * Fetches the full message HTML/text via the `gmail-messages` edge function
 * (`action: 'get'`) when it's not already on hand, and offers a Reply button
 * that hands off to the shared `DraftEmailToClientContactDialog` composer
 * with the sender prefilled and a `Re:` subject.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Reply, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DraftEmailToClientContactDialog = lazy(() =>
  import('./DraftEmailToClientContactDialog').then((m) => ({
    default: m.DraftEmailToClientContactDialog,
  })),
);

export interface EmailViewerMessage {
  message_id: string | null;
  thread_id: string | null;
  subject: string;
  from: string;
  to: string[];
  sent_at: string | null;
  preview?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: EmailViewerMessage | null;
  dealId?: string | null;
  dealName?: string | null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
function extractEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(EMAIL_RE);
  return m ? m[0] : null;
}
function extractName(s: string | null | undefined): string | null {
  if (!s) return null;
  // "Name <email@x>" → "Name"; bare email → null
  const idx = s.indexOf('<');
  if (idx > 0) return s.slice(0, idx).trim().replace(/^"|"$/g, '') || null;
  return EMAIL_RE.test(s) ? null : s.trim() || null;
}

export function EmailViewerDialog({ open, onOpenChange, message, dealId, dealName }: Props) {
  const [loading, setLoading] = useState(false);
  const [bodyHtml, setBodyHtml] = useState<string>('');
  const [bodyText, setBodyText] = useState<string>('');
  const [replyOpen, setReplyOpen] = useState(false);

  useEffect(() => {
    if (!open || !message?.message_id) {
      setBodyHtml('');
      setBodyText('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('gmail-messages', {
          body: { action: 'get', message_id: message.message_id },
        });
        if (error) throw error;
        const msg = (data as any)?.message ?? data ?? {};
        if (!cancelled) {
          setBodyHtml(String(msg.body_html ?? ''));
          setBodyText(String(msg.body_text ?? ''));
        }
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || 'Failed to load email');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, message?.message_id]);

  const fromEmail = useMemo(() => extractEmail(message?.from), [message?.from]);
  const fromName = useMemo(() => extractName(message?.from), [message?.from]);
  const replySubject = useMemo(() => {
    const s = (message?.subject ?? '').trim();
    if (!s) return '';
    return /^re:\s/i.test(s) ? s : `Re: ${s}`;
  }, [message?.subject]);

  const handleReply = useCallback(() => {
    if (!fromEmail) {
      toast.error("Can't find a reply address on this message.");
      return;
    }
    setReplyOpen(true);
  }, [fromEmail]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-base font-medium truncate">
              {message?.subject || '(no subject)'}
            </DialogTitle>
            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">{message?.from || '—'}</span>
                {message?.sent_at && (
                  <span className="whitespace-nowrap">
                    · {format(new Date(message.sent_at), 'PP p')}
                  </span>
                )}
              </div>
              {message && message.to.length > 0 && (
                <div className="truncate">
                  <span className="text-muted-foreground/80">To: </span>
                  {message.to.join(', ')}
                </div>
              )}
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading email…
              </div>
            ) : bodyHtml ? (
              <div
                className="prose prose-sm prose-invert max-w-none break-words text-foreground [&_*]:!text-foreground [&_a]:!text-primary [&_blockquote]:!text-foreground/80 [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : bodyText ? (
              <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">{bodyText}</pre>
            ) : message?.preview ? (
              <div className="text-sm text-foreground/80">{message.preview}</div>
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 mr-2" /> No body content available.
              </div>
            )}
          </ScrollArea>
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border/40 bg-muted/20">
            <div className="text-[11px] text-muted-foreground">
              {message?.thread_id ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Thread</Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button size="sm" onClick={handleReply} disabled={!fromEmail}>
                <Reply className="h-3.5 w-3.5 mr-1.5" /> Reply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {replyOpen && fromEmail && (
        <Suspense fallback={null}>
          <DraftEmailToClientContactDialog
            open={replyOpen}
            onOpenChange={setReplyOpen}
            dealId={dealId ?? null}
            dealName={dealName ?? null}
            contactName={fromName}
            contactEmail={fromEmail}
            initialToRecipients={[fromEmail]}
            initialSubject={replySubject}
            headerTitle={`Reply to ${fromName || fromEmail}`}
          />
        </Suspense>
      )}
    </>
  );
}

export default EmailViewerDialog;