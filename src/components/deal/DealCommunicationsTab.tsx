import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mail, ArrowDownLeft, ArrowUpRight, Loader2, Paperclip, Download, ExternalLink, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { downloadAttachment, openAttachmentInNewTab } from '@/components/deal/email/useFullEmailMessage';
import { toast } from 'sonner';
import { EmailViewerDialog, type EmailViewerMessage } from '@/components/deal/email/EmailViewerDialog';

interface EmailAttachmentMeta {
  id: string;
  filename: string;
  content_type: string;
  size?: number;
}

interface Props {
  dealId: string;
}

interface CommItem {
  key: string;
  source: 'activity_logs' | 'deal_emails';
  message_id: string | null;
  thread_id: string | null;
  subject: string;
  from: string;
  to: string[];
  preview: string;
  direction: 'inbound' | 'outbound' | null;
  sent_at: string | null;
  has_attachments?: boolean;
  attachments?: EmailAttachmentMeta[];
}

/**
 * Communications tab for a deal.
 *
 * Reads from two sources and merges:
 *  - activity_logs WHERE activity_type='email' AND deal_id=:dealId
 *    (the first-class "Activities" timeline added in fix #5)
 *  - deal_emails ⨝ gmail_messages
 *    (legacy/parallel link surface populated by the inbox classifier)
 *
 * Deduped on message_id, grouped by thread_id, newest first.
 */
