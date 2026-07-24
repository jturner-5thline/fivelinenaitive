/**
 * DraftEmailToClientContactDialog
 * --------------------------------
 * Dialog-based popup composer launched from the Deal detail view's
 * Client Contact field. Reuses the same EmailComposerCard surface used
 * everywhere else in Naitive (Deal Emails tab, AI Assist popout, inline
 * reply), so formatting, signatures, snippets, Draft/Polish with AI, and
 * the send footer all match the existing email experience.
 *
 * Added on top of the shared composer:
 *  - A thread-mode toggle (Use Existing Thread / Start New Thread)
 *  - An async thread picker that searches the user's mailbox for threads
 *    relevant to the client contact (by email and company domain)
 *  - Send-as-reply when an existing thread is selected
 *
 * The dialog opens instantly — thread search is fired in parallel and the
 * picker shows skeleton rows while loading.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, MessageSquarePlus, MessagesSquare, Inbox, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import {
  EmailComposerCard,
  type ComposerRecipients,
  type ComposerSendOptions,
} from './EmailComposerCard';

type ThreadMode = 'existing' | 'new';

interface ThreadCandidate {
  threadId: string;
  latestMessageId: string;
  subject: string;
  participants: string[];
  snippet: string;
  receivedAt: string;
}

export interface DraftEmailToClientContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId?: string | null;
  dealName?: string | null;
  contactName?: string | null;
  /** Best-known email for the client contact. */
  contactEmail?: string | null;
  /** Optional secondary domain (e.g. company website) used to broaden thread search. */
  companyDomain?: string | null;
  /** Additional email addresses to prefill in the To: field (e.g. meeting attendees). */
  initialToRecipients?: string[];
  /** Optional prefilled subject line. */
  initialSubject?: string;
  /** Optional label + subtitle override for the dialog header. */
  headerTitle?: string;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/i;
function extractEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(EMAIL_RE);
  return m ? m[0] : null;
}

function domainOf(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : null;
}

