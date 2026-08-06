/**
 * LinkedCallActionsDialog
 * -----------------------
 * Action menu shown for a meeting that already has a Claap recording linked.
 * "Draft Q&A" expands the dialog: the call transcript is turned into an
 * accurate lender-question / client-answer log plus a human-style follow-up
 * email that the user can edit, address and send.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageSquareText, ChevronRight, ChevronLeft, Loader2, Send, ArrowLeft, Mail, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string | null;
  recordingTitle?: string | null;
  /** claap_meetings.id when known — most reliable resolver. */
  meetingId?: string | null;
  /** Claap recording id (claap_meetings.claap_id) when the meeting id isn't at hand. */
  recordingId?: string | null;
}

interface QaPair {
  question: string;
  answer: string;
  asked_by?: string;
  answered_by?: string;
}

interface QaResult {
  summary: string;
  qa: QaPair[];
  outstanding_items: string[];
  email_subject: string;
  email_body: string;
  suggested_recipients?: string[];
}

interface ActionOption {
  key: string;
  label: string;
  description: string;
  icon: typeof MessageSquareText;
}

const ACTIONS: ActionOption[] = [
  {
    key: 'draft-qa',
    label: 'Draft Q&A',
    description: 'Turn the call into a question & answer list you can review and send.',
    icon: MessageSquareText,
  },
];

export function LinkedCallActionsDialog({
  open, onOpenChange, eventTitle, recordingTitle, meetingId, recordingId,
}: Props) {
  const [mode, setMode] = useState<'menu' | 'qa'>('menu');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QaResult | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const title = recordingTitle || eventTitle || 'Linked call';

  useEffect(() => {
    if (!open) {
      // Reset only after the close animation so the panel doesn't flicker.
      const t = setTimeout(() => {
        setMode('menu');
        setResult(null);
        setLoading(false);
        setTo('');
        setSubject('');
        setBody('');
        setCopied(false);
        setShowDetails(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const runDraftQa = async () => {
    setMode('qa');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('claap-draft-qa', {
        body: { meeting_id: meetingId || null, recording_id: recordingId || null, title },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const res = data as QaResult;
      setResult(res);
      setSubject(res.email_subject || `Follow-up: ${title}`);
      setBody(res.email_body || '');
      setTo((res.suggested_recipients || [])[0] || '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not draft Q&A';
      toast.error(msg);
      setMode('menu');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleSend = async () => {
    const recipients = to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) { toast.error('Add at least one recipient'); return; }
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body are required'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: { action: 'send', to: recipients, subject: subject.trim(), body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Follow-up sent');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(mode === 'qa' ? (showDetails ? 'sm:max-w-[1200px]' : 'sm:max-w-[840px]') : 'sm:max-w-[460px]')}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'qa' && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 -ml-1"
                onClick={() => setMode('menu')}
                aria-label="Back to call actions"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {mode === 'qa' ? 'Lender follow-up email' : 'Call actions'}
            {mode === 'qa' && !loading && result && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 gap-1 text-xs"
                onClick={() => setShowDetails((v) => !v)}
                aria-label={showDetails ? 'Hide call summary and Q&A' : 'Show call summary and Q&A'}
              >
                {showDetails ? <><ChevronLeft className="h-4 w-4" /> Hide details</> : <>Summary &amp; Q&amp;A <ChevronRight className="h-4 w-4" /></>}
              </Button>
            )}
          </DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>

        {mode === 'menu' && (
          <div className="space-y-2">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.key === 'draft-qa' ? runDraftQa : () => toast.info(`${a.label} — coming soon`)}
                  className="w-full text-left rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2.5 flex items-start gap-2.5"
                >
                  <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </button>
              );
            })}
          </div>
        )}

        {mode === 'qa' && (
          <>
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Reading the transcript, pairing questions with answers and drafting the follow-up…
              </div>
            ) : result ? (
              <div className={cn('grid gap-4', showDetails && 'lg:grid-cols-2')}>
                {/* Pre-drafted email */}
                <div className="min-w-0 space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Lender follow-up email
                  </p>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="lender@example.com"
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Message</Label>
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="mt-1 min-h-[320px] text-sm leading-relaxed"
                    />
                  </div>
                </div>

                {/* Extracted Q&A log */}
                {showDetails && (
                <div className="min-w-0 space-y-2">
                  {result.summary && (
                    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Call summary</p>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{result.summary}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Q&amp;A</p>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{result.qa.length}</Badge>
                  </div>
                  <ScrollArea className="h-[300px] pr-3">
                    <div className="space-y-2">
                      {result.qa.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No lender questions were detected on this call.</p>
                      )}
                      {result.qa.map((pair, i) => (
                        <div key={i} className="rounded-md border border-border/60 p-2.5">
                          <p className="text-xs font-medium">
                            Q{pair.asked_by ? ` · ${pair.asked_by}` : ''}: {pair.question}
                          </p>
                          <p className={cn('mt-1 text-xs', pair.answer ? 'text-muted-foreground' : 'text-amber-500')}>
                            {pair.answer
                              ? `A${pair.answered_by ? ` · ${pair.answered_by}` : ''}: ${pair.answer}`
                              : 'No answer given on the call — tracked as outstanding.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {result.outstanding_items.length > 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-500 mb-1">Outstanding items</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {result.outstanding_items.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                )}
              </div>
            ) : null}

            {!loading && result && (
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={handleCopy} className="gap-1">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy draft'}
                </Button>
                <Button type="button" onClick={handleSend} disabled={sending || !to.trim()} className="gap-1">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? 'Sending…' : 'Send follow-up'}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default LinkedCallActionsDialog;
