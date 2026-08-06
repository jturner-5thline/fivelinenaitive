import { useEffect, useMemo, useState } from 'react';
import { Mail, Loader2, Send, RotateCcw, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { differenceInDays, formatDistanceToNowStrict } from 'date-fns';
import { searchLenderDealThreads, type LenderThreadMatch } from '@/lib/deal/lenderThreadSearch';

interface LenderContactRow {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  is_primary: boolean | null;
}

type ThreadMatch = LenderThreadMatch;

const NEW_THREAD = '__new__';

interface Props {
  dealId: string;
  dealName: string;
  company: string;
  dealLenderId: string;
  lenderName: string;
  lenderStage: string;
  lenderNotes?: string;
  lenderUpdatedAt?: string;
  /** Optional callback after a successful send (e.g. to refresh deal data). */
  onSent?: () => void;
  className?: string;
}

/**
 * Inline ✉ Follow Up popover anchored to a funding source tile.
 *
 * Flow:
 *  1. On open, look up the funding source's contacts (master_lenders.lender_contacts).
 *  2. AI-draft a short subject + body via the funding source-followup-draft edge fn.
 *  3. User can edit any field, swap contact, or regenerate.
 *  4. On Send: route via gmail-messages (action: 'send'), then write
 *     activity_logs (deal feed) + lender_audit_logs (lender comms timeline)
 *     and bump deal_lenders.last_contact_at + updated_at.
 */
export function LenderFollowUpPopover({
  dealId,
  dealName,
  company,
  dealLenderId,
  lenderName,
  lenderStage,
  lenderNotes,
  lenderUpdatedAt,
  onSent,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<LenderContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [masterLenderId, setMasterLenderId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('Touch Base');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  // Thread reply state
  const [threads, setThreads] = useState<ThreadMatch[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string>(NEW_THREAD);
  const [threadsResolved, setThreadsResolved] = useState(false);

  const daysSinceContact = useMemo(() => {
    if (!lenderUpdatedAt) return null;
    try {
      return differenceInDays(new Date(), new Date(lenderUpdatedAt));
    } catch {
      return null;
    }
  }, [lenderUpdatedAt]);

  // Resolve master lender + contacts when popover opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      try {
        const { data: ml } = await supabase
          .from('master_lenders')
          .select('id')
          .ilike('name', lenderName)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const mid = ml?.id ?? null;
        setMasterLenderId(mid);
        if (mid) {
          const { data: cs } = await supabase
            .from('lender_contacts')
            .select('id, name, email, title, is_primary')
            .eq('lender_id', mid)
            .order('is_primary', { ascending: false })
            .order('name', { ascending: true });
          if (cancelled) return;
          const rows = (cs ?? []) as LenderContactRow[];
          setContacts(rows);
          const primary = rows.find((r) => r.is_primary && r.email) || rows.find((r) => !!r.email);
          if (primary) setSelectedContactId(primary.id);
        } else {
          setContacts([]);
        }
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, lenderName]);

  const selectedContact = contacts.find((c) => c.id === selectedContactId) || null;

  // Search Gmail for existing threads with this funding source about this deal.
  // Runs in background as soon as we know a recipient email/domain.
  useEffect(() => {
    if (!open) return;
    const recipient = selectedContact?.email || manualEmail.trim();
    const domain = recipient.includes('@')
      ? recipient.split('@')[1].trim().toLowerCase()
      : '';
    if (!domain || !dealName) return;
    let cancelled = false;
    (async () => {
      setThreadsLoading(true);
      try {
        const q = `(from:${domain} OR to:${domain}) "${dealName}"`;
        const { data } = await supabase.functions.invoke('gmail-messages', {
          body: { action: 'list', query: q, max_results: 25, search_all_mail: true },
        });
        if (cancelled) return;
        const items: any[] = data?.messages || data?.data || [];
        // Group by thread_id, keep most recent message per thread.
        const byThread = new Map<string, ThreadMatch>();
        for (const m of items) {
          const tid = m.thread_id || m.id;
          if (!tid) continue;
          const existing = byThread.get(tid);
          const dateIso = m.received_at || (m.date ? new Date(m.date * 1000).toISOString() : null);
          if (!existing) {
            byThread.set(tid, {
              thread_id: tid,
              latest_message_id: m.id,
              subject: m.subject || '(no subject)',
              latest_date: dateIso,
              message_count: 1,
              from_email: m.from_email || '',
              to_emails: m.to_emails || [],
            });
          } else {
            existing.message_count += 1;
            const newer = dateIso && (!existing.latest_date || dateIso > existing.latest_date);
            if (newer) {
              existing.latest_message_id = m.id;
              existing.latest_date = dateIso;
              existing.subject = m.subject || existing.subject;
              existing.from_email = m.from_email || existing.from_email;
              existing.to_emails = m.to_emails || existing.to_emails;
            }
          }
        }
        const sorted = Array.from(byThread.values())
          .sort((a, b) => (b.latest_date || '').localeCompare(a.latest_date || ''))
          .slice(0, 5);
        setThreads(sorted);
        // Auto-select most recent thread if any exist.
        if (sorted.length > 0) setSelectedThreadId(sorted[0].thread_id);
        else setSelectedThreadId(NEW_THREAD);
      } catch {
        if (!cancelled) setThreads([]);
      } finally {
        if (!cancelled) setThreadsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dealName, selectedContact?.email, manualEmail]);

  const selectedThread = threads.find((t) => t.thread_id === selectedThreadId) || null;

  // Auto-generate the AI draft when the popover opens and we know a recipient.
  useEffect(() => {
    if (!open) return;
    if (subject || body) return; // already drafted/edited
    void generateDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedContactId]);

  const generateDraft = async () => {
    setDrafting(true);
    try {
      // Try to pull the most recent Gmail thread involving this funding source
      // (by recipient email domain) and this deal name. Best-effort —
      // failures are silently ignored so the draft still generates.
      let gmailContext:
        | { date?: string; from?: string; snippet?: string; subject?: string }
        | null = null;
      const recipientEmailForCtx = selectedContact?.email || manualEmail.trim();
      const domain = recipientEmailForCtx.includes('@')
        ? recipientEmailForCtx.split('@')[1].trim().toLowerCase()
        : '';
      if (domain && dealName) {
        try {
          const q = `from:${domain} OR to:${domain} "${dealName}"`;
          const { data: gmailData } = await supabase.functions.invoke('gmail-messages', {
            body: { action: 'list', query: q, max_results: 1, search_all_mail: true },
          });
          const msg = gmailData?.messages?.[0] || gmailData?.data?.[0] || null;
          if (msg) {
            const ts = msg.date || msg.received_at || msg.internal_date;
            const date = ts ? new Date(typeof ts === 'number' ? ts * 1000 : ts).toLocaleDateString() : undefined;
            const fromObj = Array.isArray(msg.from) ? msg.from[0] : msg.from;
            gmailContext = {
              date,
              from: fromObj?.email || fromObj?.name || undefined,
              subject: msg.subject || undefined,
              snippet: msg.snippet || msg.body_preview || undefined,
            };
          }
        } catch {
          // ignore — draft will fall through without gmail context.
        }
      }

      const { data, error } = await supabase.functions.invoke('lender-followup-draft', {
        body: {
          lender_name: lenderName,
          deal_name: dealName,
          company,
          stage: lenderStage,
          days_since_last_contact: daysSinceContact,
          contact_name: selectedContact?.name || manualName || '',
          notes: lenderNotes || '',
          gmail_context: gmailContext,
        },
      });
      if (error) throw error;
      if (data?.subject) setSubject(data.subject);
      if (data?.body) setBody(data.body);
      if (data?.category) setCategory(data.category);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to draft email';
      toast({ title: 'Draft failed', description: msg, variant: 'destructive' });
    } finally {
      setDrafting(false);
    }
  };

  const resetState = () => {
    setSubject('');
    setBody('');
    setManualEmail('');
    setManualName('');
    setSelectedContactId('');
    setContacts([]);
    setMasterLenderId(null);
    setCategory('Touch Base');
    setThreads([]);
    setSelectedThreadId(NEW_THREAD);
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetState();
  };

  // When replying to a thread, prefer the funding source's email from that thread.
  const threadRecipient = selectedThread
    ? (selectedThread.from_email || selectedThread.to_emails[0] || '')
    : '';
  const recipientEmail = threadRecipient || selectedContact?.email || manualEmail.trim();
  const recipientLabel = selectedContact
    ? `${selectedContact.name}${selectedContact.email ? ` <${selectedContact.email}>` : ''}`
    : (manualName || manualEmail
        ? `${manualName || ''}${manualEmail ? ` <${manualEmail}>` : ''}`.trim()
        : '');

  // When a thread is selected, send subject should match thread (with Re:).
  const effectiveSubject = selectedThread
    ? (/^re:/i.test(selectedThread.subject) ? selectedThread.subject : `Re: ${selectedThread.subject}`)
    : subject.trim();

  const handleSend = async () => {
    if (!recipientEmail) {
      toast({ title: 'Recipient required', description: 'Pick a contact or enter an email.', variant: 'destructive' });
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast({ title: 'Email is empty', description: 'Subject and body are required.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      // 1. Send via Gmail (Nylas) integration.
      const { data: sendData, error: sendErr } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: [recipientEmail],
          subject: effectiveSubject || subject.trim(),
          body: body,
          ...(selectedThread ? { reply_to_message_id: selectedThread.latest_message_id } : {}),
          deal_id: dealId,
        },
      });
      if (sendErr) throw sendErr;
      if (sendData?.error) throw new Error(sendData.error);

      const nowIso = new Date().toISOString();
      const preview = body.trim().slice(0, 100);

      // 2. Bump last_contact_at + updated_at on deal_lenders so the tile
      //    reflects fresh activity.
      await supabase
        .from('deal_lenders')
        .update({ last_contact_at: nowIso, updated_at: nowIso })
        .eq('id', dealLenderId);

      // 3. Log to deal-wide activity feed.
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        deal_id: dealId,
        user_id: user?.id ?? null,
        activity_type: 'follow_up_sent',
        description: `Follow-Up Sent to ${lenderName} — ${subject.trim()}`,
        metadata: {
          lender_name: lenderName,
          deal_lender_id: dealLenderId,
          recipient_email: recipientEmail,
          recipient_name: selectedContact?.name || manualName || null,
          subject: subject.trim(),
          body_preview: preview,
          category,
          sent_at: nowIso,
          tag: 'Follow-Up Sent',
        },
      });

      // 4. Mirror onto the funding source comms timeline (per-lender history).
      if (masterLenderId) {
        await supabase.from('lender_audit_logs').insert({
          lender_id: masterLenderId,
          user_id: user?.id ?? null,
          action: 'follow_up_sent',
          field_changed: 'communication',
          new_value: subject.trim(),
          metadata: {
            deal_id: dealId,
            deal_name: dealName,
            recipient_email: recipientEmail,
            recipient_name: selectedContact?.name || manualName || null,
            body_preview: preview,
            category,
            sent_at: nowIso,
            tag: 'Follow-Up Sent',
          },
        });
      }

      toast({ title: 'Follow-up sent', description: `Email sent to ${recipientEmail}.` });
      handleOpenChange(false);
      onSent?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send email';
      toast({ title: 'Send failed', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Follow Up"
          aria-label="Follow Up"
          className={
            className ||
            'relative overflow-hidden inline-flex items-center justify-center h-8 w-8 rounded-md border border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)] transition-all'
          }
        >
          <Mail className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[420px] p-3"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold">Follow up · {lenderName}</div>
          <Badge variant="secondary" className="text-[10px]">Suggested: {category}</Badge>
        </div>

        {/* Thread reply selection */}
        <div className="space-y-1.5 mb-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Reply to existing thread
          </Label>
          {threadsLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching for prior threads…
            </div>
          ) : threads.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No prior thread found — will start a new email.
            </p>
          ) : threads.length === 1 ? (
            <div className="text-[11px]">
              {selectedThreadId === NEW_THREAD ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Starting a new thread.</span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setSelectedThreadId(threads[0].thread_id)}
                  >
                    Reply to existing instead
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">Replying to: {threads[0].subject}</div>
                    <div className="text-muted-foreground">
                      {threads[0].message_count} message{threads[0].message_count === 1 ? '' : 's'}
                      {threads[0].latest_date ? ` · last ${formatDistanceToNowStrict(new Date(threads[0].latest_date))} ago` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-primary hover:underline whitespace-nowrap"
                    onClick={() => setSelectedThreadId(NEW_THREAD)}
                  >
                    Start new thread
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Select value={selectedThreadId} onValueChange={setSelectedThreadId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pick a thread" />
              </SelectTrigger>
              <SelectContent className=" max-h-60">
                {threads.map((t) => (
                  <SelectItem key={t.thread_id} value={t.thread_id} className="text-xs">
                    {t.subject}
                    {t.latest_date ? ` · ${new Date(t.latest_date).toLocaleDateString()}` : ''}
                    {` · ${t.message_count} msg`}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_THREAD} className="text-xs">+ Start new thread</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Recipient */}
        <div className="space-y-1.5 mb-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
          {contactsLoading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading contacts…
            </div>
          ) : contacts.length > 0 ? (
            <Select value={selectedContactId} onValueChange={(v) => setSelectedContactId(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pick a contact" />
              </SelectTrigger>
              <SelectContent className=" max-h-60">
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs" disabled={!c.email}>
                    {c.name}{c.email ? ` — ${c.email}` : ' (no email)'}
                    {c.is_primary ? ' · primary' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <Input
                placeholder="Name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="email@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          )}
          {recipientLabel && contacts.length > 0 && (
            <p className="text-[10px] text-muted-foreground truncate">→ {recipientLabel}</p>
          )}
        </div>

        {/* Subject */}
        <div className="space-y-1 mb-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={drafting ? 'Drafting…' : 'Subject'}
            className="h-8 text-xs"
            disabled={drafting}
          />
        </div>

        {/* Body */}
        <div className="space-y-1 mb-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Body</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={drafting ? 'Drafting…' : 'Email body'}
            rows={8}
            className="text-xs resize-none"
            disabled={drafting}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={generateDraft}
            disabled={drafting || sending}
            title="Regenerate draft"
          >
            {drafting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
            Regenerate
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => handleOpenChange(false)}
              disabled={sending}
            >
              <X className="h-3 w-3 mr-1" />
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px]"
              onClick={handleSend}
              disabled={sending || drafting || !recipientEmail || !subject.trim() || !body.trim()}
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