export function DealCommunicationsTab({ dealId }: Props) {
  const [items, setItems] = useState<CommItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<EmailViewerMessage | null>(null);
  const [dealMeta, setDealMeta] = useState<{ name: string | null }>({ name: null });
  const toggleThread = useCallback((tid: string) => {
    setExpanded((prev) => ({ ...prev, [tid]: !prev[tid] }));
  }, []);
  const setAllExpanded = useCallback((open: boolean) => {
    setExpanded((prev) => {
      // Only used via the header buttons; caller passes the full set below.
      return open ? { ...prev, __all: true } : {};
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!dealId) return;
    (async () => {
      setIsLoading(true);
      try {
        const [a, b, dealRes, linksRes] = await Promise.all([
          supabase
            .from('activity_logs')
            .select('id, message_id, thread_id, subject, from_address, to_addresses, body, direction, sent_at, created_at, description')
            .eq('deal_id', dealId)
            .eq('activity_type', 'email')
            .order('sent_at', { ascending: false, nullsFirst: false })
            .limit(200),
          supabase
            .from('deal_emails')
            .select('gmail_message_id')
            .eq('deal_id', dealId)
            .limit(200),
          supabase
            .from('deals')
            .select('contact_info, company, company_url')
            .eq('id', dealId)
            .maybeSingle(),
          supabase
            .from('contact_deals')
            .select('contact_id')
            .eq('deal_id', dealId),
        ]);

        if (!cancelled) {
          setDealMeta({ name: (dealRes?.data as any)?.company ?? null });
        }

        const fromActivities: CommItem[] = (a.data ?? []).map((r: any) => ({
          key: `al:${r.id}`,
          source: 'activity_logs',
          message_id: r.message_id ?? null,
          thread_id: r.thread_id ?? null,
          subject: r.subject ?? '(no subject)',
          from: r.from_address ?? '',
          to: (r.to_addresses ?? []) as string[],
          preview: stripHtml(r.body ?? r.description ?? '').slice(0, 220),
          direction: r.direction ?? null,
          sent_at: r.sent_at ?? r.created_at ?? null,
        }));

        const linkIds = (b.data ?? []).map((r: any) => r.gmail_message_id).filter(Boolean);
        let fromGmail: CommItem[] = [];
        if (linkIds.length > 0) {
          const { data: msgs } = await supabase
            .from('gmail_messages')
            .select('gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at, has_attachments')
            .in('gmail_message_id', linkIds);
          fromGmail = (msgs ?? []).map((m: any) => ({
            key: `gm:${m.gmail_message_id}`,
            source: 'deal_emails',
            message_id: m.gmail_message_id,
            thread_id: m.thread_id ?? null,
            subject: m.subject ?? '(no subject)',
            from: m.from_name || m.from_email || '',
            to: (m.to_emails ?? []) as string[],
            preview: (m.snippet ?? '').slice(0, 220),
            direction: null,
            sent_at: m.received_at ?? null,
            has_attachments: !!m.has_attachments,
          }));
        }

        // Client-contact emails: gmail messages exchanged with any email
        // associated with this deal's client contacts (contact_deals →
        // contacts.email/additional_emails) plus the legacy free-text
        // deals.contact_info email.
        const contactEmails = new Set<string>();
        const ci = (dealRes?.data as any)?.contact_info;
        if (typeof ci === 'string') {
          const m = ci.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
          m?.forEach((e) => contactEmails.add(e.toLowerCase()));
        } else if (ci && typeof ci === 'object') {
          const e = (ci as any).email;
          if (typeof e === 'string') contactEmails.add(e.toLowerCase());
        }
        const contactIds = (linksRes?.data ?? []).map((r: any) => r.contact_id).filter(Boolean);
        if (contactIds.length > 0) {
          const { data: ctcs } = await supabase
            .from('contacts')
            .select('email, additional_emails')
            .in('id', contactIds);
          (ctcs ?? []).forEach((c: any) => {
            if (c.email) contactEmails.add(String(c.email).toLowerCase());
            const add = c.additional_emails;
            if (Array.isArray(add)) add.forEach((e: any) => e && contactEmails.add(String(e).toLowerCase()));
          });
        }

        // Derive corporate domains from client-contact emails (skip freemail
        // providers so "gmail.com" doesn't match the whole world), plus a
        // company_url domain when set on the deal. Emails from/to any
        // address at those domains are treated as deal-related.
        const FREEMAIL = new Set([
          'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','hotmail.com','outlook.com','live.com','msn.com',
          'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net',
          'ymail.com','fastmail.com','hey.com','zoho.com','yandex.com','mail.com','duck.com','tutanota.com',
        ]);
        const contactDomains = new Set<string>();
        for (const e of contactEmails) {
          const d = e.split('@')[1]?.trim().toLowerCase();
          if (d && !FREEMAIL.has(d)) contactDomains.add(d);
        }
        const cu = (dealRes?.data as any)?.company_url;
        if (typeof cu === 'string') {
          const d = cu.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].trim();
          if (d && !FREEMAIL.has(d) && /\./.test(d)) contactDomains.add(d);
        }

        // Subject-line tokens: deal.company (deal name) plus any word ≥4 chars
        // out of it (dropping generic connectors). Lets threads whose subject
        // mentions the company/deal (but that never went to a known contact)
        // still surface here — e.g. internal FWDs, intro threads, etc.
        const STOP = new Set(['deal','client','company','the','and','llc','inc','corp','group','holdings','capital','partners','ltd']);
        const subjectTokens = new Set<string>();
        const dealName = String((dealRes?.data as any)?.company ?? '').trim();
        if (dealName.length >= 3) subjectTokens.add(dealName.toLowerCase());
        for (const w of dealName.split(/[^\p{L}\p{N}]+/u)) {
          const lw = w.toLowerCase();
          if (lw.length >= 4 && !STOP.has(lw)) subjectTokens.add(lw);
        }

        // Escape ilike wildcards / commas / parens in tokens for PostgREST
        // `.or()` composition. Commas would split the OR list; percent/
        // underscore would broaden ilike matches beyond the token itself.
        const escToken = (s: string) => s.replace(/[\\%_,()]/g, '\\$&');

        let fromContacts: CommItem[] = [];
        if (contactEmails.size > 0 || contactDomains.size > 0 || subjectTokens.size > 0) {
          const emails = Array.from(contactEmails);
          const orParts: string[] = [];
          if (emails.length > 0) {
            orParts.push(`from_email.in.(${emails.map((e) => `"${e}"`).join(',')})`);
            orParts.push(`to_emails.ov.{${emails.join(',')}}`);
            orParts.push(`cc_emails.ov.{${emails.join(',')}}`);
          }
          for (const d of contactDomains) {
            orParts.push(`from_email.ilike.*@${escToken(d)}`);
            // Array wildcard match on to/cc isn't expressible in PostgREST;
            // domain-side to/cc coverage is picked up by the live Nylas
            // fetch below (which supports Gmail's `to:` operator).
          }
          for (const t of subjectTokens) {
            orParts.push(`subject.ilike.*${escToken(t)}*`);
          }
          const orExpr = orParts.join(',');
          // Query BOTH tables: `email_cache` holds real synced Nylas/Gmail
          // messages, `gmail_messages` holds a legacy/demo mirror. Same shape.
          const [cacheRes, gmailRes] = await Promise.all([
            supabase
              .from('email_cache')
              .select('gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at, attachments')
              .or(orExpr)
              .order('received_at', { ascending: false, nullsFirst: false })
              .limit(300),
            supabase
              .from('gmail_messages')
              .select('gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at')
              .or(orExpr)
              .order('received_at', { ascending: false, nullsFirst: false })
              .limit(300),
          ]);
          const cmsgs = [...(cacheRes.data ?? []), ...(gmailRes.data ?? [])];
          fromContacts = cmsgs.map((m: any) => {
            const atts = normalizeAttachmentsFromJson(m.attachments);
            return {
              key: `cm:${m.gmail_message_id}`,
              source: 'deal_emails' as const,
              message_id: m.gmail_message_id,
              thread_id: m.thread_id ?? null,
              subject: m.subject ?? '(no subject)',
              from: m.from_name || m.from_email || '',
              to: (m.to_emails ?? []) as string[],
              preview: (m.snippet ?? '').slice(0, 220),
              direction: null,
              sent_at: m.received_at ?? null,
              has_attachments: atts.length > 0,
              attachments: atts,
            };
          });
        }

        // Live Nylas fetch: email_cache is populated only from INBOX sync,
        // so recently-sent outbound messages (before any reply arrives) are
        // missing. Query Gmail directly across ALL mail for from/to matches
        // on any client-contact email and merge results in.
        let fromLive: CommItem[] = [];
        if (contactEmails.size > 0 || contactDomains.size > 0 || subjectTokens.size > 0) {
          try {
            const emails = Array.from(contactEmails);
            const parts: string[] = [];
            for (const e of emails) {
              parts.push(`from:${e}`, `to:${e}`, `cc:${e}`, `bcc:${e}`);
            }
            for (const d of contactDomains) {
              parts.push(`from:@${d}`, `to:@${d}`, `cc:@${d}`, `bcc:@${d}`);
            }
            for (const t of subjectTokens) {
              // Quote so multi-word deal names match as a phrase.
              parts.push(`subject:"${t.replace(/"/g, '')}"`);
            }
            const query = parts.join(' OR ');
            const { data: live } = await supabase.functions.invoke('gmail-messages', {
              body: {
                action: 'list',
                max_results: 100,
                search_all_mail: true,
                query,
              },
            });
            const msgs: any[] = Array.isArray((live as any)?.messages) ? (live as any).messages : [];
            fromLive = msgs.map((m: any) => {
              const to = Array.isArray(m.to)
                ? m.to.map((x: any) => x?.email ?? x).filter(Boolean)
                : Array.isArray(m.to_emails) ? m.to_emails : [];
              const fromObj = Array.isArray(m.from) ? m.from[0] : m.from;
              const fromStr = fromObj?.name || fromObj?.email || m.from_email || m.from_name || '';
              const sentAt = m.date
                ? new Date(Number(m.date) * 1000).toISOString()
                : (m.received_at ?? null);
              const id = m.id || m.gmail_message_id;
              const atts = normalizeAttachmentsFromJson(m.attachments ?? m.files);
              return {
                key: `lv:${id}`,
                source: 'deal_emails' as const,
                message_id: id ?? null,
                thread_id: m.thread_id ?? null,
                subject: m.subject ?? '(no subject)',
                from: fromStr,
                to,
                preview: (m.snippet ?? '').slice(0, 220),
                direction: null,
                sent_at: sentAt,
                has_attachments: atts.length > 0 || !!m.has_attachments,
                attachments: atts,
              };
            });
          } catch (err) {
            console.warn('[DealCommunicationsTab] live nylas fetch failed', err);
          }
        }

        // Dedupe by message_id (prefer activity_logs row since it has direction/body)
        const seen = new Set<string>();
        const merged: CommItem[] = [];
        for (const it of [...fromActivities, ...fromGmail, ...fromContacts, ...fromLive]) {
          const dedupeKey = it.message_id ?? it.key;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          merged.push(it);
        }
        merged.sort((x, y) => {
          const xt = x.sent_at ? new Date(x.sent_at).getTime() : 0;
          const yt = y.sent_at ? new Date(y.sent_at).getTime() : 0;
          return yt - xt;
        });

        if (!cancelled) setItems(merged);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  // Group by thread_id (null thread_id → standalone per message_id)
  const threads = useMemo(() => {
    const groups = new Map<string, CommItem[]>();
    for (const it of items) {
      const tid = it.thread_id ?? `__solo_${it.message_id ?? it.key}`;
      const arr = groups.get(tid) ?? [];
      arr.push(it);
      groups.set(tid, arr);
    }
    return Array.from(groups.entries())
      .map(([tid, msgs]) => ({
        thread_id: tid,
        subject: msgs[0]?.subject ?? '(no subject)',
        msgs,
        latest: msgs[0]?.sent_at ?? null,
      }))
      .sort((a, b) => {
        const at = a.latest ? new Date(a.latest).getTime() : 0;
        const bt = b.latest ? new Date(b.latest).getTime() : 0;
        return bt - at;
      });
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading communications…
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 px-6 py-12 text-center">
        <Mail className="h-6 w-6 mx-auto text-muted-foreground mb-3" />
        <div className="text-sm font-medium">No emails linked to this deal yet</div>
        <div className="text-xs text-muted-foreground mt-1">
          Inbound emails matched to this deal — and emails you send from the composer —
          will appear here as a unified timeline.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-center justify-end gap-2 -mb-1 text-[11px]">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={() => setExpanded(Object.fromEntries(threads.map((t) => [t.thread_id, true])))}
        >
          Expand all
        </button>
        <span className="text-muted-foreground/50">·</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={() => setExpanded({})}
        >
          Collapse all
        </button>
      </div>
      {threads.map((t) => {
        // Default: single-message threads open, multi-message threads collapsed.
        const isOpen = expanded[t.thread_id] ?? (t.msgs.length === 1);
        const preview = t.msgs[0];
        return (
        <div key={t.thread_id} className="rounded-lg border border-border/40 bg-card/40">
          <button
            type="button"
            onClick={() => toggleThread(t.thread_id)}
            aria-expanded={isOpen}
            className="w-full px-4 py-2.5 border-b border-border/30 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                isOpen && 'rotate-90',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{t.subject}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {t.msgs.length} message{t.msgs.length === 1 ? '' : 's'}
                {t.latest ? ` · last activity ${formatDistanceToNow(new Date(t.latest), { addSuffix: true })}` : ''}
                {!isOpen && preview?.from ? ` · ${preview.from}` : ''}
              </div>
            </div>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] shrink-0">
              {t.msgs.length}
            </Badge>
          </button>
          {isOpen && (
          <div className="divide-y divide-border/30">
            {t.msgs.map((m) => (
              <div key={m.key} className="px-4 py-3 flex items-start gap-3">
                <DirectionIcon dir={m.direction} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="font-medium text-foreground truncate max-w-[260px]">{m.from || '—'}</span>
                    {m.to.length > 0 && <span>→ {m.to.slice(0, 3).join(', ')}{m.to.length > 3 ? ` +${m.to.length - 3}` : ''}</span>}
                    {m.sent_at && <span className="ml-auto whitespace-nowrap">{formatDistanceToNow(new Date(m.sent_at), { addSuffix: true })}</span>}
                  </div>
                  {m.preview && (
                    <div className="text-xs text-foreground/80 mt-1 line-clamp-2">{m.preview}</div>
                  )}
                  <MessageAttachments item={m} />
                  <div className="mt-1">
                    <span className="text-[10px] text-muted-foreground/70">{m.source === 'activity_logs' ? 'activity' : 'inbox link'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function DirectionIcon({ dir }: { dir: 'inbound' | 'outbound' | null }) {
  if (dir === 'inbound') return <ArrowDownLeft className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />;
  if (dir === 'outbound') return <ArrowUpRight className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />;
  return <Mail className={cn('h-4 w-4 text-muted-foreground mt-0.5 shrink-0')} />;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeAttachmentsFromJson(raw: any): EmailAttachmentMeta[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [];
  const out: EmailAttachmentMeta[] = [];
  for (const a of arr) {
    if (!a || typeof a !== 'object') continue;
    if (a.is_inline) continue;
    const id = String(a.id ?? a.attachment_id ?? '');
    const filename = String(a.filename ?? a.name ?? '');
    if (!id || !filename) continue;
    out.push({
      id,
      filename,
      content_type: String(a.content_type ?? a.contentType ?? a.mimeType ?? 'application/octet-stream'),
      size: typeof a.size === 'number' ? a.size : undefined,
    });
  }
  return out;
}

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageAttachments({ item }: { item: CommItem }) {
  const [atts, setAtts] = useState<EmailAttachmentMeta[]>(item.attachments ?? []);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState((item.attachments ?? []).length > 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const messageId = item.message_id;

  const loadAttachments = useCallback(async () => {
    if (!messageId || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: { action: 'get', message_id: messageId },
      });
      if (error) throw error;
      const payload = data as any;
      const list = normalizeAttachmentsFromJson(
        payload?.message?.attachments ?? payload?.attachments,
      );
      setAtts(list);
      setLoaded(true);
      if (list.length === 0) toast.info('No downloadable attachments on this message.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [messageId, loading]);

  const handleAction = useCallback(
    async (att: EmailAttachmentMeta, mode: 'open' | 'download') => {
      if (!messageId) return;
      setBusyId(att.id);
      try {
        if (mode === 'open') await openAttachmentInNewTab(messageId, att as any);
        else await downloadAttachment(messageId, att as any);
      } catch (err: any) {
        toast.error(err?.message || 'Attachment action failed');
      } finally {
        setBusyId(null);
      }
    },
    [messageId],
  );

  // Nothing to render for messages known to have no attachments.
  if (loaded && atts.length === 0) return null;
  if (!loaded && !item.has_attachments) return null;

  if (!loaded) {
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <Badge variant="outline" className="h-4 px-1 text-[10px] gap-0.5">
          <Paperclip className="h-2.5 w-2.5" /> attachment
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={loadAttachments}
          disabled={loading || !messageId}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          {loading ? 'Loading…' : 'View attachments'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {atts.map((att) => (
        <div
          key={att.id}
          className="group inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/60 pl-2 pr-1 py-0.5 text-[11px] max-w-full"
        >
          <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
          <button
            type="button"
            onClick={() => handleAction(att, 'open')}
            className="truncate max-w-[220px] hover:underline text-left"
            title={`${att.filename}${att.size ? ` · ${formatBytes(att.size)}` : ''}`}
            disabled={busyId === att.id}
          >
            {att.filename}
          </button>
          {att.size ? (
            <span className="text-muted-foreground/70 whitespace-nowrap">· {formatBytes(att.size)}</span>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Open in new tab"
            onClick={() => handleAction(att, 'open')}
            disabled={busyId === att.id}
          >
            {busyId === att.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Download"
            onClick={() => handleAction(att, 'download')}
            disabled={busyId === att.id}
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export default DealCommunicationsTab;