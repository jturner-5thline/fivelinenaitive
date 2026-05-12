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
import { differenceInDays } from 'date-fns';

interface LenderContactRow {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  is_primary: boolean | null;
}

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
 * Inline ✉ Follow Up popover anchored to a lender tile.
 *
 * Flow:
 *  1. On open, look up the lender's contacts (master_lenders.lender_contacts).
 *  2. AI-draft a short subject + body via the lender-followup-draft edge fn.
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
      // Try to pull the most recent Gmail thread involving this lender
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
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetState();
  };

  const recipientEmail = selectedContact?.email || manualEmail.trim();
  const recipientLabel = selectedContact
    ? `${selectedContact.name}${selectedContact.email ? ` <${selectedContact.email}>` : ''}`
    : (manualName || manualEmail
        ? `${manualName || ''}${manualEmail ? ` <${manualEmail}>` : ''}`.trim()
        : '');

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
          subject: subject.trim(),
          body: body,
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

      // 4. Mirror onto the lender comms timeline (per-lender history).
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
            'relative overflow-hidden inline-flex items-center justify-center h-6 w-6 rounded-md border border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)] transition-all'
          }
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[420px] p-3 z-[10000]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold">Follow up · {lenderName}</div>
          <Badge variant="secondary" className="text-[10px]">Suggested: {category}</Badge>
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
              <SelectContent className="z-[10001] max-h-60">
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
