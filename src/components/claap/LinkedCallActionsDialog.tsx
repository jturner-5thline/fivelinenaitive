/**
 * LinkedCallActionsDialog
 * -----------------------
 * Action menu shown for a meeting that already has a Claap recording linked.
 * "Draft Q&A" expands the dialog: the call transcript is turned into an
 * accurate lender-question / client-answer log plus a human-style follow-up
 * email that the user can edit, address and send.
 */
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageSquareText, FileText, ChevronRight, ChevronLeft, Loader2, Send, ArrowLeft, Mail, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailRichTextEditor } from '@/components/deal/email/EmailRichTextEditor';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { searchLenderDealThreads, type LenderThreadMatch } from '@/lib/deal/lenderThreadSearch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle?: string | null;
  recordingTitle?: string | null;
  /** claap_meetings.id when known — most reliable resolver. */
  meetingId?: string | null;
  /** Claap recording id (claap_meetings.claap_id) when the meeting id isn't at hand. */
  recordingId?: string | null;
  /** Deal context — lets the lender follow-up reply inside the existing deal thread. */
  dealId?: string | null;
  dealName?: string | null;
  company?: string | null;
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

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bold a leading "Q:" / "A:" / "Question:" / "Answer:" marker. */
function markQa(line: string): string {
  const m = line.match(/^((?:Q|A|Question|Answer)\b[^:]{0,40}:)\s*(.*)$/i);
  if (m) return `<strong>${esc(m[1])}</strong> ${esc(m[2])}`;
  return esc(line);
}

/**
 * Convert an AI plain-text draft into well-spaced HTML for the rich editor:
 * every line becomes its own paragraph, section headings ("Questions & Answers",
 * "Outstanding Items", etc.) are bolded, bullets become real lists, and Q/A
 * markers are bolded so pairs read clearly.
 */
function toHtml(text: string): string {
  if (!text) return '';
  if (/<(p|div|br|ul|ol|h[1-6])\b/i.test(text)) return text;

  const lines = text.split(/\n/);
  const out: string[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length) {
      out.push(`<ul>${bullets.map((b) => `<li><p>${b}</p></li>`).join('')}</ul>`);
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }

    if (/^[-•*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      bullets.push(markQa(line.replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '')));
      continue;
    }
    flush();

    // Section heading: short line ending in ':' with no sentence punctuation,
    // or a known section title.
    const isHeading =
      (/:$/.test(line) && line.length <= 60 && !/^(Q|A|Question|Answer)\b/i.test(line)) ||
      /^(questions?\s*(&|and)\s*answers?|q\s*&\s*a|outstanding items?|open items?|next steps?|summary|call summary|recap)\s*:?$/i.test(line);

    if (isHeading) {
      out.push(`<p><strong>${esc(line.replace(/:$/, ''))}</strong></p>`);
      continue;
    }
    out.push(`<p>${markQa(line)}</p>`);
  }
  flush();
  return out.join('');
}

const ACTIONS: ActionOption[] = [
  {
    key: 'draft-qa',
    label: 'Draft Post-Call Q&A for Lenders',
    description: 'Turn the call into a question & answer list you can review and send.',
    icon: MessageSquareText,
  },
  {
    key: 'draft-client-summary',
    label: 'Draft Post-Call Summary to Client',
    description: 'Turn the call into a client-facing recap you can review and send.',
    icon: FileText,
  },
];

