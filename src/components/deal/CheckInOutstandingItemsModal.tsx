import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Copy, Check, Mail, ExternalLink, Inbox, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useDealEmails } from '@/hooks/useDealEmails';
import { useOutstandingItems } from '@/hooks/useOutstandingItems';
import { toast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
}

export function CheckInOutstandingItemsModal({ open, onOpenChange, dealId }: Props) {
  const { emails, isLoading: emailsLoading } = useDealEmails(open ? dealId : undefined);
  const { items, isLoading: itemsLoading } = useOutstandingItems(open ? dealId : undefined);

  const [clientFirst, setClientFirst] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Truth values used to drive the AI typing animation. The displayed
  // `subject` / `body` are progressively revealed from these. Once the
  // animation completes — or the user takes over — the displayed values
  // become the canonical editable state.
  const [fullSubject, setFullSubject] = useState('');
  const [fullBody, setFullBody] = useState('');
  const [aiPhase, setAiPhase] = useState<'idle' | 'thinking' | 'subject' | 'body' | 'ready'>('idle');
  const userTookOverRef = useRef(false);
  const [copied, setCopied] = useState(false);

  // Pull client first name from the deal's contact field.
  useEffect(() => {
    if (!open || !dealId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deals')
        .select('contact')
        .eq('id', dealId)
        .maybeSingle();
      if (cancelled) return;
      const first = String(data?.contact || '').trim().split(/\s+/)[0] || '';
      if (first) setClientFirst(first);
    })();
    return () => { cancelled = true; };
  }, [open, dealId]);

  // Pending = NOT received and NOT approved (approved implies received/submitted).
  const pendingItems = useMemo(
    () => items.filter(i => !i.received && !i.approved && i.text?.trim()),
    [items],
  );

  // Auto-pick first thread when emails arrive.
  useEffect(() => {
    if (open && !selectedEmailId && emails.length > 0) {
      setSelectedEmailId(emails[0].id);
    }
  }, [open, emails, selectedEmailId]);

  const selectedEmail = useMemo(
    () => emails.find(e => e.id === selectedEmailId) || null,
    [emails, selectedEmailId],
  );

  // Regenerate the draft whenever the inputs change. Once the user has
  // taken over (typed/edited), we stop overwriting their content.
  useEffect(() => {
    if (!open) return;
    if (userTookOverRef.current) return;
    const baseSubject = selectedEmail?.message?.subject?.trim() || '';
    const reSubject = baseSubject
      ? (baseSubject.toLowerCase().startsWith('re:') ? baseSubject : `Re: ${baseSubject}`)
      : 'Checking in on outstanding items';

    const greetingName = clientFirst || 'there';
    const bullets = pendingItems.length
      ? pendingItems.map(i => `• ${i.text.trim()}`).join('\n')
      : '• (No outstanding items pending)';

    const draft = `Hi ${greetingName},\n\nWanted to just check in on the current outstanding items below\n\n${bullets}\n\nThanks!`;

    setFullSubject(reSubject);
    setFullBody(draft);
    setSubject('');
    setBody('');
    setAiPhase('thinking');
  }, [open, selectedEmail, clientFirst, pendingItems]);

  // Drive the typewriter animation. Subject first, then body.
  useEffect(() => {
    if (aiPhase === 'idle' || aiPhase === 'ready') return;
    if (userTookOverRef.current) {
      setSubject(fullSubject);
      setBody(fullBody);
      setAiPhase('ready');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        timer = setTimeout(() => res(), ms);
      });

    const typeInto = async (
      text: string,
      setter: (v: string) => void,
      chunk = 2,
      base = 14,
    ) => {
      let i = 0;
      while (i < text.length) {
        if (cancelled || userTookOverRef.current) {
          setter(text);
          return;
        }
        i = Math.min(text.length, i + chunk);
        setter(text.slice(0, i));
        // Slight natural variance + brief pauses on punctuation/newline.
        const ch = text[i - 1];
        const pause = ch === '\n' ? 60 : (ch === '.' || ch === ',' || ch === '!') ? 45 : base + Math.random() * 10;
        await sleep(pause);
      }
    };

    (async () => {
      if (aiPhase === 'thinking') {
        await sleep(280);
        if (cancelled) return;
        setAiPhase('subject');
        return;
      }
      if (aiPhase === 'subject') {
        await typeInto(fullSubject, setSubject, 1, 22);
        if (cancelled) return;
        await sleep(160);
        if (cancelled) return;
        setAiPhase('body');
        return;
      }
      if (aiPhase === 'body') {
        await typeInto(fullBody, setBody, 3, 12);
        if (cancelled) return;
        setAiPhase('ready');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [aiPhase, fullSubject, fullBody]);

  const isTyping = aiPhase === 'thinking' || aiPhase === 'subject' || aiPhase === 'body';

  const completeAnimation = useCallback(() => {
    userTookOverRef.current = true;
    setSubject(fullSubject);
    setBody(fullBody);
    setAiPhase('ready');
  }, [fullSubject, fullBody]);

  // Reset state on close.
  useEffect(() => {
    if (!open) {
      setSelectedEmailId(null);
      setCopied(false);
      setAiPhase('idle');
      userTookOverRef.current = false;
      setSubject('');
      setBody('');
      setFullSubject('');
      setFullBody('');
    }
  }, [open]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      toast({ title: 'Draft copied to clipboard' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  }, [subject, body]);

  const handleOpenInGmail = useCallback(() => {
    if (!selectedEmail?.gmail_message_id) return;
    // Best-effort link to Gmail thread search by message id.
    const url = `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(selectedEmail.gmail_message_id)}`;
    window.open(url, '_blank');
  }, [selectedEmail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Check in with client on outstanding items
          </DialogTitle>
          <DialogDescription>
            Pick the email thread to reply in. We'll draft a check-in using the deal's pending outstanding items
            (anything marked received or submitted is excluded).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0">
          {/* Left: thread picker */}
          <div className="border-r border-border flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-border">
              <Label className="text-xs text-muted-foreground">Client first name</Label>
              <Input
                value={clientFirst}
                onChange={(e) => setClientFirst(e.target.value)}
                placeholder="Client"
                className="h-8 mt-1"
              />
            </div>
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Linked email threads
              </Label>
              <Badge variant="outline" className="h-5 text-[10px]">{emails.length}</Badge>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-2 pb-3 space-y-1">
                {emailsLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-xs">Loading threads…</span>
                  </div>
                ) : emails.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground px-4">
                    <Inbox className="h-7 w-7 mb-2 opacity-50" />
                    <div className="text-xs">No email threads linked to this deal yet.</div>
                    <div className="text-[11px] mt-1">Link an email from the Activity / Emails tab first.</div>
                  </div>
                ) : (
                  emails.map((e) => {
                    const isSel = e.id === selectedEmailId;
                    const m = e.message;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedEmailId(e.id)}
                        className={cn(
                          'w-full text-left rounded-md p-2.5 transition-colors border',
                          isSel
                            ? 'bg-primary/15 border-primary/40'
                            : 'border-transparent hover:bg-muted/50',
                        )}
                      >
                        <div className="text-sm font-medium truncate">
                          {m?.subject || '(No subject)'}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {m?.from_name || m?.from_email || 'Unknown sender'}
                          {m?.received_at ? ` · ${format(new Date(m.received_at), 'MMM d, yyyy')}` : ''}
                        </div>
                        {m?.snippet && (
                          <div className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-1">
                            {m.snippet}
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: preview */}
          <div className="flex flex-col min-h-0 p-4 gap-3">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Pending outstanding items ({pendingItems.length})
              </div>
              {itemsLoading ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : pendingItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  Nothing pending — everything is marked received or submitted.
                </div>
              ) : (
                <ul className="space-y-1">
                  {pendingItems.map((i) => (
                    <li key={i.id} className="text-xs text-foreground flex gap-1.5">
                      <span className="text-primary">•</span>
                      <span className="flex-1">{i.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-card/40">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    Draft reply
                    {isTyping && (
                      <span className="inline-flex items-center gap-1 text-[10px] normal-case tracking-normal text-primary">
                        <Sparkles className="h-3 w-3 animate-pulse" />
                        Drafting with AI…
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {selectedEmail
                      ? `In thread: ${selectedEmail.message?.subject || '(No subject)'}`
                      : 'Select an email thread to reply in'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {selectedEmail && (
                    <Button type="button" size="sm" variant="outline" onClick={handleOpenInGmail} className="h-7 px-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Gmail
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={handleCopy} className="h-7 px-2 text-xs">
                    {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Subject</Label>
                  <div className="relative mt-1">
                    <Input
                      value={subject}
                      onChange={(e) => { completeAnimation(); setSubject(e.target.value); }}
                      onFocus={() => { if (isTyping) completeAnimation(); }}
                      className="h-8 text-sm"
                    />
                    {aiPhase === 'subject' && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-block w-[2px] h-4 bg-primary animate-pulse"
                      />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                  <Label className="text-[11px] text-muted-foreground">Body</Label>
                  <div className="relative mt-1 flex-1 min-h-0 flex flex-col">
                    <Textarea
                      value={body + (aiPhase === 'body' ? '▍' : '')}
                      onChange={(e) => {
                        completeAnimation();
                        const v = e.target.value.replace(/▍$/, '');
                        setBody(v);
                      }}
                      onFocus={() => { if (isTyping) completeAnimation(); }}
                      className="flex-1 min-h-[220px] text-sm font-mono leading-relaxed resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
