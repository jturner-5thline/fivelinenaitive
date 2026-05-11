import { useMemo, useState } from 'react';
import { CheckSquare, Paperclip, Mail as MailIcon, Loader2, X, ExternalLink, ListPlus, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useOutstandingItems, type OutstandingItem } from '@/hooks/useOutstandingItems';
import { useDealAuditLog } from '@/hooks/useDealAuditLog';
import { useOutstandingItemSuggestions } from '@/hooks/useOutstandingItemSuggestions';
import { useEmailToDataRoom } from '@/hooks/useEmailToDataRoom';
import type { DealAttachmentCategory } from '@/hooks/useDealAttachments';
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
  /** Optional lender firm name resolved upstream (workflow analysis). Used
   *  for source-attribution headers like "<Lender> requested N items". */
  lenderName?: string;
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
  /** When the match came from the AI analyzer rather than the keyword fallback. */
  source: 'ai' | 'fuzzy';
  confidence?: 'low' | 'medium' | 'high';
}

interface ContactMatch {
  item: OutstandingItem;
  /** The "from <contact>" portion extracted from the item text. */
  requestedFrom: string;
  /** When the match came from the AI analyzer rather than the regex fallback. */
  source?: 'ai' | 'regex';
  /** Verbatim email sentence that fulfills the request, when AI provided it. */
  supportingQuote?: string;
  confidence?: 'low' | 'medium' | 'high';
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

export function OutstandingItemMatchCard({ dealId, dealName, thread, attachments, lenderName }: Props) {
  const { items, updateItem } = useOutstandingItems(dealId);
  const { logAuditAction } = useDealAuditLog(dealId);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { commitUpload } = useEmailToDataRoom();
  const { addItem } = useOutstandingItems(dealId);

  const openItems = useMemo(() => items.filter((i) => !i.received), [items]);

  // ── AI-driven analysis (Claude semantic match + new-item detection) ──
  // Falls back to the deterministic matchers below when AI returns nothing
  // or the call is in flight.
  const { result: aiResult } = useOutstandingItemSuggestions({
    dealId,
    dealName,
    openItems,
    attachments,
    thread,
    lenderName,
    enabled: !!dealId,
  });

  const fuzzyAttachmentMatches = useMemo<AttachmentMatch[]>(() => {
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
          out.push({ item, attachment: att, matchedOn: hit, source: 'fuzzy' });
          seenItemIds.add(item.id);
          break;
        }
      }
    }
    return out;
  }, [attachments, openItems]);

  const aiAttachmentMatches = useMemo<AttachmentMatch[]>(() => {
    const list = aiResult.attachment_matches || [];
    if (list.length === 0 || !attachments || openItems.length === 0) return [];
    const itemMap = new Map(openItems.map((i) => [i.id, i]));
    const attMap = new Map(
      (attachments || []).map((a) => [(a.filename || '').toLowerCase(), a]),
    );
    const seen = new Set<string>();
    const out: AttachmentMatch[] = [];
    for (const m of list) {
      const item = itemMap.get(m.item_id);
      const att = attMap.get((m.filename || '').toLowerCase());
      if (!item || !att || seen.has(item.id) || att.is_inline) continue;
      seen.add(item.id);
      out.push({
        item,
        attachment: att,
        matchedOn: m.matched_on || item.text.slice(0, 40),
        source: 'ai',
        confidence: m.confidence,
      });
    }
    return out;
  }, [aiResult.attachment_matches, attachments, openItems]);

  // Prefer AI matches; fall back per-item to fuzzy when AI didn't catch it.
  const attachmentMatches = useMemo<AttachmentMatch[]>(() => {
    const aiItemIds = new Set(aiAttachmentMatches.map((m) => m.item.id));
    const merged = [...aiAttachmentMatches];
    for (const m of fuzzyAttachmentMatches) {
      if (!aiItemIds.has(m.item.id)) merged.push(m);
    }
    return merged;
  }, [aiAttachmentMatches, fuzzyAttachmentMatches]);

  const regexContactMatches = useMemo<ContactMatch[]>(() => {
    return detectContactFulfillment(
      openItems,
      thread.latestEmail?.from_name || '',
      thread.latestEmail?.from_email || '',
    );
  }, [openItems, thread.latestEmail?.from_name, thread.latestEmail?.from_email]);

  const aiContactMatches = useMemo<ContactMatch[]>(() => {
    const list = aiResult.info_fulfillment_matches || [];
    if (list.length === 0) return [];
    const itemMap = new Map(openItems.map((i) => [i.id, i]));
    const out: ContactMatch[] = [];
    for (const m of list) {
      const item = itemMap.get(m.item_id);
      if (!item) continue;
      out.push({
        item,
        requestedFrom: m.requested_from || '',
        source: 'ai',
        supportingQuote: m.supporting_quote,
        confidence: m.confidence,
      });
    }
    return out;
  }, [aiResult.info_fulfillment_matches, openItems]);

  const contactMatches = useMemo<ContactMatch[]>(() => {
    const aiItemIds = new Set(aiContactMatches.map((m) => m.item.id));
    const merged = [...aiContactMatches];
    for (const m of regexContactMatches) {
      if (!aiItemIds.has(m.item.id)) merged.push({ ...m, source: 'regex' });
    }
    return merged;
  }, [aiContactMatches, regexContactMatches]);

  // Filter out dismissed and any items already covered by attachment match.
  const visibleAttachmentMatches = attachmentMatches.filter((m) => !dismissed.has(`att:${m.item.id}`));
  const visibleContactMatches = contactMatches.filter(
    (m) => !dismissed.has(`contact:${m.item.id}`) && !attachmentMatches.some((a) => a.item.id === m.item.id),
  );
  const allNewItemSuggestions = aiResult.new_item_suggestions || [];
  const visibleNewItemSuggestions = allNewItemSuggestions.filter(
    (s, i) => !dismissed.has(`new:${i}:${s.description}`),
  );

  // Group lender-request lists ("we'll need the following: …") so we can
  // render ONE approval card with a single "Add N items" CTA instead of
  // N stacked cards. Items without a group_id render as standalone cards
  // (one-off deliverables — the legacy behavior).
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, { label: string; items: typeof visibleNewItemSuggestions; firstIdx: number }> = {};
    const standalone: Array<{ s: typeof visibleNewItemSuggestions[number]; idx: number }> = [];
    visibleNewItemSuggestions.forEach((s, idx) => {
      const gid = (s as any).group_id as string | null | undefined;
      if (gid) {
        if (!groups[gid]) {
          groups[gid] = {
            label: ((s as any).group_label as string | undefined) || '',
            items: [],
            firstIdx: idx,
          };
        }
        if (!groups[gid].label && (s as any).group_label) {
          groups[gid].label = (s as any).group_label as string;
        }
        groups[gid].items.push(s);
      } else {
        standalone.push({ s, idx });
      }
    });
    // Only treat as a "grouped" card when 2+ items share a group_id —
    // a single grouped item still renders as a standalone card.
    const groupCards: Array<{ id: string; label: string; items: typeof visibleNewItemSuggestions }> = [];
    Object.entries(groups)
      .sort(([, a], [, b]) => a.firstIdx - b.firstIdx)
      .forEach(([id, g]) => {
        if (g.items.length >= 2) {
          groupCards.push({ id, label: g.label, items: g.items });
        } else {
          // Demote 1-item groups to standalone.
          g.items.forEach((s) => {
            const idx = visibleNewItemSuggestions.indexOf(s);
            standalone.push({ s, idx });
          });
        }
      });
    return { groupCards, standalone };
  }, [visibleNewItemSuggestions]);

  // Per-group selection state — defaults to all items checked. Lets the
  // user uncheck an individual line before clicking "Add N items".
  const [groupSelection, setGroupSelection] = useState<Record<string, Set<number>>>({});
  const getGroupSelected = (groupId: string, total: number): Set<number> => {
    if (groupSelection[groupId]) return groupSelection[groupId];
    // Default: all selected.
    const all = new Set<number>();
    for (let i = 0; i < total; i++) all.add(i);
    return all;
  };
  const toggleGroupItem = (groupId: string, idx: number, total: number) => {
    setGroupSelection((prev) => {
      const cur = new Set(prev[groupId] ?? Array.from({ length: total }, (_, i) => i));
      if (cur.has(idx)) cur.delete(idx);
      else cur.add(idx);
      return { ...prev, [groupId]: cur };
    });
  };

  if (
    !dealId ||
    (visibleAttachmentMatches.length === 0 &&
      visibleContactMatches.length === 0 &&
      visibleNewItemSuggestions.length === 0)
  ) {
    return null;
  }

  /**
   * Pick a sensible VDR category for the matched attachment based on the
   * outstanding-item description. Mirrors the manual category options in
   * SendToDataRoomDialog so the auto-upload lands in the right section.
   */
  const categoryForItem = (itemText: string): DealAttachmentCategory => {
    const t = (itemText || '').toLowerCase();
    if (/(p&l|pnl|profit|loss|income statement|balance sheet|cash flow|financial statement|tax return|bank statement|ar aging|ap aging|cap table|debt schedule|audited)/.test(t)) {
      return 'financials';
    }
    if (/(nda|agreement|contract|term sheet|engagement|operating agreement)/.test(t)) {
      return 'agreements';
    }
    return 'materials';
  };

  const handleConfirmAttachmentMatch = async (m: AttachmentMatch) => {
    if (!dealId) return;
    setWorking((w) => ({ ...w, [m.item.id]: true }));
    try {
      // 1. Upload the attachment to the deal VDR (one-click, no extra dialog)
      //    so the file is staged under the right section. Failure here is
      //    non-fatal — we still mark the item received so the user gets the
      //    primary value.
      const messageId =
        thread.latestEmail?.id ||
        ((thread.latestEmail as any)?.gmail_message_id as string | undefined) ||
        '';
      if (messageId && m.attachment.id) {
        try {
          await commitUpload({
            dealId,
            messageId,
            sourceEmail: {
              messageId,
              threadId: thread.threadId,
              subject: thread.subject,
              senderName: thread.latestEmail?.from_name || '',
              senderEmail: thread.latestEmail?.from_email || '',
            },
            plan: [
              {
                attachment: m.attachment,
                desiredName: m.attachment.filename || 'attachment',
                category: categoryForItem(m.item.text),
                include: true,
              },
            ],
          });
        } catch (uploadErr) {
          console.warn('[OutstandingItemMatchCard] VDR upload failed (continuing):', uploadErr);
        }
      }

      // 2. Mark the outstanding item received + log to the timeline.
      await handleMarkReceived(m.item, 'attachment', {
        matchedOn: m.matchedOn,
        attachmentName: m.attachment.filename,
      });
    } finally {
      setWorking((w) => ({ ...w, [m.item.id]: false }));
    }
  };

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

  const handleAddNewItem = async (
    suggestion: AiResultNewItemBound,
    index: number,
  ) => {
    if (!dealId) return;
    const dismissKey = `new:${index}:${suggestion.description}`;
    setWorking((w) => ({ ...w, [dismissKey]: true }));
    try {
      const mappedPriority: 'urgent' | 'high' | 'normal' =
        suggestion.priority === 'urgent'
          ? 'urgent'
          : suggestion.priority === 'high'
            ? 'high'
            : 'normal';
      const created = await addItem(suggestion.description, [], mappedPriority);
      if (created) {
        await logAuditAction(
          'outstanding_item_added_from_email',
          'outstanding_item',
          created.id,
          suggestion.description,
          {
            source: 'ai_assist_email',
            thread_id: thread.threadId,
            thread_subject: thread.subject || null,
            from_name: thread.latestEmail?.from_name || null,
            from_email: thread.latestEmail?.from_email || null,
            due_date: suggestion.due_date,
            priority: suggestion.priority,
            source_quote: suggestion.source_quote,
            confidence: suggestion.confidence,
            requested_by_lender_name:
              (suggestion as any).requested_by_lender_name || lenderName || null,
            source_message_id:
              (suggestion as any).source_message_id ||
              thread.latestEmail?.id ||
              null,
            confirmed_at: new Date().toISOString(),
          },
        );
        toast.success(`Added to ${dealName || 'deal'}`, {
          description: suggestion.description,
        });
        setDismissed((d) => {
          const n = new Set(d);
          n.add(dismissKey);
          return n;
        });
      } else {
        toast.error('Could not add outstanding item');
      }
    } finally {
      setWorking((w) => ({ ...w, [dismissKey]: false }));
    }
  };

  /**
   * Add every selected suggestion in a grouped lender-request list as a
   * separate outstanding item, in document order. Sequential to preserve
   * order; failures don't block remaining items.
   */
  const handleAddGroup = async (
    groupId: string,
    items: typeof visibleNewItemSuggestions,
  ) => {
    if (!dealId) return;
    const selected = getGroupSelected(groupId, items.length);
    const toAdd = items.filter((_, i) => selected.has(i));
    if (toAdd.length === 0) return;
    const workingKey = `group:${groupId}`;
    setWorking((w) => ({ ...w, [workingKey]: true }));
    let added = 0;
    try {
      for (const suggestion of toAdd) {
        const mappedPriority: 'urgent' | 'high' | 'normal' =
          suggestion.priority === 'urgent'
            ? 'urgent'
            : suggestion.priority === 'high'
              ? 'high'
              : 'normal';
        const created = await addItem(suggestion.description, [], mappedPriority);
        if (created) {
          added += 1;
          await logAuditAction(
            'outstanding_item_added_from_email',
            'outstanding_item',
            created.id,
            suggestion.description,
            {
              source: 'ai_assist_email_group',
              thread_id: thread.threadId,
              thread_subject: thread.subject || null,
              from_name: thread.latestEmail?.from_name || null,
              from_email: thread.latestEmail?.from_email || null,
              due_date: suggestion.due_date,
              priority: suggestion.priority,
              source_quote: suggestion.source_quote,
              confidence: suggestion.confidence,
              requested_by_lender_name:
                (suggestion as any).requested_by_lender_name || lenderName || null,
              source_message_id:
                (suggestion as any).source_message_id ||
                thread.latestEmail?.id ||
                null,
              group_id: groupId,
              group_size: items.length,
              confirmed_at: new Date().toISOString(),
            },
          );
        }
      }
      if (added > 0) {
        toast.success(`Added ${added} outstanding item${added === 1 ? '' : 's'} to ${dealName || 'deal'}`);
      }
      // Dismiss all items in this group regardless of partial failures —
      // the audit trail captures what got created.
      setDismissed((d) => {
        const n = new Set(d);
        items.forEach((s) => {
          const idxInVisible = visibleNewItemSuggestions.indexOf(s);
          n.add(`new:${idxInVisible}:${s.description}`);
        });
        return n;
      });
    } catch (err) {
      console.error('[OutstandingItemMatchCard] group add failed:', err);
      if (added === 0) toast.error('Could not add outstanding items');
    } finally {
      setWorking((w) => ({ ...w, [workingKey]: false }));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Outstanding Items
          <span className="ml-1.5 text-muted-foreground/50 normal-case tracking-normal">
            · {visibleAttachmentMatches.length + visibleContactMatches.length + visibleNewItemSuggestions.length} suggested
          </span>
        </p>
      </div>

      <div className="space-y-2">
        {/* GROUPED LENDER REQUESTS — top priority. One card per detected
            list, with one bulk "Add N items" CTA and per-line checkboxes. */}
        {groupedSuggestions.groupCards.map((group) => {
          const selected = getGroupSelected(group.id, group.items.length);
          const selectedCount = selected.size;
          const workingKey = `group:${group.id}`;
          const lenderForLabel =
            (group.items[0] as any)?.requested_by_lender_name ||
            lenderName ||
            thread.latestEmail?.from_name ||
            'Sender';
          const headerLabel =
            group.label ||
            `${lenderForLabel} requested ${group.items.length} items for ${dealName || 'this deal'}`;
          return (
            <div
              key={`group-${group.id}`}
              className="rounded-md border border-primary/30 bg-primary/[0.04] overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/15 bg-primary/[0.05]">
                <ListPlus className="h-3 w-3 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-foreground/90 truncate flex-1">
                  {headerLabel}
                </span>
                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0">
                  {group.items.length} requested
                </Badge>
              </div>
              <div className="px-3 py-2.5 space-y-2">
                <Row label="Deal" value={dealName || '—'} />
                <Row
                  label="From"
                  value={`${thread.latestEmail?.from_name || ''}${thread.latestEmail?.from_email ? ` <${thread.latestEmail.from_email}>` : ''}`}
                  mono
                />
                <ul className="space-y-1 pt-1">
                  {group.items.map((s, i) => {
                    const isChecked = selected.has(i);
                    return (
                      <li key={`${group.id}-${i}`} className="flex items-start gap-2 text-[11px]">
                        <button
                          type="button"
                          aria-label={isChecked ? 'Exclude this item' : 'Include this item'}
                          onClick={() => toggleGroupItem(group.id, i, group.items.length)}
                          className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                            isChecked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-white/20 bg-background/40'
                          }`}
                        >
                          {isChecked && <CheckSquare className="h-2.5 w-2.5" />}
                        </button>
                        <span className={`flex-1 leading-snug ${isChecked ? 'text-foreground/90' : 'text-muted-foreground line-through'}`}>
                          {s.description}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {group.items[0]?.source_quote && (
                  <div className="text-[10.5px] text-muted-foreground/85 italic leading-snug border-l-2 border-white/[0.08] pl-2 mt-1">
                    "{group.items[0].source_quote}"
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    disabled={!!working[workingKey] || selectedCount === 0}
                    onClick={() => handleAddGroup(group.id, group.items)}
                  >
                    {working[workingKey] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ListPlus className="h-3 w-3" />
                    )}
                    Add {selectedCount} Outstanding Item{selectedCount === 1 ? '' : 's'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] gap-1 text-muted-foreground"
                    onClick={() =>
                      setDismissed((d) => {
                        const n = new Set(d);
                        group.items.forEach((s) => {
                          const idxInVisible = visibleNewItemSuggestions.indexOf(s);
                          n.add(`new:${idxInVisible}:${s.description}`);
                        });
                        return n;
                      })
                    }
                  >
                    <X className="h-3 w-3" /> Dismiss all
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

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
                Add the file to the data room and mark this item as <span className="text-foreground/90">received</span> on {dealName || 'this deal'}?
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  disabled={!!working[item.id]}
                  onClick={() =>
                    handleConfirmAttachmentMatch({
                      item,
                      attachment,
                      matchedOn,
                      source: 'ai',
                    })
                  }
                >
                  {working[item.id] ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckSquare className="h-3 w-3" />
                  )}
                  Add to VDR & mark received
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

        {visibleContactMatches.map(({ item, requestedFrom, supportingQuote }) => (
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
              {supportingQuote && (
                <div className="text-[11px] text-muted-foreground/85 italic leading-snug border-l-2 border-white/[0.08] pl-2 mt-1">
                  "{supportingQuote}"
                </div>
              )}
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

        {/* Standalone (ungrouped) new-item suggestions render with the
            legacy single-item card. */}
        {groupedSuggestions.standalone.map(({ s, idx }) => {
          const dismissKey = `new:${idx}:${s.description}`;
          return (
            <div
              key={dismissKey}
              className="rounded-md border border-white/[0.08] bg-background/40 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-muted/20">
                <ListPlus className="h-3 w-3 text-primary/80 shrink-0" />
                <span className="text-[11px] font-medium text-foreground/85 truncate flex-1">
                  Add to outstanding items on {dealName || 'deal'}?
                </span>
                <Badge variant="secondary" className="h-4 text-[9px] px-1.5 shrink-0">
                  new
                </Badge>
              </div>
              <div className="px-3 py-2.5 space-y-2">
                <Row label="Deal" value={dealName || '—'} />
                <Row label="Item" value={s.description} />
                {s.due_date && (
                  <div className="flex items-start gap-2 text-[11px]">
                    <span className="text-muted-foreground/70 w-14 shrink-0">Due</span>
                    <span className="flex-1 text-foreground/90 inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3 text-muted-foreground/70" />
                      {s.due_date}
                    </span>
                  </div>
                )}
                {s.priority && s.priority !== 'normal' && (
                  <Row label="Priority" value={s.priority} />
                )}
                {s.source_quote && (
                  <div className="text-[11px] text-muted-foreground/85 italic leading-snug border-l-2 border-white/[0.08] pl-2 mt-1">
                    "{s.source_quote}"
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    disabled={!!working[dismissKey]}
                    onClick={() => handleAddNewItem(s, idx)}
                  >
                    {working[dismissKey] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ListPlus className="h-3 w-3" />
                    )}
                    Add item
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] gap-1 text-muted-foreground"
                    onClick={() =>
                      setDismissed((d) => {
                        const n = new Set(d);
                        n.add(dismissKey);
                        return n;
                      })
                    }
                  >
                    <X className="h-3 w-3" /> Dismiss
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AiResultNewItemBound = {
  description: string;
  due_date: string | null;
  source_quote: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  confidence: 'low' | 'medium' | 'high';
};

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