export function LinkedCallActionsDialog({
  open, onOpenChange, eventTitle, recordingTitle, meetingId, recordingId,
  dealId, dealName, company,
}: Props) {
  const [mode, setMode] = useState<'menu' | 'qa'>('menu');
  const [draftKind, setDraftKind] = useState<'qa' | 'client_summary'>('qa');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QaResult | null>(null);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [savedKinds, setSavedKinds] = useState<Record<string, boolean>>({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [thread, setThread] = useState<LenderThreadMatch | null>(null);
  const [threadOptions, setThreadOptions] = useState<LenderThreadMatch[]>([]);
  const [threadPickerOpen, setThreadPickerOpen] = useState(false);
  const [threadSearching, setThreadSearching] = useState(false);
  const [dealCtx, setDealCtx] = useState<{ name: string; company: string } | null>(
    dealName ? { name: dealName, company: company || '' } : null,
  );
  const hydratingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dealCtxRef = useRef<{ name: string; company: string } | null>(
    dealName ? { name: dealName, company: company || '' } : null,
  );
  const threadLookupRef = useRef<string | null>(null);
  /** Deal's client contact email — the recap should go to (and thread with) them. */
  const clientEmailRef = useRef<string | null>(null);

  const title = recordingTitle || eventTitle || 'Linked call';
  const callKey = meetingId || recordingId || `title:${title}`;

  // Resolve deal name/company (and the client contact) from the deal id.
  useEffect(() => {
    if (!open) return;
    if (dealName) setDealCtx({ name: dealName, company: company || '' });
    if (!dealId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deals')
        .select('company, contact_email, contact_info')
        .eq('id', dealId)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as { company?: string; contact_email?: string; contact_info?: string };
      const resolvedCompany = row.company || '';
      if (!dealName) setDealCtx({ name: resolvedCompany, company: resolvedCompany });
      const raw = `${row.contact_email || ''} ${row.contact_info || ''}`;
      const legacyEmail = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i)?.[0] || null;

      // Linked deal contacts are the canonical source. Legacy contact fields
      // can be stale and may point the recap search at a lender participant.
      const { data: links } = await supabase
        .from('contact_deals')
        .select('contact_id, role, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      const orderedLinks = [...(links || [])].sort((a, b) => {
        const aPrimary = (a.role || '').toLowerCase() === 'primary' ? 0 : 1;
        const bPrimary = (b.role || '').toLowerCase() === 'primary' ? 0 : 1;
        return aPrimary - bPrimary;
      });
      const contactIds = orderedLinks.map((link) => link.contact_id).filter(Boolean);
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase.from('contacts').select('id, email').in('id', contactIds);
        if (cancelled) return;
        const emailsById = new Map((contacts || []).map((contact) => [contact.id, contact.email]));
        clientEmailRef.current = orderedLinks
          .map((link) => emailsById.get(link.contact_id))
          .find((email): email is string => Boolean(email)) || legacyEmail;
      } else {
        clientEmailRef.current = legacyEmail;
      }
    })();
    return () => { cancelled = true; };
  }, [open, dealId, dealName, company]);

  useEffect(() => { dealCtxRef.current = dealCtx; }, [dealCtx]);

  /** Use a thread: reply inside it and mirror its subject into the Subject field. */
  const selectThread = (match: LenderThreadMatch) => {
    setThread(match);
    setThreadPickerOpen(false);
    const next = /^re:/i.test(match.subject) ? match.subject : `Re: ${match.subject}`;
    setSubject((prev) => (prev.trim().toLowerCase() === next.trim().toLowerCase() ? prev : next));
  };

  /**
   * Find the live email thread with this recipient about this deal and reuse its
   * subject (as a `Re:`) so the message lands in the existing conversation.
   * When the match is ambiguous, the candidates are surfaced for the user to pick.
   */
  const applyLenderThreadSubject = async (recipient: string, existingSubject?: string) => {
    const email = (recipient || '').trim();
    const domain = email.includes('@') ? email.split('@')[1].trim().toLowerCase() : '';
    const ctx = dealCtxRef.current;
    if (!domain || !ctx?.name) return;
    const lookupKey = `${email}|${ctx.name}`;
    if (threadLookupRef.current === lookupKey) return;
    threadLookupRef.current = lookupKey;
    setThreadSearching(true);
    try {
      const matches = await searchLenderDealThreads({
        domain,
        email,
        dealName: ctx.name,
        company: ctx.company,
        limit: 5,
      });
      setThreadOptions(matches);
      const best = matches[0];
      if (!best) { threadLookupRef.current = null; return; }
      const runnerUp = matches[1];
      const confident = best.subject_match && (!runnerUp || best.score - runnerUp.score >= 8);
      if (confident) {
        selectThread(best);
      } else {
        // Ambiguous — let the user choose which thread to reply in.
        setThreadPickerOpen(true);
      }
    } catch {
      // keep the AI-generated subject
    } finally {
      setThreadSearching(false);
      // This ref only deduplicates an in-flight lookup. A refreshed draft must
      // be allowed to look the thread up again after the AI resets its subject.
      threadLookupRef.current = null;
    }
  };

  // Deal context can resolve after the draft loads — retry the thread lookup then.
  useEffect(() => {
    if (!open || mode !== 'qa') return;
    if (!to || !dealCtx?.name || thread || threadOptions.length > 0) return;
    void applyLenderThreadSubject(to, subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, draftKind, to, dealCtx, thread, threadOptions.length]);

  /** Persist the current draft (debounced by callers). */
  const persistDraft = async (
    kind: 'qa' | 'client_summary',
    payload: { to: string; cc: string; bcc: string; subject: string; body: string; result: QaResult | null },
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSavingDraft(true);
    try {
      await supabase.from('claap_call_email_drafts').upsert([{
        user_id: user.id,
        call_key: callKey,
        draft_kind: kind,
        meeting_id: meetingId || null,
        recording_id: recordingId || null,
        to_addr: payload.to,
        cc_addr: payload.cc,
        bcc_addr: payload.bcc,
        subject: payload.subject,
        body_html: payload.body,
        result: (payload.result ?? null) as never,
      }], { onConflict: 'user_id,call_key,draft_kind' });
      setSavedKinds((prev) => ({ ...prev, [kind]: true }));
    } finally {
      setSavingDraft(false);
    }
  };

  // Which kinds already have a saved draft for this call?
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('claap_call_email_drafts')
        .select('draft_kind')
        .eq('call_key', callKey);
      if (cancelled) return;
      const map: Record<string, boolean> = {};
      (data || []).forEach((r: { draft_kind: string }) => { map[r.draft_kind] = true; });
      setSavedKinds(map);
    })();
    return () => { cancelled = true; };
  }, [open, callKey]);

  // Debounced autosave of user edits.
  useEffect(() => {
    if (!open || mode !== 'qa' || !result || hydratingRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistDraft(draftKind, { to, cc, bcc, subject, body, result });
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, body, result, draftKind, mode, open]);

  useEffect(() => {
    if (!open) {
      // Reset only after the close animation so the panel doesn't flicker.
      const t = setTimeout(() => {
        setMode('menu');
        setDraftKind('qa');
        setResult(null);
        setLoading(false);
        setTo('');
        setCc('');
        setBcc('');
        setShowCc(false);
        setShowBcc(false);
        setSubject('');
        setBody('');
        setCopied(false);
        setShowDetails(false);
        setThread(null);
        setThreadOptions([]);
        setThreadPickerOpen(false);
        threadLookupRef.current = null;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  /** Open a kind: load the saved draft when one exists, otherwise generate. */
  const openDraft = async (kind: 'qa' | 'client_summary') => {
    setDraftKind(kind);
    setMode('qa');
    setLoading(true);
    try {
      const { data } = await supabase
        .from('claap_call_email_drafts')
        .select('*')
        .eq('call_key', callKey)
        .eq('draft_kind', kind)
        .maybeSingle();
      if (data) {
        hydratingRef.current = true;
        setResult((data.result as unknown as QaResult) ?? { summary: '', qa: [], outstanding_items: [], email_subject: data.subject, email_body: '' });
        setTo(data.to_addr || '');
        setCc(data.cc_addr || '');
        setBcc(data.bcc_addr || '');
        setShowCc(Boolean(data.cc_addr));
        setShowBcc(Boolean(data.bcc_addr));
        setSubject(data.subject || '');
        setBody(data.body_html || '');
        setLoading(false);
        setTimeout(() => { hydratingRef.current = false; }, 0);
        if (data.to_addr) {
          void applyLenderThreadSubject(data.to_addr, data.subject || '');
        }
        return;
      }
    } catch {
      // fall through to generating a fresh draft
    }
    await runDraft(kind);
  };

  const runDraft = async (kind: 'qa' | 'client_summary') => {
    setDraftKind(kind);
    setMode('qa');
    setLoading(true);
    setThread(null);
    setThreadOptions([]);
    setThreadPickerOpen(false);
    threadLookupRef.current = null;
    try {
      const { data, error } = await supabase.functions.invoke('claap-draft-qa', {
        body: {
          meeting_id: meetingId || null,
          recording_id: recordingId || null,
          title,
          draft_mode: kind === 'client_summary' ? 'client_summary' : 'qa',
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const res = data as QaResult;
      const nextSubject = res.email_subject || `${kind === 'client_summary' ? 'Recap' : 'Follow-up'}: ${title}`;
      const nextBody = toHtml(res.email_body || '');
      const suggested = (res.suggested_recipients || []).filter(Boolean);
      const clientEmail = clientEmailRef.current;
      const clientDomain = clientEmail?.split('@')[1]?.toLowerCase();
      // The recap goes to the client — prefer the deal's client contact (or a
      // participant at the client's domain) over the first call participant.
      const nextTo =
        kind === 'client_summary'
          ? suggested.find((e) => clientDomain && e.toLowerCase().endsWith(`@${clientDomain}`)) ||
            clientEmail ||
            suggested[0] ||
            ''
          : suggested[0] || '';
      hydratingRef.current = true;
      setResult(res);
      setSubject(nextSubject);
      setBody(nextBody);
      setTo(nextTo);
      setTimeout(() => { hydratingRef.current = false; }, 0);
      void persistDraft(kind, { to: nextTo, cc: '', bcc: '', subject: nextSubject, body: nextBody, result: res });
      if (nextTo) void applyLenderThreadSubject(nextTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not draft the email';
      toast.error(msg);
      setMode('menu');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `To: ${to}\n${cc ? `Cc: ${cc}\n` : ''}${bcc ? `Bcc: ${bcc}\n` : ''}Subject: ${subject}\n\n${htmlToPlainText(body)}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleSend = async () => {
    const split = (s: string) => s.split(/[,;]/).map((v) => v.trim()).filter(Boolean);
    const recipients = split(to);
    const ccList = split(cc);
    const bccList = split(bcc);
    if (!recipients.length) { toast.error('Add at least one recipient'); return; }
    if (!subject.trim() || !htmlToPlainText(body).trim()) { toast.error('Subject and body are required'); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: recipients,
          cc: ccList,
          bcc: bccList,
          subject: subject.trim(),
          body_html: body,
          body: htmlToPlainText(body),
          ...(thread
            ? { thread_id: thread.thread_id, reply_to_message_id: thread.latest_message_id }
            : {}),
        },
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
      <DialogContent className={cn('flex max-h-[85vh] flex-col overflow-hidden', mode === 'qa' ? (showDetails ? 'sm:max-w-[1200px]' : 'sm:max-w-[840px]') : 'sm:max-w-[460px]')}>
        <DialogHeader className="shrink-0">
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
            {mode === 'qa'
              ? draftKind === 'client_summary' ? 'Client recap email' : 'Lender follow-up email'
              : 'Call actions'}
            {mode === 'qa' && !loading && result && (
              <div className="ml-auto flex items-center gap-1">
                <span className="text-[11px] font-normal text-muted-foreground">
                  {savingDraft ? 'Saving…' : 'Draft saved'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => void runDraft(draftKind)}
                  aria-label="Re-draft from the call transcript"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => setShowDetails((v) => !v)}
                aria-label={showDetails ? 'Hide call details' : 'Show call details'}
              >
                {showDetails
                  ? <><ChevronLeft className="h-4 w-4" /> Hide details</>
                  : <>{draftKind === 'client_summary' ? 'Summary' : <>Summary &amp; Q&amp;A</>} <ChevronRight className="h-4 w-4" /></>}
              </Button>
              </div>
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
                  onClick={
                    a.key === 'draft-qa'
                      ? () => void openDraft('qa')
                      : a.key === 'draft-client-summary'
                        ? () => void openDraft('client_summary')
                        : () => toast.info(`${a.label} — coming soon`)
                  }
                  className="w-full text-left rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2.5 flex items-start gap-2.5"
                >
                  <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {savedKinds[a.key === 'draft-qa' ? 'qa' : 'client_summary']
                        ? 'Saved draft — opens instantly, no re-analysis.'
                        : a.description}
                    </span>
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
                {draftKind === 'client_summary'
                  ? 'Reading the transcript and drafting the client recap…'
                  : 'Reading the transcript, pairing questions with answers and drafting the follow-up…'}
              </div>
            ) : result ? (
              <div className={cn('grid gap-4 flex-1 min-h-0 overflow-y-auto pr-1', showDetails && 'lg:grid-cols-2')}>
                {/* Pre-drafted email */}
                <div className="min-w-0 space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {draftKind === 'client_summary' ? 'Client recap email' : 'Lender follow-up email'}
                  </p>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder={draftKind === 'client_summary' ? 'client@example.com' : 'lender@example.com'}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {!showCc && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowCc(true)}>
                        Add Cc
                      </Button>
                    )}
                    {!showBcc && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setShowBcc(true)}>
                        Add Bcc
                      </Button>
                    )}
                  </div>
                  {showCc && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Cc</Label>
                      <Input
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="cc@example.com, other@example.com"
                        className="mt-1 h-9"
                      />
                    </div>
                  )}
                  {showBcc && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Bcc</Label>
                      <Input
                        value={bcc}
                        onChange={(e) => setBcc(e.target.value)}
                        placeholder="bcc@example.com"
                        className="mt-1 h-9"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-9" />
                    <div className="mt-1.5 space-y-1.5">
                      {threadSearching && (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Looking for the existing email thread…
                        </p>
                      )}
                      {!threadSearching && thread && (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">Replying in thread: <span className="text-foreground">{thread.subject}</span></span>
                          {threadOptions.length > 1 && (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-[11px]"
                              onClick={() => setThreadPickerOpen((v) => !v)}
                            >
                              Change
                            </Button>
                          )}
                        </p>
                      )}
                      {!threadSearching && !thread && threadOptions.length > 0 && (
                        <p className="text-[11px] text-amber-500">
                          Multiple possible threads — pick the one to reply in.
                        </p>
                      )}
                      {threadPickerOpen && threadOptions.length > 0 && (
                        <div className="rounded-md border border-border/60 divide-y divide-border/60">
                          {threadOptions.map((opt) => (
                            <button
                              key={opt.thread_id}
                              type="button"
                              onClick={() => selectThread(opt)}
                              className={cn(
                                'w-full text-left px-2.5 py-1.5 hover:bg-muted/40 transition-colors',
                                thread?.thread_id === opt.thread_id && 'bg-muted/40',
                              )}
                            >
                              <span className="block truncate text-xs font-medium">{opt.subject}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {opt.from_email}
                                {opt.latest_date ? ` · ${new Date(opt.latest_date).toLocaleDateString()}` : ''}
                                {` · ${opt.message_count} message${opt.message_count === 1 ? '' : 's'}`}
                              </span>
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => { setThread(null); setThreadPickerOpen(false); }}
                            className="w-full text-left px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40"
                          >
                            Start a new thread instead
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Message</Label>
                    <EmailRichTextEditor
                      content={body}
                      onChange={setBody}
                      className="mt-1"
                      minHeight={160}
                      placeholder="Write your follow-up…"
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
                  {draftKind !== 'client_summary' && (
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Q&amp;A</p>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{result.qa.length}</Badge>
                  </div>
                  )}
                  {draftKind !== 'client_summary' && (
                  <ScrollArea className="h-[150px] pr-3">
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
                  )}
                  {result.outstanding_items.length > 0 && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-500 mb-1">
                        {draftKind === 'client_summary' ? 'Action items' : 'Outstanding items'}
                      </p>
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
              <DialogFooter className="gap-2 shrink-0">
                <Button type="button" variant="outline" onClick={handleCopy} className="gap-1">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy draft'}
                </Button>
                <Button type="button" onClick={handleSend} disabled={sending || !to.trim()} className="gap-1">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? 'Sending…' : draftKind === 'client_summary' ? 'Send recap' : 'Send follow-up'}
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
