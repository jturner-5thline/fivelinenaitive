import { useMemo, useState } from 'react';
import { CheckSquare, Paperclip, Mail as MailIcon, Loader2, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useOutstandingItems, type OutstandingItem } from '@/hooks/useOutstandingItems';
import { useDealAuditLog } from '@/hooks/useDealAuditLog';
import type { EmailThread, EmailAttachment } from './mockEmailData';

/**
 * OutstandingItemMatchCard
 * ------------------------
 * Surfaces "Suggested Updates" for a matched deal's outstanding items based
 * on the inbound email. Two detectors run in parallel:
 *
 *  1. ATTACHMENT DETECTION — fuzzy-matches attachment filenames against the
 *     description of each open outstanding item (P&L, financial statements,
 *     NDA, balance sheet, etc.). One-click confirms `received = true` and
 *     logs the action to the deal audit timeline.
 *
 *  2. INFO FULFILLMENT — for items phrased as "Request X from <contact>",
 *     when an email arrives from that contact (matched by email or display
 *     name), suggests marking the item complete (received + approved).
 *
 * Pure UI — never auto-writes. Always shows confirm / dismiss controls.
 */

interface Props {
  /** Deal the email is matched to. Card renders nothing without this. */
  dealId?: string;
  dealName?: string;
  /** Email thread context — used to read attachments + sender. */
  thread: EmailThread;
  /** Resolved attachments from the latest message (post `useFullEmailMessage`). */
  attachments?: EmailAttachment[];
}

/** Tokens used to fuzzy-match attachment filenames -> outstanding item text. */
const DOC_KEYWORDS: Array<{ key: string; aliases: string[] }> = [
  { key: 'p&l', aliases: ['p&l', 'pnl', 'p_l', 'profit and loss', 'profit & loss', 'income statement'] },
  { key: 'balance sheet', aliases: ['balance sheet', 'balancesheet', 'bs '] },
  { key: 'cash flow', aliases: ['cash flow', 'cashflow', 'cf statement'] },
  { key: 'financial statements', aliases: ['financial statement', 'financials', 'fs ', 'audited'] },
  { key: 'nda', aliases: ['nda', 'non-disclosure', 'non disclosure'] },
  { key: 'tax return', aliases: ['tax return', 'form 1120', 'form 1065', '1040'] },
  { key: 'cap table', aliases: ['cap table', 'captable', 'capitalization table'] },
  { key: 'debt schedule', aliases: ['debt schedule', 'debtschedule', 'loan schedule'] },
  { key: 'bank statement', aliases: ['bank statement', 'bankstmt', 'bank stmt'] },
  { key: 'ar aging', aliases: ['ar aging', 'a/r aging', 'accounts receivable aging'] },
  { key: 'ap aging', aliases: ['ap aging', 'a/p aging', 'accounts payable aging'] },
  { key: 'pitch deck', aliases: ['pitch deck', 'deck', 'investor deck'] },
  { key: 'use of funds', aliases: ['use of funds', 'uof'] },
  { key: 'collateral', aliases: ['collateral'] },
  { key: 'kyc', aliases: ['kyc', 'know your customer'] },
  { key: 'operating agreement', aliases: ['operating agreement', 'op agreement', 'llc agreement'] },
];

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Returns the matched canonical document keyword if `filename` contains any
 * alias for the same keyword family that also appears in `itemText`.
 */
function matchDocKeyword(filename: string, itemText: string): string | null {
  const f = normalize(filename);
  const t = normalize(itemText);
  for (const { key, aliases } of DOC_KEYWORDS) {
    const hitInItem = aliases.some((a) => t.includes(a)) || t.includes(key);
    if (!hitInItem) continue;
    const hitInFile = aliases.some((a) => f.includes(a)) || f.includes(key);
    if (hitInFile) return key;
  }
  // Generic last-ditch token overlap (e.g. item says "send Q3 2025 financials"
  // and file is "Q3-2025-financials.pdf").
  const fileTokens = new Set(f.split(' ').filter((w) => w.length >= 4));
  const itemTokens = t.split(' ').filter((w) => w.length >= 4);
  const shared = itemTokens.filter((w) => fileTokens.has(w));
  if (shared.length >= 2) return shared.slice(0, 3).join(' ');
  return null;
}

interface AttachmentMatch {
  item: OutstandingItem;
  attachment: EmailAttachment;
  matchedOn: string;
}

interface ContactMatch {
  item: OutstandingItem;
  /** The "from <contact>" portion extracted from the item text. */
  requestedFrom: string;
}