function formatRelative(ts: string): string {
  try {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Build a Gmail-style search query that surfaces threads involving the
 * client contact email and/or the company domain. Mirrors the matching
 * intuition already used elsewhere in Naitive's email views: prioritize
 * direct address matches, fall back to domain.
 */
function buildThreadQuery(contactEmail: string | null, companyDomain: string | null): string | null {
  const clauses: string[] = [];
  if (contactEmail) {
    clauses.push(`from:${contactEmail}`);
    clauses.push(`to:${contactEmail}`);
  }
  if (companyDomain && companyDomain !== domainOf(contactEmail)) {
    clauses.push(`from:${companyDomain}`);
    clauses.push(`to:${companyDomain}`);
  }
  if (clauses.length === 0) return null;
  return clauses.join(' OR ');
}

export function DraftEmailToClientContactDialog({
  open,
  onOpenChange,
  dealId,
  dealName,
  contactName,
  contactEmail,
  companyDomain,
  initialToRecipients,
  initialSubject,
  headerTitle,
}: DraftEmailToClientContactDialogProps) {
  const signature = useUserEmailSignature();

  const resolvedEmail = useMemo(
    () => extractEmail(contactEmail) ?? extractEmail(contactName),
    [contactEmail, contactName],
  );
  const mergedInitialTo = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of [resolvedEmail, ...(initialToRecipients ?? [])]) {
      const e = extractEmail(raw ?? null);
      if (!e) continue;
      const key = e.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }, [resolvedEmail, initialToRecipients]);
  const resolvedDomain = useMemo(
    () => companyDomain?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || null,
    [companyDomain],
  );

  // Composer state
  const [recipients, setRecipients] = useState<ComposerRecipients>({
    to: mergedInitialTo,
    cc: [],
    bcc: [],
  });
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  // Thread mode + picker state
  const [mode, setMode] = useState<ThreadMode>('new');
  const [threads, setThreads] = useState<ThreadCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  // Locks the mode default to the first load so we don't yank the user
  // back to "Use Existing" if their query later returns 0 results.
  const initializedRef = useRef(false);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setRecipients({ to: mergedInitialTo, cc: [], bcc: [] });
    setSubject(initialSubject ?? '');
    setBody('');
    setAttachments([]);
    setFiles([]);
    setFilter('');
    setSelectedThreadId(null);
    setThreads([]);
    setSearchError(null);
    initializedRef.current = false;
  }, [open, mergedInitialTo, initialSubject]);

  // Fire thread search in parallel (does not block the popup shell).
  useEffect(() => {
    if (!open) return;
    const query = buildThreadQuery(resolvedEmail, resolvedDomain);
    if (!query) {
      setIsSearching(false);
      setThreads([]);
      if (!initializedRef.current) {
        setMode('new');
        initializedRef.current = true;
      }
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('gmail-messages', {
          body: {
            action: 'list',
            max_results: 30,
            query,
            search_all_mail: true,
          },
        });
        if (cancelled) return;
        if (error || data?.fallback) {
          setSearchError('Could not load mailbox threads');
          setThreads([]);
          if (!initializedRef.current) {
            setMode('new');
            initializedRef.current = true;
          }
          return;
        }
        const msgs: any[] = data?.messages || [];
        // Group by thread_id keeping the newest message as the head.
        const byThread = new Map<string, ThreadCandidate>();
        for (const m of msgs) {
          const tid = m.thread_id || m.id;
          if (!tid) continue;
          const participants = Array.from(new Set<string>([
            m.from_email,
            ...(m.to_emails || []),
            ...(m.cc_emails || []),
          ].filter(Boolean)));
          const next: ThreadCandidate = {
            threadId: tid,
            latestMessageId: m.id,
            subject: m.subject || '(no subject)',
            participants,
            snippet: m.snippet || '',
            receivedAt: m.received_at || new Date().toISOString(),
          };
          const prev = byThread.get(tid);
          if (!prev || new Date(next.receivedAt) > new Date(prev.receivedAt)) {
            byThread.set(tid, next);
          }
        }
        const list = Array.from(byThread.values()).sort(
          (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
        );
        setThreads(list);
        if (!initializedRef.current) {
          setMode(list.length > 0 ? 'existing' : 'new');
          initializedRef.current = true;
        }
      } catch (e: any) {
        if (cancelled) return;
        setSearchError(e?.message || 'Could not load mailbox threads');
        setThreads([]);
        if (!initializedRef.current) {
          setMode('new');
          initializedRef.current = true;
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, resolvedEmail, resolvedDomain]);

  // When a thread is selected, prefill the subject as a Re: of the thread.
  useEffect(() => {
    if (!selectedThreadId) return;
    const t = threads.find(t => t.threadId === selectedThreadId);
    if (!t) return;
    const reSubject = /^re:\s/i.test(t.subject) ? t.subject : `Re: ${t.subject}`;
    setSubject(reSubject);
  }, [selectedThreadId, threads]);

  const filteredThreads = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(t =>
      t.subject.toLowerCase().includes(q) ||
      t.snippet.toLowerCase().includes(q) ||
      t.participants.some(p => p.toLowerCase().includes(q)),
    );
  }, [threads, filter]);

  const canSend = useMemo(() => {
    if (recipients.to.length === 0) return false;
    if (mode === 'existing' && !selectedThreadId) return false;
    return true;
  }, [recipients.to.length, mode, selectedThreadId]);

  const handleSend = useCallback(async (_opts: ComposerSendOptions) => {
    if (recipients.to.length === 0) {
      toast.error('Add a recipient before sending');
      return;
    }
    if (mode === 'existing' && !selectedThreadId) {
      toast.error('Select a thread or switch to “Start New Thread”');
      return;
    }
    const selectedThread = mode === 'existing'
      ? threads.find(t => t.threadId === selectedThreadId)
      : null;
    try {
      // Encode attachments as base64 (mirrors useGmail.sendEmail).
      let encodedAttachments: Array<{ filename: string; content_type: string; content: string; size: number }> | undefined;
      if (files.length > 0) {
        encodedAttachments = await Promise.all(files.map(async (file) => {
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
          }
          return {
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            content: btoa(binary),
            size: file.size,
          };
        }));
      }
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: recipients.to,
          cc: recipients.cc.length ? recipients.cc : undefined,
          bcc: recipients.bcc.length ? recipients.bcc : undefined,
          subject,
          body: body.replace(/<[^>]*>/g, ''),
          body_html: body,
          attachments: encodedAttachments,
          reply_to_message_id: selectedThread?.latestMessageId,
          deal_id: dealId ?? null,
        },
      });
      if (error) throw error;
      // Best-effort: link the new message to the deal if dealId is set.
      try {
        const newId: string | undefined = data?.message?.id || data?.id;
        if (newId && dealId) {
          const { data: auth } = await supabase.auth.getUser();
          if (auth?.user?.id) {
            await supabase.from('deal_emails').insert({
              deal_id: dealId,
              gmail_message_id: newId,
              user_id: auth.user.id,
            });
          }
        }
      } catch { /* non-fatal */ }
      toast.success('Email sent', { description: `To: ${recipients.to.join(', ')}` });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[DraftEmailToClientContact] send failed', err);
      toast.error(err?.message || 'Failed to send email');
    }
  }, [recipients, mode, selectedThreadId, threads, files, subject, body, dealId, onOpenChange]);

  const handleDiscard = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[2400]"
        className={cn(
          'z-[2410] popup-shell-surface p-0 gap-0 max-w-[1040px] w-[94vw] h-[92vh] max-h-[92vh] sm:h-[92vh]',
          'border-transparent shadow-2xl shadow-black/20 overflow-hidden rounded-2xl flex flex-col',
        )}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--email-border))] shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{headerTitle ?? 'Draft Email to Client Contact'}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {contactName || resolvedEmail || 'Client contact'}
                {dealName ? <> · <span className="text-muted-foreground/80">{dealName}</span></> : null}
              </p>
            </div>
          </div>
          {/* Mode toggle */}
          <div
            role="tablist"
            aria-label="Thread mode"
            className="mt-3 inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-card/40 p-0.5"
          >
            <button
              role="tab"
              aria-selected={mode === 'existing'}
              type="button"
              onClick={() => setMode('existing')}
              className={cn(
                'h-7 px-3 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                mode === 'existing'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              <MessagesSquare className="h-3.5 w-3.5" />
              Use Existing Thread
              {threads.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{threads.length}</Badge>
              )}
            </button>
            <button
              role="tab"
              aria-selected={mode === 'new'}
              type="button"
              onClick={() => { setMode('new'); setSelectedThreadId(null); }}
              className={cn(
                'h-7 px-3 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
                mode === 'new'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              <MessagesSquare className="h-3.5 w-3.5 rotate-180 opacity-70" />
              Start New Thread
            </button>
          </div>
        </div>

        {/* Body: optional thread picker + composer */}
        <div className="flex-1 min-h-0 flex flex-col">
          {mode === 'existing' && (
            <div className="shrink-0 border-b border-[hsl(var(--email-border))] bg-card/30">
              <div className="px-5 pt-3 pb-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter threads…"
                    className="h-8 pl-8 text-xs bg-background/60"
                  />
                </div>
                <span className="text-[10.5px] text-muted-foreground whitespace-nowrap">
                  {isSearching
                    ? 'Searching mailbox…'
                    : `${filteredThreads.length} thread${filteredThreads.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <ScrollArea className="max-h-[22vh]">
                <div className="px-3 pb-3 space-y-1">
                  {isSearching && threads.length === 0 && (
                    <>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="px-3 py-2 rounded-md">
                          <Skeleton className="h-3.5 w-2/3 mb-1.5" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      ))}
                    </>
                  )}
                  {!isSearching && searchError && (
                    <div className="px-3 py-2 text-xs text-destructive">{searchError}</div>
                  )}
                  {!isSearching && !searchError && filteredThreads.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground inline-flex w-full items-center justify-center gap-2">
                      <Inbox className="h-3.5 w-3.5" />
                      No matching threads. Switch to “Start New Thread”.
                    </div>
                  )}
                  {filteredThreads.map((t) => {
                    const isSelected = selectedThreadId === t.threadId;
                    return (
                      <button
                        key={t.threadId}
                        type="button"
                        onClick={() => setSelectedThreadId(t.threadId)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-md border transition-colors',
                          isSelected
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-transparent hover:bg-white/[0.04]',
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium truncate flex-1">{t.subject}</span>
                          <span className="text-[10.5px] text-muted-foreground shrink-0">
                            {formatRelative(t.receivedAt)}
                          </span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {t.participants.slice(0, 3).join(', ')}
                          {t.participants.length > 3 ? ` +${t.participants.length - 3}` : ''}
                        </div>
                        {t.snippet && (
                          <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                            {t.snippet}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Composer — fills remaining vertical space so the editor feels like a real drafting workspace */}
          <div className="flex-1 min-h-0 flex flex-col">
            {mode === 'existing' && !selectedThreadId ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10 text-muted-foreground gap-2">
                <MessageSquarePlus className="h-6 w-6 opacity-60" />
                <p className="text-sm font-medium text-foreground">Select a thread to draft your reply</p>
                <p className="text-xs">Pick a thread above, or switch to “Start New Thread”.</p>
              </div>
            ) : (
              <EmailComposerCard
                replyToName={contactName || null}
                hideReplyAnchor={mode === 'new'}
                recipients={recipients}
                onRecipientsChange={setRecipients}
                subject={subject}
                onSubjectChange={setSubject}
                body={body}
                onBodyChange={setBody}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                onFilesChange={setFiles}
                onSend={canSend ? handleSend : async () => { toast.error('Select a thread first'); }}
                onDiscard={handleDiscard}
                dealName={dealName ?? undefined}
                dealId={dealId ?? undefined}
                signature={signature}
                variant="panel"
                showSubject
                className="rounded-none border-0 shadow-none mx-0 my-0 flex-1 min-h-0 pb-0"
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DraftEmailToClientContactDialog;