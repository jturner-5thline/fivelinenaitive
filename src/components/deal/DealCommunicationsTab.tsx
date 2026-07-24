import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Mail, ArrowDownLeft, ArrowUpRight, Loader2, Paperclip } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

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
            .select('contact_info')
            .eq('id', dealId)
            .maybeSingle(),
          supabase
            .from('contact_deals')
            .select('contact_id')
            .eq('deal_id', dealId),
        ]);

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

        let fromContacts: CommItem[] = [];
        if (contactEmails.size > 0) {
          const emails = Array.from(contactEmails);
          const orFrom = `from_email.in.(${emails.map((e) => `"${e}"`).join(',')})`;
          const orTo = `to_emails.ov.{${emails.join(',')}}`;
          const orCc = `cc_emails.ov.{${emails.join(',')}}`;
          // Query BOTH tables: `email_cache` holds real synced Nylas/Gmail
          // messages, `gmail_messages` holds a legacy/demo mirror. Same shape.
          const [cacheRes, gmailRes] = await Promise.all([
            supabase
              .from('email_cache')
              .select('gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at')
              .or([orFrom, orTo, orCc].join(','))
              .order('received_at', { ascending: false, nullsFirst: false })
              .limit(200),
            supabase
              .from('gmail_messages')
              .select('gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at')
              .or([orFrom, orTo, orCc].join(','))
              .order('received_at', { ascending: false, nullsFirst: false })
              .limit(200),
          ]);
          const cmsgs = [...(cacheRes.data ?? []), ...(gmailRes.data ?? [])];
          fromContacts = cmsgs.map((m: any) => ({
            key: `cm:${m.gmail_message_id}`,
            source: 'deal_emails',
            message_id: m.gmail_message_id,
            thread_id: m.thread_id ?? null,
            subject: m.subject ?? '(no subject)',
            from: m.from_name || m.from_email || '',
            to: (m.to_emails ?? []) as string[],
            preview: (m.snippet ?? '').slice(0, 220),
            direction: null,
            sent_at: m.received_at ?? null,
          }));
        }

        // Live Nylas fetch: email_cache is populated only from INBOX sync,
        // so recently-sent outbound messages (before any reply arrives) are
        // missing. Query Gmail directly across ALL mail for from/to matches
        // on any client-contact email and merge results in.
        let fromLive: CommItem[] = [];
        if (contactEmails.size > 0) {
          try {
            const emails = Array.from(contactEmails);
            const query = emails
              .flatMap((e) => [`from:${e}`, `to:${e}`, `cc:${e}`, `bcc:${e}`])
              .join(' OR ');
            const { data: live } = await supabase.functions.invoke('gmail-messages', {
              body: {
                action: 'list',
                max_results: 50,
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
      {threads.map((t) => (
        <div key={t.thread_id} className="rounded-lg border border-border/40 bg-card/40">
          <div className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{t.subject}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {t.msgs.length} message{t.msgs.length === 1 ? '' : 's'}
                {t.latest ? ` · last activity ${formatDistanceToNow(new Date(t.latest), { addSuffix: true })}` : ''}
              </div>
            </div>
          </div>
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
                  <div className="flex items-center gap-2 mt-1.5">
                    {m.has_attachments && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] gap-0.5">
                        <Paperclip className="h-2.5 w-2.5" /> attachment
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground/70">{m.source === 'activity_logs' ? 'activity' : 'inbox link'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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

export default DealCommunicationsTab;