/**
 * Detect items phrased as "Request X from <contact>" / "Ask <contact> for Y"
 * etc. where the inbound sender's email or display-name matches <contact>.
 */
function detectContactFulfillment(
  items: OutstandingItem[],
  fromName: string,
  fromEmail: string,
): ContactMatch[] {
  const senderName = normalize(fromName);
  const senderEmail = (fromEmail || '').toLowerCase();
  const senderLocal = senderEmail.split('@')[0] || '';
  const matches: ContactMatch[] = [];

  for (const item of items) {
    if (item.received) continue;
    const t = normalize(item.text);
    // Patterns: "request X from Jane", "ask Jane for X", "follow up with Jane on X"
    const m =
      t.match(/from\s+([a-z][a-z\s.'-]{1,40})/) ||
      t.match(/ask\s+([a-z][a-z\s.'-]{1,40})\s+(?:for|about)/) ||
      t.match(/follow\s*up\s+with\s+([a-z][a-z\s.'-]{1,40})/);
    if (!m) continue;
    const target = m[1].trim().replace(/\s+(for|about|on|to)$/, '').trim();
    if (!target) continue;
    // Match on first name token, full name, or email local-part.
    const targetTokens = target.split(' ').filter(Boolean);
    const firstName = targetTokens[0];
    const hit =
      (senderName && (senderName.includes(target) || (firstName && senderName.includes(firstName)))) ||
      (senderLocal && firstName && senderLocal.includes(firstName));
    if (hit) matches.push({ item, requestedFrom: target });
  }
  return matches;
}

export function OutstandingItemMatchCard({ dealId, dealName, thread, attachments }: Props) {
  const { items, updateItem } = useOutstandingItems(dealId);
  const { logAuditAction } = useDealAuditLog(dealId);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const openItems = useMemo(() => items.filter((i) => !i.received), [items]);

  const attachmentMatches = useMemo<AttachmentMatch[]>(() => {
    if (!attachments || attachments.length === 0 || openItems.length === 0) return [];
    const out: AttachmentMatch[] = [];
    const seenItemIds = new Set<string>();
    for (const att of attachments) {
      if (att.is_inline) continue;
      const fname = att.filename || '';
      if (!fname) continue;
      for (const item of openItems) {
        if (seenItemIds.has(item.id)) continue;
        const hit = matchDocKeyword(fname, item.text);
        if (hit) {
          out.push({ item, attachment: att, matchedOn: hit });
          seenItemIds.add(item.id);
          break;
        }
      }
    }
    return out;
  }, [attachments, openItems]);

  const contactMatches = useMemo<ContactMatch[]>(() => {
    return detectContactFulfillment(
      openItems,
      thread.latestEmail?.from_name || '',
      thread.latestEmail?.from_email || '',
    );
  }, [openItems, thread.latestEmail?.from_name, thread.latestEmail?.from_email]);

  // Filter out dismissed and any items already covered by attachment match.
  const visibleAttachmentMatches = attachmentMatches.filter((m) => !dismissed.has(`att:${m.item.id}`));
  const visibleContactMatches = contactMatches.filter(
    (m) => !dismissed.has(`contact:${m.item.id}`) && !attachmentMatches.some((a) => a.item.id === m.item.id),
  );

  if (!dealId || (visibleAttachmentMatches.length === 0 && visibleContactMatches.length === 0)) {
    return null;
  }

  const handleMarkReceived = async (
    item: OutstandingItem,
    kind: 'attachment' | 'contact',
    extra: { matchedOn?: string; attachmentName?: string; requestedFrom?: string },
  ) => {
    setWorking((w) => ({ ...w, [item.id]: true }));
    try {
      // For attachments → received only. For contact-fulfillment of an
      // info request → mark complete (received + approved) per spec.
      const updates =
        kind === 'attachment'
          ? { received: true }
          : { received: true, approved: true };
      await updateItem(item.id, updates);
      await logAuditAction(
        kind === 'attachment'
          ? 'outstanding_item_marked_received_from_email'
          : 'outstanding_item_completed_from_contact_email',
        'outstanding_item',
        item.id,
        item.text,
        {
          source: 'ai_assist_email',
          thread_id: thread.threadId,
          thread_subject: thread.subject || null,
          from_name: thread.latestEmail?.from_name || null,
          from_email: thread.latestEmail?.from_email || null,
          matched_on: extra.matchedOn || null,
          attachment_filename: extra.attachmentName || null,
          requested_from: extra.requestedFrom || null,
          confirmed_at: new Date().toISOString(),
        },
      );
      toast.success(
        kind === 'attachment'
          ? `Marked received on ${dealName || 'deal'}`
          : `Marked complete on ${dealName || 'deal'}`,
        {
          description:
            kind === 'attachment'
              ? `"${item.text}" — ${extra.attachmentName || 'attachment'}`
              : `"${item.text}" — ${thread.latestEmail?.from_name || 'sender'}`,
        },
      );
      setDismissed((d) => {
        const n = new Set(d);
        n.add(`${kind === 'attachment' ? 'att' : 'contact'}:${item.id}`);
        return n;
      });
    } catch (err) {
      console.error(err);
      toast.error('Could not update outstanding item');
    } finally {
      setWorking((w) => ({ ...w, [item.id]: false }));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Outstanding Items
          <span className="ml-1.5 text-muted-foreground/50 normal-case tracking-normal">
            · {visibleAttachmentMatches.length + visibleContactMatches.length} suggested
          </span>
        </p>
      </div>

      <div className="space-y-2">
        {visibleAttachmentMatches.map(({ item, attachment, matchedOn }) => (
          <div
            key={`att-${item.id}`}
            className="rounded-md border border-white/[0.08] bg-background/40 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-muted/20">
              <Paperclip className="h-3 w-3 text-primary/80 shrink-0" />
              <span className="text-[11px] font-medium text-foreground/85 truncate flex-1">
                {matchedOn.toUpperCase()} received from {thread.latestEmail?.from_name || 'sender'}
              </span>
              <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0">
                attachment
              </Badge>
            </div>
            <div className="px-3 py-2.5 space-y-2">
              <Row label="Deal" value={dealName || '—'} />
              <Row label="Item" value={item.text} />
              <Row label="File" value={attachment.filename || 'attachment'} mono />
              <p className="text-[11px] text-muted-foreground/85 leading-snug pt-1">
                Mark this outstanding item as <span className="text-foreground/90">received</span> on {dealName || 'this deal'}?
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  disabled={!!working[item.id]}
                  onClick={() =>
                    handleMarkReceived(item, 'attachment', {
                      matchedOn,
                      attachmentName: attachment.filename,
                    })
                  }
                >
                  {working[item.id] ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckSquare className="h-3 w-3" />
                  )}
                  Mark received
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] gap-1 text-muted-foreground"
                  onClick={() =>
                    setDismissed((d) => {
                      const n = new Set(d);
                      n.add(`att:${item.id}`);
                      return n;
                    })
                  }
                >
                  <X className="h-3 w-3" /> Dismiss
                </Button>
              </div>
            </div>
          </div>
        ))}

        {visibleContactMatches.map(({ item, requestedFrom }) => (
          <div
            key={`contact-${item.id}`}
            className="rounded-md border border-white/[0.08] bg-background/40 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-muted/20">
              <MailIcon className="h-3 w-3 text-primary/80 shrink-0" />
              <span className="text-[11px] font-medium text-foreground/85 truncate flex-1">
                Reply from {thread.latestEmail?.from_name || requestedFrom} — fulfill request?
              </span>
              <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0">
                contact
              </Badge>
            </div>
            <div className="px-3 py-2.5 space-y-2">
              <Row label="Deal" value={dealName || '—'} />
              <Row label="Item" value={item.text} />
              <Row
                label="Sender"
                value={`${thread.latestEmail?.from_name || ''} <${thread.latestEmail?.from_email || ''}>`}
                mono
              />
              <p className="text-[11px] text-muted-foreground/85 leading-snug pt-1">
                This email looks like a response to "request from {requestedFrom}". Mark the item complete?
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  disabled={!!working[item.id]}
                  onClick={() => handleMarkReceived(item, 'contact', { requestedFrom })}
                >
                  {working[item.id] ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckSquare className="h-3 w-3" />
                  )}
                  Mark complete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] gap-1 text-muted-foreground"
                  onClick={() =>
                    setDismissed((d) => {
                      const n = new Set(d);
                      n.add(`contact:${item.id}`);
                      return n;
                    })
                  }
                >
                  <X className="h-3 w-3" /> Not this one
                </Button>
                {dealId && (
                  <a
                    href={`/deal/${dealId}?tab=outstanding`}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Open list <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="text-muted-foreground/70 w-14 shrink-0">{label}</span>
      <span className={`flex-1 text-foreground/90 break-words ${mono ? 'font-mono text-[10.5px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}
